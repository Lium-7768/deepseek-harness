import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { DshLoopbackClient, DshLoopbackError } from './dsh-loopback-client.ts'
import { MobileDeviceRegistry } from './device-registry.ts'
import type { MobileDevice, MobileDeviceCredential, MobileGatewayError, MobileResponse } from './types.ts'

export interface MobileGatewayOptions {
  dshUrl: string
  devices?: MobileDeviceRegistry
  host?: string
  port?: number
}

export interface MobileGatewayStatus {
  url: string
}

const LOOPBACK_HOST = '127.0.0.1'
// Supports up to four compressed image blocks while still bounding one paired-device request.
const MAX_BODY_BYTES = 12 * 1024 * 1024
const MAX_PROMPT_IMAGES = 4
const MAX_PROMPT_TEXT_CHARS = 100_000
const MAX_IMAGE_BASE64_CHARS = 3 * 1024 * 1024
const MAX_SESSION_SEARCH_CHARS = 500
const IMAGE_MEDIA_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
const PAIRING_TTL_MS = 5 * 60 * 1_000

type PendingPairing = {
  label: string
  secretHash: Uint8Array
  expiresAt: number
}

type PendingInteraction = {
  rpcId: string
  type: 'approval/requested' | 'question/requested'
  sessionId: string
  payload: Record<string, unknown>
  receivedAt: string
}

type DshHistory = {
  events?: Array<{ event?: Record<string, unknown>; view?: unknown }>
  hasMore?: boolean
  projections?: unknown
}
type DshSessionSummary = { sessionId: string; title?: string; running?: boolean; [key: string]: unknown }
type DshSessionList = { items?: DshSessionSummary[]; [key: string]: unknown }
type DshWorkspace = { workspaceId: string; title?: string; path?: string; sessionIds?: string[] }
type DshWorkspaceList = { items?: DshWorkspace[]; archivedSessionIds?: string[] }
type DshSubagentHistory = DshHistory
type MobileHistoryItem = { seq?: number; event: Record<string, unknown> }
type MobileStreamEvent = {
  contractVersion: 1
  eventId: string
  type: string
  payload: Record<string, unknown>
  rpcId?: string
  sessionId?: string
  seq?: number
  snapshot?: true
}

const MOBILE_WRITABLE_SETTINGS = new Set(['ui-theme', 'locale', 'ui-conversation', 'agent-presets', 'permission'])

/** Provides a narrow HTTP API for paired native clients over one local DSH runtime. */
export class MobileGateway {
  readonly #dsh: DshLoopbackClient
  readonly #devices: MobileDeviceRegistry
  readonly #host: string
  readonly #port: number
  #server: Server | undefined
  #status: MobileGatewayStatus | undefined
  #muxAbort: AbortController | undefined
  #muxRetry: ReturnType<typeof setTimeout> | undefined
  #hostAbort: AbortController | undefined
  #hostRetry: ReturnType<typeof setTimeout> | undefined
  #nextEventId = 0
  #eventHeartbeat: ReturnType<typeof setInterval> | undefined
  readonly #eventClients = new Set<ServerResponse>()
  readonly #pairings = new Map<string, PendingPairing>()
  readonly #pending = new Map<string, PendingInteraction>()
  // `session/queue` is an authoritative transient mux snapshot. It is never
  // reconstructed from durable history or written back by the mobile client.
  readonly #queues = new Map<string, unknown[]>()
  // `session/jobs` is an authoritative transient mux snapshot. It is exposed
  // read-only and never reconstructed from the durable session log.
  readonly #jobs = new Map<string, unknown[]>()

  /** @param options - Loopback DSH and local listener configuration. */
  constructor(options: MobileGatewayOptions) {
    this.#devices = options.devices ?? new MobileDeviceRegistry()
    this.#dsh = new DshLoopbackClient(options.dshUrl)
    this.#host = options.host ?? LOOPBACK_HOST
    this.#port = options.port ?? 0
    if (this.#host !== LOOPBACK_HOST && this.#host !== 'localhost') {
      throw new Error('The Mobile Gateway only permits a loopback listener.')
    }
  }

