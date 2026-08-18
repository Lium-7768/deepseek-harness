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
const MAX_BODY_BYTES = 256 * 1024

type PendingInteraction = {
  rpcId: string
  type: 'approval/requested' | 'question/requested'
  sessionId: string
  payload: Record<string, unknown>
  receivedAt: string
}

type DshHistory = {
  events?: Array<{ event?: Record<string, unknown> }>
}
type DshSessionSummary = { sessionId: string; title?: string; [key: string]: unknown }
type DshSessionList = { items?: DshSessionSummary[]; [key: string]: unknown }
type DshWorkspace = { workspaceId: string; title?: string; path?: string; sessionIds?: string[] }
type DshWorkspaceList = { items?: DshWorkspace[]; archivedSessionIds?: string[] }
type MobileHistoryItem = { seq?: number; event: Record<string, unknown> }

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
  readonly #pending = new Map<string, PendingInteraction>()

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
    this.#pending.clear()
    if (server === undefined) return
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error === undefined ? resolve() : reject(error))),
    )
  }

  /** Creates a credential after a desktop pairing flow confirms the device label. */
  pairDevice(label: string): MobileDeviceCredential {
    return this.#devices.create(label)
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
    const device = this.#devices.authenticate(request.headers.authorization)
    if (device === undefined) {
      writeError(response, { code: 'unauthorized', message: '需要已配对的移动设备凭据。' })
      return
    }
    if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') {
      writeError(response, { code: 'bad-request', message: '移动端 API 请求必须使用 JSON POST。' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://mobile-gateway.local')
    const body = await readJson(request)
    const pending = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/interactions$/)
    if (pending !== null) {
      this.#startMux()
      const sessionId = decodePathSegment(pending)
      const items = [...this.#pending.values()].filter(item => item.sessionId === sessionId)
      writeJson(response, 200, await this.#response({ items }))
      return
    }
    if (url.pathname === '/v1/sessions/list') {
      const [summary, workspaceList] = await Promise.all([
        this.#dsh.call<DshSessionList>('session.list', {}),
        this.#dsh.call<DshWorkspaceList>('workspace.list', {}),
      ])
      const items = await Promise.all((summary.items ?? []).map(item => withVisibleTitle(this.#dsh, item)))
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
    const history = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/history$/)
    if (history !== null) {
      const value = await this.#dsh.call<DshHistory>('session.history', { sessionId: decodePathSegment(history) })
      writeJson(response, 200, await this.#response({ ...value, items: toMobileHistoryItems(value) }))
      return
    }
    const events = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/events$/)
    if (events !== null) {
      const since = typeof body.since === 'number' && Number.isInteger(body.since) && body.since >= 0 ? body.since : 0
      const sessionId = decodePathSegment(events)
      const history = await this.#dsh.call<DshHistory>('session.history', { sessionId })
      const items = toMobileHistoryItems(history).filter(item => typeof item.seq !== 'number' || item.seq > since)
      const status = [...this.#pending.values()].some(item => item.sessionId === sessionId)
        ? 'waiting'
        : inferSessionStatus(items)
      writeJson(response, 200, await this.#response({ since, items, status }))
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
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (text.length === 0 || text.length > 100_000)
        throw new GatewayHttpError('bad-request', '消息长度必须在 1 到 100000 个字符之间。')
      writeJson(
        response,
        200,
        await this.#response(
          await this.#dsh.call('session.prompt', {
            sessionId: decodePathSegment(prompt),
            mode: 'queue',
            content: [{ type: 'text', text }],
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

  async #captureMux(controller: AbortController): Promise<void> {
    try {
      for await (const envelope of this.#dsh.mux(controller.signal)) this.#rememberInteraction(envelope)
    } catch (error) {
      if (!controller.signal.aborted) console.error('[mobile-gateway] DSH mux subscription ended:', error)
    } finally {
      if (this.#muxAbort === controller) this.#muxAbort = undefined
    }
  }

  #rememberInteraction(envelope: { rpcId: string; payload: Record<string, unknown> }): void {
    const { payload } = envelope
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined
    if (payload.type === 'approval/requested' && sessionId !== undefined && typeof payload.approvalId === 'string') {
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

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

function writeError(response: ServerResponse, error: MobileGatewayError): void {
  const status =
    error.code === 'unauthorized'
      ? 401
      : error.code === 'not-found' || error.code === 'session-not-found'
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
    return [{ ...(seq === undefined ? {} : { seq }), event }]
  })
}

function decodePathSegment(match: RegExpMatchArray): string {
  const segment = match[1]
  if (segment === undefined) throw new GatewayHttpError('bad-request', '会话路径无效。')
  return decodeURIComponent(segment)
}

function isExpectedInteractionResponse(interaction: PendingInteraction, result: unknown): boolean {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return false
  const response = result as Record<string, unknown>
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

function inferSessionStatus(items: Array<{ event?: Record<string, unknown> }>): 'running' | 'waiting' | 'idle' {
  const last = items.at(-1)?.event
  if (last?.type === 'approval/requested' || last?.type === 'question/requested') return 'waiting'
  if (last?.type === 'host/session-status' && last.running === true) return 'running'
  return 'idle'
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
async function withVisibleTitle(client: DshLoopbackClient, item: DshSessionSummary): Promise<DshSessionSummary> {
  if (!isFallbackSessionTitle(item.title)) return item
  try {
    const history = await client.call<DshHistory>('session.history', { sessionId: item.sessionId })
    const title = firstVisibleUserText(history)
    return title === undefined ? item : { ...item, title }
  } catch {
    return item
  }
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