  /** Starts the loopback HTTP listener once. */
  async start(): Promise<MobileGatewayStatus> {
    if (this.#status !== undefined) return this.#status
    const server = createServer((request, response) => {
      void this.#handle(request, response).catch((error) => {
        writeError(response, toGatewayError(error))
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.#port, this.#host, () => resolve())
    })
    const address = server.address()
    if (address === null || typeof address === 'string') {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error === undefined ? resolve() : reject(error))),
      )
      throw new Error('The Mobile Gateway did not receive a TCP listener address.')
    }
    this.#server = server
    const status = { url: `http://${this.#host}:${address.port}` }
    this.#status = status
    this.#startMux()
    return status
  }

  /** Stops the listener and waits until no request handler remains active. */
  async stop(): Promise<void> {
    const server = this.#server
    this.#server = undefined
    this.#status = undefined
    this.#muxAbort?.abort()
    this.#muxAbort = undefined
    if (this.#muxRetry !== undefined) clearTimeout(this.#muxRetry)
    this.#muxRetry = undefined
    this.#hostAbort?.abort()
    this.#hostAbort = undefined
    if (this.#hostRetry !== undefined) clearTimeout(this.#hostRetry)
    this.#hostRetry = undefined
    for (const client of this.#eventClients) client.end()
    this.#eventClients.clear()
    this.#stopEventHeartbeat()
    this.#pairings.clear()
    this.#pending.clear()
    this.#queues.clear()
    this.#jobs.clear()
    if (server === undefined) return
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error === undefined ? resolve() : reject(error))),
    )
  }

  /** Creates a credential after a desktop pairing flow confirms the device label. */
  pairDevice(label: string): MobileDeviceCredential {
    return this.#devices.create(label)
  }

  /** Creates a short-lived, single-use secret that a mobile QR scan exchanges for a device credential. */
  createPairing(label: string): { pairingId: string; pairingSecret: string; expiresAt: string } {
    const normalizedLabel = label.trim()
    if (normalizedLabel.length === 0 || normalizedLabel.length > 120)
      throw new Error('A paired device label must contain between 1 and 120 characters.')
    this.#prunePairings()
    const pairingId = randomBytes(18).toString('base64url')
    const pairingSecret = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + PAIRING_TTL_MS
    this.#pairings.set(pairingId, { label: normalizedLabel, secretHash: pairingSecretHash(pairingSecret), expiresAt })
    return { pairingId, pairingSecret, expiresAt: new Date(expiresAt).toISOString() }
  }

  /** Exchanges one unexpired pairing secret for a durable paired-device credential. */
  redeemPairing(pairingId: string, pairingSecret: string): MobileDeviceCredential {
    this.#prunePairings()
    const pairing = this.#pairings.get(pairingId)
    if (pairing === undefined) throw new GatewayHttpError('pairing-not-found', '配对码无效或已被使用，请重新扫描桌面端二维码。')
    const candidate = pairingSecretHash(pairingSecret)
    if (candidate.byteLength !== pairing.secretHash.byteLength || !timingSafeEqual(candidate, pairing.secretHash))
      throw new GatewayHttpError('unauthorized', '配对码无效，请重新扫描桌面端二维码。')
    this.#pairings.delete(pairingId)
    return this.#devices.create(pairing.label)
  }

  /** Lists paired devices for the desktop settings surface. */
  pairedDevices(): readonly MobileDevice[] {
    return this.#devices.list()
  }

  /** Revokes a paired device immediately. */
  revokeDevice(deviceId: string): boolean {
    return this.#devices.revoke(deviceId)
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method === 'GET' && request.url === '/v1/health') {
      writeJson(response, 200, { contractVersion: 1, status: 'ok' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://mobile-gateway.local')
    if (request.method === 'POST' && url.pathname === '/v1/pairing/redeem') {
      if (request.headers['content-type'] !== 'application/json')
        throw new GatewayHttpError('bad-request', '配对请求必须使用 JSON。')
      const body = await readJson(request)
      const pairingId = requireText(body.pairingId, '缺少配对标识。')
      const pairingSecret = requireText(body.pairingSecret, '缺少配对密钥。')
      writeJson(response, 200, await this.#response(this.redeemPairing(pairingId, pairingSecret)))
      return
    }
    const device = this.#devices.authenticate(request.headers.authorization)
    if (device === undefined) {
      writeError(response, { code: 'unauthorized', message: '需要已配对的移动设备凭据。' })
      return
    }
    if (request.method === 'GET' && url.pathname === '/v1/events') {
      this.#startMux()
      this.#startHost()
      this.#openEventStream(response)
      return
    }
    if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') {
      writeError(response, { code: 'bad-request', message: '移动端 API 请求必须使用 JSON POST。' })
      return
    }
    const body = await readJson(request)
    const pending = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/interactions$/)
    if (pending !== null) {
      this.#startMux()
      const sessionId = decodePathSegment(pending)
      const items = [...this.#pending.values()].filter(item => item.sessionId === sessionId)
      writeJson(response, 200, await this.#response({ items }))
      return
    }
    if (url.pathname === '/v1/sessions/search') {
      const query = requireText(body.query, '搜索词不能为空。')
      if (query.length > MAX_SESSION_SEARCH_CHARS || query.includes('\0'))
        throw new GatewayHttpError('bad-request', '搜索词无效或过长。')
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.search', { query })))
      return
    }
    if (url.pathname === '/v1/sessions/list') {
      const [summary, workspaceList] = await Promise.all([
        this.#dsh.call<DshSessionList>('session.list', {}),
        this.#dsh.call<DshWorkspaceList>('workspace.list', {}),
      ])
      const items = await Promise.all((summary.items ?? []).map(item => withVisibleSessionMetadata(this.#dsh, item)))
      writeJson(
        response,
        200,
        await this.#response({
          ...summary,
          items,
          workspaces: mobileWorkspaces(workspaceList.items ?? []),
          archivedSessionIds: workspaceList.archivedSessionIds ?? [],
        }),
      )
      return
    }
    if (url.pathname === '/v1/sessions/create') {
      const workspaceId = optionalText(body.workspaceId)
      const cwd = optionalText(body.cwd)
      if (workspaceId !== undefined && cwd !== undefined)
        throw new GatewayHttpError('bad-request', '新会话只能指定工作区或目录。')
      const agentPreset = optionalText(body.agentPreset)
      writeJson(
        response,
        200,
        await this.#response(
          await this.#dsh.call('session.create', {
            ...(workspaceId === undefined ? {} : { workspaceId }),
            ...(cwd === undefined ? {} : { cwd }),
            ...(agentPreset === undefined ? {} : { agentPreset }),
          }),
        ),
      )
      return
    }
    if (url.pathname === '/v1/settings/describe') {
      writeJson(response, 200, await this.#response(await this.#dsh.call('settings.describe', {})))
      return
    }
    if (url.pathname === '/v1/settings/update') {
      const ns = requireText(body.ns, '设置命名空间不能为空。')
      if (!MOBILE_WRITABLE_SETTINGS.has(ns)) throw new GatewayHttpError('bad-request', '此设置只能在桌面端修改。')
      const patch = requireObject(body.patch, '设置修改必须是 JSON 对象。')
      const expectedRevision = optionalRevision(body.expectedRevision)
      writeJson(
        response,
        200,
        await this.#response(
          await this.#dsh.call('settings.update', {
            ns,
            patch,
            ...(expectedRevision === undefined ? {} : { expectedRevision }),
          }),
        ),
      )
      return
    }
    if (url.pathname === '/v1/settings/mutate') {
      const ns = requireText(body.ns, '设置命名空间不能为空。')
      if (!MOBILE_WRITABLE_SETTINGS.has(ns)) throw new GatewayHttpError('bad-request', '此设置只能在桌面端修改。')
      const ops = requireArray(body.ops, '设置修改操作必须是数组。')
      const expectedRevision = optionalRevision(body.expectedRevision)
      writeJson(
        response,
        200,
        await this.#dsh.call('settings.mutate', {
          ns,
          ops,
          ...(expectedRevision === undefined ? {} : { expectedRevision }),
        }),
      )
      return
    }
    if (url.pathname === '/v1/llm/providers') {
      writeJson(response, 200, await this.#response(await this.#dsh.call('llm.providers', {})))
      return
    }
    if (url.pathname === '/v1/llm/models') {
      writeJson(response, 200, await this.#response(await this.#dsh.call('llm.models', {})))
      return
    }
    if (url.pathname === '/v1/agent-presets/list') {
      writeJson(response, 200, await this.#response(await this.#dsh.call('agentPreset.list', {})))
      return
    }
    if (url.pathname === '/v1/agent-presets/read') {
      const agentPreset = requireText(body.agentPreset, 'Agent 预设不能为空。')
      writeJson(response, 200, await this.#response(await this.#dsh.call('agentPreset.read', { agentPreset })))
      return
    }
    const queueSnapshot = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/queue$/)
    if (queueSnapshot !== null) {
      const sessionId = decodePathSegment(queueSnapshot)
      writeJson(response, 200, await this.#response({ items: this.#queues.get(sessionId) ?? [] }))
      return
    }
    const jobs = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/jobs$/)
    if (jobs !== null) {
      this.#startMux()
      const sessionId = decodePathSegment(jobs)
      writeJson(response, 200, await this.#response({ items: this.#jobs.get(sessionId) ?? [] }))
      return
    }
    const subagentHistory = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/subagents\/([^/]+)\/history$/)
    if (subagentHistory !== null) {
      const parentSessionId = decodePathSegment(subagentHistory)
      const childSessionId = decodePathSegmentAt(subagentHistory, 2, '子 Agent 路径无效。')
      const mode = requireSubagentMode(body.mode)
      const beforeSeq = optionalNonnegativeInteger(body.beforeSeq, '历史游标必须是非负整数。')
      const maxMessages = optionalPositiveInteger(body.maxMessages, '历史消息数量必须是正整数。')
      const value = await this.#dsh.call<DshSubagentHistory>('subagent.history', {
        parentSessionId,
        childSessionId,
        mode,
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
        ...(maxMessages === undefined ? {} : { maxMessages }),
      })
      writeJson(response, 200, await this.#response({ ...value, items: toMobileHistoryItems(value) }))
      return
    }
    const promptSubagent = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/subagents\/([^/]+)\/messages$/)
    if (promptSubagent !== null) {
      const parentSessionId = decodePathSegment(promptSubagent)
      const childSessionId = decodePathSegmentAt(promptSubagent, 2, '子 Agent 路径无效。')
      if (requireSubagentMode(body.mode) !== 'continuable')
        throw new GatewayHttpError('bad-request', '只有可继续的子 Agent 可以接收消息。')
      const content = readPromptContent(body)
      writeJson(
        response,
        200,
        await this.#response(await this.#dsh.call('subagent.prompt', { parentSessionId, childSessionId, mode: 'continuable', content })),
      )
      return
    }
    const interruptSubagent = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/subagents\/([^/]+)\/interrupt$/)
    if (interruptSubagent !== null) {
      const parentSessionId = decodePathSegment(interruptSubagent)
      const childSessionId = decodePathSegmentAt(interruptSubagent, 2, '子 Agent 路径无效。')
      if (requireSubagentMode(body.mode) !== 'continuable')
        throw new GatewayHttpError('bad-request', '只有可继续的子 Agent 可以停止。')
      writeJson(
        response,
        200,
        await this.#response(await this.#dsh.call('subagent.interrupt', { parentSessionId, childSessionId, mode: 'continuable' })),
      )
      return
    }
    const subagents = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/subagents$/)
    if (subagents !== null) {
      const parentSessionId = decodePathSegment(subagents)
      writeJson(response, 200, await this.#response(await this.#dsh.call('subagent.list', { parentSessionId })))
      return
    }
    const goal = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/goal\/(edit|pause|resume|clear)$/)
    if (goal !== null) {
      const sessionId = decodePathSegment(goal)
      const action = goal[2]
      const ref = requireGoalRef(body.ref)
      if (action === 'edit') {
        const objective = requireText(body.objective, '目标内容不能为空。')
        writeJson(response, 200, await this.#response(await this.#dsh.call('goal.edit', { sessionId, ref, objective })))
        return
      }
      if (action === 'pause' || action === 'resume' || action === 'clear') {
        writeJson(response, 200, await this.#response(await this.#dsh.call(`goal.${action}`, { sessionId, ref })))
        return
      }
      throw new GatewayHttpError('not-found', '未找到请求的移动端操作。')
    }
    const renameWorkspace = url.pathname.match(/^\/v1\/workspaces\/([^/]+)\/rename$/)
    if (renameWorkspace !== null) {
      const title = requireText(body.title, '工作区名称不能为空。')
      writeJson(
        response,
        200,
        await this.#response(
          await this.#dsh.call('workspace.rename', { workspaceId: decodePathSegment(renameWorkspace), title }),
        ),
      )
      return
    }
    const deleteWorkspace = url.pathname.match(/^\/v1\/workspaces\/([^/]+)\/delete$/)
    if (deleteWorkspace !== null) {
      writeJson(
        response,
        200,
        await this.#response(await this.#dsh.call('workspace.delete', { workspaceId: decodePathSegment(deleteWorkspace) })),
      )
      return
    }
    const history = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/history$/)
    if (history !== null) {
      const beforeSeq = optionalNonnegativeInteger(body.beforeSeq, '历史游标必须是非负整数。')
      const maxMessages = optionalPositiveInteger(body.maxMessages, '历史消息数量必须是正整数。')
      const value = await this.#dsh.call<DshHistory>('session.history', {
        sessionId: decodePathSegment(history),
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
        ...(maxMessages === undefined ? {} : { maxMessages }),
      })
      writeJson(response, 200, await this.#response({ ...value, items: toMobileHistoryItems(value) }))
      return
    }
    const events = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/events$/)
    if (events !== null) {
      const since = typeof body.since === 'number' && Number.isInteger(body.since) && body.since >= 0 ? body.since : 0
      const sessionId = decodePathSegment(events)
      const [history, summary] = await Promise.all([
        this.#dsh.call<DshHistory>('session.history', { sessionId }),
        this.#dsh.call<DshSessionList>('session.list', {}),
      ])
      const items = toMobileHistoryItems(history).filter(item => typeof item.seq !== 'number' || item.seq > since)
      const running = summary.items?.some(item => item.sessionId === sessionId && item.running === true) === true
      const status = [...this.#pending.values()].some(item => item.sessionId === sessionId)
        ? 'waiting'
        : running ? 'running' : inferSessionStatus(items)
      writeJson(response, 200, await this.#response({ since, items, status }))
      return
    }
    const rename = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/rename$/)
    if (rename !== null) {
      const title = requireText(body.title, '会话标题不能为空。')
      writeJson(
        response,
        200,
        await this.#response(
          await this.#dsh.call('session.rename', { sessionId: decodePathSegment(rename), title }),
        ),
      )
      return
    }
    const fork = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/fork$/)
    if (fork !== null) {
      const atSeq = optionalNonnegativeInteger(body.atSeq, '分叉位置必须是非负整数。')
      writeJson(
        response,
        200,
        await this.#response(
          await this.#dsh.call('session.fork', {
            sessionId: decodePathSegment(fork),
            ...(atSeq === undefined ? {} : { atSeq }),
          }),
        ),
      )
      return
    }
    const archive = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/archive$/)
    if (archive !== null) {
      writeJson(
        response,
        200,
        await this.#response(await this.#dsh.call('workspace.archiveSession', { sessionId: decodePathSegment(archive) })),
      )
      return
    }
    const attachment = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/attachments\/([^/]+)$/)
    if (attachment !== null) {
      const sessionId = decodeURIComponent(attachment[1] ?? '')
      const attachmentId = decodeURIComponent(attachment[2] ?? '')
      if (sessionId === '' || attachmentId === '') throw new GatewayHttpError('bad-request', '附件路径无效。')
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.attachment', { sessionId, attachmentId })))
      return
    }
    const updateQueue = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/queue\/([^/]+)$/)
    if (updateQueue !== null) {
      const sessionId = decodeURIComponent(updateQueue[1] ?? '')
      const itemId = decodeURIComponent(updateQueue[2] ?? '')
      if (sessionId === '' || itemId === '') throw new GatewayHttpError('bad-request', '队列路径无效。')
      const action = requireObject(body.action, '队列操作不能为空。')
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.updateQueue', { sessionId, itemId, action })))
      return
    }
    const models = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/models$/)
    if (models !== null) {
      writeJson(
        response,
        200,
        await this.#response(await this.#dsh.call('session.models', { sessionId: decodePathSegment(models) })),
      )
      return
    }
    const selectModel = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/model$/)
    if (selectModel !== null) {
      const provider = requireText(body.provider, '模型提供方不能为空。')
      const model = requireText(body.model, '模型不能为空。')
      const reasoningEffort = optionalText(body.reasoningEffort)
      writeJson(
        response,
        200,
        await this.#response(
          await this.#dsh.call('session.selectModel', {
            sessionId: decodePathSegment(selectModel),
            provider,
            model,
            ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
          }),
        ),
      )
      return
    }
    const selectPreset = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/agent-preset$/)
    if (selectPreset !== null) {
      const agentPreset = requireText(body.agentPreset, 'Agent 预设不能为空。')
      writeJson(
        response,
        200,
        await this.#response(
          await this.#dsh.call('agentPreset.select', { sessionId: decodePathSegment(selectPreset), agentPreset }),
        ),
      )
      return
    }
    const prompt = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/messages$/)
    if (prompt !== null) {
      const content = readPromptContent(body)
      writeJson(
        response,
        200,
        await this.#response(
          await this.#dsh.call('session.prompt', {
            sessionId: decodePathSegment(prompt),
            mode: 'queue',
            content,
          }),
        ),
      )
      return
    }
    const cancellation = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/cancel$/)
    if (cancellation !== null) {
      writeJson(
        response,
        200,
        await this.#response(await this.#dsh.call('session.cancel', { sessionId: decodePathSegment(cancellation) })),
      )
      return
    }
    if (url.pathname === '/v1/interactions/respond') {
      const rpcId = typeof body.rpcId === 'string' ? body.rpcId : ''
      const interaction = this.#pending.get(rpcId)

      if (interaction === undefined || !isExpectedInteractionResponse(interaction, body.result)) {
        throw new GatewayHttpError('bad-request', '响应与当前的权限或问题请求不匹配。')
      }
      const receipt = await this.#dsh.respond({ rpcId, result: body.result })
      this.#pending.delete(rpcId)
      writeJson(response, 200, await this.#response(receipt))
      return
    }
    writeError(response, { code: 'not-found', message: '未找到请求的移动端操作。' })
  }

  #startMux(): void {
    if (this.#muxAbort !== undefined || this.#status === undefined) return
    const controller = new AbortController()
    this.#muxAbort = controller
    void this.#captureMux(controller)
  }

  #startHost(): void {
    if (this.#hostAbort !== undefined || this.#status === undefined) return
    const controller = new AbortController()
    this.#hostAbort = controller
    void this.#captureHost(controller)
  }

  async #captureMux(controller: AbortController): Promise<void> {
    try {
      for await (const envelope of this.#dsh.mux(controller.signal)) {
        this.#rememberInteraction(envelope)
        this.#broadcast('mux', envelope)
      }
    } catch (error) {
      if (!controller.signal.aborted) console.error('[mobile-gateway] DSH mux subscription ended:', error)
    } finally {
      if (this.#muxAbort === controller) {
        this.#muxAbort = undefined
        this.#scheduleStreamRestart('mux', controller.signal.aborted)
      }
    }
  }

  async #captureHost(controller: AbortController): Promise<void> {
    try {
      for await (const envelope of this.#dsh.host(controller.signal)) this.#broadcast('host', envelope)
    } catch (error) {
      if (!controller.signal.aborted) console.error('[mobile-gateway] DSH host subscription ended:', error)
    } finally {
      if (this.#hostAbort === controller) {
        this.#hostAbort = undefined
        this.#scheduleStreamRestart('host', controller.signal.aborted)
      }
    }
  }

  #scheduleStreamRestart(stream: 'host' | 'mux', aborted: boolean): void {
    if (aborted || this.#status === undefined) return
    if (stream === 'mux') {
      if (this.#muxRetry !== undefined) return
      const retry = setTimeout(() => {
        this.#muxRetry = undefined
        this.#startMux()
      }, 1_000)
      retry.unref()
      this.#muxRetry = retry
      return
    }
    if (this.#hostRetry !== undefined || this.#eventClients.size === 0) return
    const retry = setTimeout(() => {
      this.#hostRetry = undefined
      this.#startHost()
    }, 1_000)
    retry.unref()
    this.#hostRetry = retry
  }

  #openEventStream(response: ServerResponse): void {
    response.writeHead(200, {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    })
    this.#eventClients.add(response)
    this.#startEventHeartbeat()
    this.#writeStreamEvent(response, {
      contractVersion: 1,
      eventId: this.#nextStreamEventId(),
      type: 'gateway/ready',
      payload: {},
      snapshot: true,
    })
    response.once('close', () => {
      this.#eventClients.delete(response)
      if (this.#eventClients.size === 0) this.#stopEventHeartbeat()
    })
  }

  #broadcast(
    source: 'host' | 'mux',
    envelope: { rpcId: string; payload: Record<string, unknown> },
  ): void {
    const event = toMobileStreamEvent(source, envelope, this.#nextStreamEventId())
    for (const client of this.#eventClients) this.#writeStreamEvent(client, event)
  }

  #nextStreamEventId(): string {
    this.#nextEventId += 1
    return this.#nextEventId.toString()
  }

  #startEventHeartbeat(): void {
    if (this.#eventHeartbeat !== undefined) return
    const heartbeat = setInterval(() => {
      for (const client of this.#eventClients) client.write(': heartbeat\\n\\n')
    }, 2_500)
    heartbeat.unref()
    this.#eventHeartbeat = heartbeat
  }

  #stopEventHeartbeat(): void {
    if (this.#eventHeartbeat === undefined) return
    clearInterval(this.#eventHeartbeat)
    this.#eventHeartbeat = undefined
  }

  #writeStreamEvent(response: ServerResponse, event: MobileStreamEvent): void {
    response.write(`id: ${event.eventId}\nevent: message\ndata: ${JSON.stringify(event)}\n\n`)
  }

  #prunePairings(): void {
    const now = Date.now()
    for (const [pairingId, pairing] of this.#pairings) {
      if (pairing.expiresAt <= now) this.#pairings.delete(pairingId)
    }
  }

  #rememberInteraction(envelope: { rpcId: string; payload: Record<string, unknown> }): void {
    const { payload } = envelope
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined
    if (payload.type === 'session/subscribed' && sessionId !== undefined) {
      // The host omits a queue baseline for an empty queue, so the subscribed
      // generation boundary must clear any stale cached snapshot first.
      this.#queues.delete(sessionId)
      this.#jobs.delete(sessionId)
    } else if (payload.type === 'session/queue' && sessionId !== undefined && Array.isArray(payload.items)) {
      this.#queues.set(sessionId, payload.items)
    } else if (payload.type === 'session/jobs' && sessionId !== undefined && Array.isArray(payload.jobs)) {
      this.#jobs.set(sessionId, payload.jobs)
    } else if (payload.type === 'approval/requested' && sessionId !== undefined && typeof payload.approvalId === 'string') {
      this.#pending.set(envelope.rpcId, {
        rpcId: envelope.rpcId,
        type: 'approval/requested',
        sessionId,
        payload,
        receivedAt: new Date().toISOString(),
      })
    } else if (payload.type === 'question/requested' && sessionId !== undefined && Array.isArray(payload.questions)) {
      this.#pending.set(envelope.rpcId, {
        rpcId: envelope.rpcId,
        type: 'question/requested',
        sessionId,
        payload,
        receivedAt: new Date().toISOString(),
      })
    } else if (payload.type === 'approval/resolved' && typeof payload.approvalId === 'string') {
      for (const [rpcId, item] of this.#pending)
        if (item.payload.approvalId === payload.approvalId) this.#pending.delete(rpcId)
    } else if (payload.type === 'question/resolved' && typeof payload.questionRpcId === 'string') {
      this.#pending.delete(payload.questionRpcId)
    }
  }

  async #response<T>(data: T): Promise<MobileResponse<T>> {
    return { contractVersion: 1, dshUrl: this.#status?.url ?? '', data }
  }
}

class GatewayHttpError extends Error {
  readonly code: MobileGatewayError['code']

  constructor(code: MobileGatewayError['code'], message: string) {
    super(message)
    this.code = code
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > MAX_BODY_BYTES) throw new GatewayHttpError('bad-request', '请求体过大。')
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('not an object')
    return parsed as Record<string, unknown>
  } catch {
    throw new GatewayHttpError('bad-request', '请求体必须是 JSON 对象。')
  }
}

function pairingSecretHash(value: string): Uint8Array {
  return createHash('sha256').update(value).digest()
}

function toMobileStreamEvent(
  source: 'host' | 'mux',
  envelope: { rpcId: string; payload: Record<string, unknown> },
  eventId: string,
): MobileStreamEvent {
  const { payload } = envelope
  const type = typeof payload.type === 'string' ? payload.type : `${source}/unknown`
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined
  const event = payload.event
  const eventSeq =
    event !== null && typeof event === 'object' && !Array.isArray(event)
      ? (event as Record<string, unknown>).seq
      : undefined
  const durableSeq = typeof eventSeq === 'number' ? eventSeq : typeof payload.seq === 'number' ? payload.seq : undefined
  const snapshot = type === 'session/subscribed' || type === 'session/queue' || type === 'session/jobs'
  return {
    contractVersion: 1,
    eventId,
    type,
    payload,
    ...(source === 'mux' ? { rpcId: envelope.rpcId } : {}),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(durableSeq === undefined ? {} : { seq: durableSeq }),
    ...(snapshot ? { snapshot: true } : {}),
  }
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

function writeError(response: ServerResponse, error: MobileGatewayError): void {
  const status =
    error.code === 'unauthorized'
      ? 401
      : error.code === 'not-found' || error.code === 'session-not-found' || error.code === 'pairing-not-found'
        ? 404
        : error.code === 'settings-conflict'
          ? 409
          : error.code === 'bad-request' || error.code === 'forbidden' || error.code === 'agent-preset-locked'
            ? 400
            : 502
  writeJson(response, status, { error })
}

function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new GatewayHttpError('bad-request', message)
  return value.trim()
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined
  return requireText(value, '设置字段必须是非空字符串。')
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new GatewayHttpError('bad-request', message)
  return value as Record<string, unknown>
}

function requireArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new GatewayHttpError('bad-request', message)
  return value
}

type GatewayPromptContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string; name?: string }

function readPromptContent(body: Record<string, unknown>): GatewayPromptContent[] {
  // Keep the old text body shape for an already-paired app that has not yet
  // updated, while all current native clients use the content-array contract.
  const parts = body.content === undefined ? [{ type: 'text', text: body.text }] : requireArray(body.content, '消息内容必须是数组。')
  if (parts.length === 0 || parts.length > MAX_PROMPT_IMAGES + 1)
    throw new GatewayHttpError('bad-request', `消息最多包含一段文本和 ${MAX_PROMPT_IMAGES} 张图片。`)

  let imageCount = 0
  let textCount = 0
  return parts.map((part, index) => {
    const item = requireObject(part, `第 ${index + 1} 项消息内容无效。`)
    if (item.type === 'text') {
      const text = requireText(item.text, '消息文本不能为空。')
      if (text.length > MAX_PROMPT_TEXT_CHARS)
        throw new GatewayHttpError('bad-request', `消息文本不得超过 ${MAX_PROMPT_TEXT_CHARS} 个字符。`)
      textCount += 1
      if (textCount > 1) throw new GatewayHttpError('bad-request', '一条消息只能包含一段文本。')
      return { type: 'text', text }
    }
    if (item.type === 'image') {
      const mediaType = requireText(item.mediaType, '图片类型不能为空。')
      const data = requireText(item.data, '图片数据不能为空。')
      if (!IMAGE_MEDIA_TYPES.has(mediaType)) throw new GatewayHttpError('bad-request', '图片格式必须为 GIF、JPEG、PNG 或 WebP。')
      if (data.length > MAX_IMAGE_BASE64_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))
        throw new GatewayHttpError('bad-request', '图片数据无效或过大。')
      imageCount += 1
      if (imageCount > MAX_PROMPT_IMAGES) throw new GatewayHttpError('bad-request', `一条消息最多包含 ${MAX_PROMPT_IMAGES} 张图片。`)
      const name = item.name === undefined ? undefined : requireText(item.name, '图片文件名不能为空。')
      if (name !== undefined && name.length > 255) throw new GatewayHttpError('bad-request', '图片文件名过长。')
      return { type: 'image', mediaType, data, ...(name === undefined ? {} : { name }) }
    }
    throw new GatewayHttpError('bad-request', '消息内容类型仅支持文本或图片。')
  })
}

function optionalNonnegativeInteger(value: unknown, message: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new GatewayHttpError('bad-request', message)
  return value
}
function optionalPositiveInteger(value: unknown, message: string): number | undefined {
  if (value === undefined) return undefined
  return requirePositiveInteger(value, message)
}

function requirePositiveInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new GatewayHttpError('bad-request', message)
  return value
}
function optionalRevision(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new GatewayHttpError('bad-request', '设置版本号必须是非负整数。')
  return value
}
function toMobileHistoryItems(history: DshHistory): MobileHistoryItem[] {
  return (history.events ?? []).flatMap((entry) => {
    const event = entry.event
    if (event === undefined) return []
    const seq = typeof event.seq === 'number' && Number.isInteger(event.seq) ? event.seq : undefined
    return [{ ...(seq === undefined ? {} : { seq }), ...(entry.view === undefined ? {} : { view: entry.view }), event }]
  })
}

function decodePathSegment(match: RegExpMatchArray): string {
  return decodePathSegmentAt(match, 1, '会话路径无效。')
}

function decodePathSegmentAt(match: RegExpMatchArray, index: number, message: string): string {
  const segment = match[index]
  if (segment === undefined || segment === '') throw new GatewayHttpError('bad-request', message)
  return decodeURIComponent(segment)
}

function requireGoalRef(value: unknown): { id: string; revision: number } {
  const ref = requireObject(value, '目标版本信息无效。')
  return {
    id: requireText(ref.id, '目标标识不能为空。'),
    revision: requirePositiveInteger(ref.revision, '目标版本必须是正整数。'),
  }
}

function requireSubagentMode(value: unknown): 'one-shot' | 'continuable' {
  if (value === 'one-shot' || value === 'continuable') return value
  throw new GatewayHttpError('bad-request', '子 Agent 模式无效。')
}

function isExpectedInteractionResponse(interaction: PendingInteraction, result: unknown): boolean {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return false
  const response = result as Record<string, unknown>
  if (interaction.type === 'question/requested' && isPlanReviewRequest(interaction.payload.questions) && isPlanReviewCancellation(response))
    return true
  if (
    response.ok !== true ||
    response.value === null ||
    typeof response.value !== 'object' ||
    Array.isArray(response.value)
  )
    return false
  const value = response.value as Record<string, unknown>
  if (interaction.type === 'approval/requested') {
    return (
      value.sessionId === interaction.sessionId &&
      value.approvalId === interaction.payload.approvalId &&
      (value.outcome === 'allowed-once' || value.outcome === 'rejected')
    )
  }
  if (
    value.sessionId !== interaction.sessionId ||
    value.answer === null ||
    typeof value.answer !== 'object' ||
    Array.isArray(value.answer)
  )
    return false
  const answers = (value.answer as Record<string, unknown>).answers
  if (!Array.isArray(answers) || answers.length !== (interaction.payload.questions as unknown[]).length) return false
  const expectedIds = new Set(
    (interaction.payload.questions as Array<{ id?: unknown }>)
      .map(question => question.id)
      .filter((id): id is string => typeof id === 'string'),
  )
  return (
    expectedIds.size === answers.length &&
    answers.every((answer) => {
      if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return false
      const item = answer as Record<string, unknown>
      return (
        typeof item.id === 'string' &&
        expectedIds.delete(item.id) &&
        Array.isArray(item.selected) &&
        item.selected.every(selected => typeof selected === 'string') &&
        (item.custom === undefined || typeof item.custom === 'string')
      )
    })
  )
}

function isPlanReviewRequest(questions: unknown): boolean {
  if (!Array.isArray(questions) || questions.length !== 1) return false
  const question = questions[0]
  if (question === null || typeof question !== 'object' || Array.isArray(question)) return false
  const value = question as Record<string, unknown>
  if (value.detail === undefined || value.multiSelect === true) return false
  const intent = value.intent
  if (intent === null || typeof intent !== 'object' || Array.isArray(intent)) return false
  const approve = (intent as Record<string, unknown>).approve
  if ((intent as Record<string, unknown>).kind !== 'plan-review' || typeof approve !== 'string') return false
  const options = value.options
  if (!Array.isArray(options) || options.length > 2) return false
  return options.some(option => option !== null && typeof option === 'object' && (option as Record<string, unknown>).label === approve)
}

function isPlanReviewCancellation(response: Record<string, unknown>): boolean {
  if (response.ok !== false || response.error === null || typeof response.error !== 'object' || Array.isArray(response.error)) return false
  const error = response.error as Record<string, unknown>
  return error.code === 'cancelled' && typeof error.message === 'string' && error.details !== null && typeof error.details === 'object'
}

function inferSessionStatus(items: Array<{ event?: Record<string, unknown> }>): 'running' | 'waiting' | 'idle' {
  const openTurns = new Set<number>()
  for (const item of items) {
    const event = item.event
    if (event === undefined) continue
    if (event.type === 'approval/requested' || event.type === 'question/requested') return 'waiting'
    const data = event.data !== null && typeof event.data === 'object' && !Array.isArray(event.data)
      ? event.data as Record<string, unknown>
      : event
    const turn = typeof data.turn === 'number' && Number.isInteger(data.turn) ? data.turn : undefined
    if (turn === undefined) continue
    if (event.type === 'turn/start') openTurns.add(turn)
    else if (event.type === 'turn/end' || event.type === 'turn/error') openTurns.delete(turn)
  }
  return openTurns.size > 0 ? 'running' : 'idle'
}

function toGatewayError(error: unknown): MobileGatewayError {
  if (error instanceof GatewayHttpError) return { code: error.code, message: error.message }
  if (error instanceof DshLoopbackError) {
    if (error.code === 'upstream-rejected') return upstreamRejectedError(error.upstreamCode)
    return { code: error.code, message: upstreamMessage(error.code) }
  }
  return { code: 'upstream-unavailable', message: upstreamMessage('upstream-unavailable') }
}

function upstreamRejectedError(code: string | undefined): MobileGatewayError {
  switch (code) {
    case 'session-not-found':
      return { code, message: '未找到请求的会话。' }
    case 'model-unavailable':
      return { code, message: '所选模型当前不可用，请重新选择。' }
    case 'agent-preset-locked':
      return { code, message: '会话已经开始，无法切换 Agent 模式。' }
    case 'agent-preset-not-found':
      return { code, message: '未找到所选 Agent 预设。' }
    case 'agent-preset-invalid':
      return { code, message: '所选 Agent 预设当前不可用。' }
    case 'settings-rejected':
      return { code, message: '设置未被桌面端接受，请检查输入。' }
    case 'settings-conflict':
      return { code, message: '设置已被其他窗口修改，请重新加载后再试。' }
    default:
      return { code: 'upstream-rejected', message: upstreamMessage('upstream-rejected') }
  }
}

function upstreamMessage(code: DshLoopbackError['code']): string {
  return code === 'upstream-rejected' ? '桌面端拒绝了此次请求。' : '桌面端 DeepSeek Harness 当前不可用。'
}
/** Selects the workspace fields required by the mobile drawer's project and session tree. */
function mobileWorkspaces(
  items: readonly DshWorkspace[],
): Array<{ workspaceId: string; title: string; path?: string; sessionIds: string[] }> {
  return items.map(workspace => ({
    workspaceId: workspace.workspaceId,
    title: workspace.title ?? '',
    ...(workspace.path === undefined ? {} : { path: workspace.path }),
    sessionIds: workspace.sessionIds ?? [],
  }))
}

function isFallbackSessionTitle(title: unknown): boolean {
  if (typeof title !== 'string') return true
  const normalized = title.trim().toLowerCase()
  return (
    normalized === '' || normalized === '新会话' || normalized === 'new session' || normalized === 'untitled session'
  )
}
async function withVisibleSessionMetadata(client: DshLoopbackClient, item: DshSessionSummary): Promise<DshSessionSummary> {
  try {
    const history = await client.call<DshHistory>('session.history', { sessionId: item.sessionId })
    const values = sessionProjectionValues(history)
    const projectedTitle = typeof values?.title === 'string' && values.title.trim() !== '' ? values.title : undefined
    const metadata = values?.sessionListMetadata
    const blank = metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).blank
      : undefined
    const fallbackTitle = isFallbackSessionTitle(item.title) ? firstVisibleUserText(history) : undefined
    const title = projectedTitle ?? fallbackTitle
    return {
      ...item,
      ...(title === undefined ? {} : { title }),
      ...(typeof blank === 'boolean' ? { blank } : {}),
    }
  } catch {
    return item
  }
}

/** Returns the desktop-owned session projections when the history response carries a valid value map. */
function sessionProjectionValues(history: DshHistory): Record<string, unknown> | undefined {
  const projections = history.projections
  if (projections === null || typeof projections !== 'object' || Array.isArray(projections)) return undefined
  const values = (projections as Record<string, unknown>).values
  return values !== null && typeof values === 'object' && !Array.isArray(values)
    ? values as Record<string, unknown>
    : undefined
}
function firstVisibleUserText(history: DshHistory): string | undefined {
  for (const entry of history.events ?? []) {
    const event = entry.event
    if (event === undefined || !isUserMessageEvent(event)) continue
    const text = eventDisplayText(event)
    if (text !== undefined && !isInternalMobileText(text)) return text.slice(0, 80)
  }
  return undefined
}
function isUserMessageEvent(event: Record<string, unknown>): boolean {
  const payload =
    event.data !== null && typeof event.data === 'object' && !Array.isArray(event.data)
      ? (event.data as Record<string, unknown>)
      : event
  const role = [payload.role, payload.kind, payload.author].find(value => typeof value === 'string')
  if (typeof role === 'string' && ['user', 'human'].includes(role.toLowerCase())) return true
  const type = typeof event.type === 'string' ? event.type.toLowerCase() : ''
  return type === 'user/message' || type.startsWith('user/')
}
function eventDisplayText(event: Record<string, unknown>): string | undefined {
  const payload =
    event.data !== null && typeof event.data === 'object' && !Array.isArray(event.data)
      ? (event.data as Record<string, unknown>)
      : event
  const direct = textFromContent(payload.content) ?? textFromContent(payload.text)
  if (direct !== undefined) return direct
  const message = payload.message
  if (message !== null && typeof message === 'object' && !Array.isArray(message)) {
    return textFromContent((message as Record<string, unknown>).content)
  }
  return undefined
}
function textFromContent(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!Array.isArray(value)) return undefined
  const parts = value.flatMap((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return []
    const text = (item as Record<string, unknown>).text
    return typeof text === 'string' && text.trim() ? [text.trim()] : []
  })
  return parts.length ? parts.join('\n') : undefined
}
function isInternalMobileText(text: string): boolean {
  const lower = text.toLowerCase()
  return [
    '<system-reminder',
    'agents.md',
    'instructions from:',
    'pre-release stance',
    'reply exactly mobilegatewayok',
  ].some(marker => lower.includes(marker))
}
