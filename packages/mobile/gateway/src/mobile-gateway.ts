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
      await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
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
    await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
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
      writeError(response, { code: 'unauthorized', message: 'A paired mobile device credential is required.' })
      return
    }
    if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') {
      writeError(response, { code: 'bad-request', message: 'Mobile API requests must be JSON POST requests.' })
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
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.list', {})))
      return
    }
    const history = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/history$/)
    if (history !== null) {
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.history', { sessionId: decodePathSegment(history) })))
      return
    }
    const events = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/events$/)
    if (events !== null) {
      const since = typeof body.since === 'number' && Number.isInteger(body.since) && body.since >= 0 ? body.since : 0
      const sessionId = decodePathSegment(events)
      const history = await this.#dsh.call<{ items?: Array<{ seq?: number; event?: Record<string, unknown> }> }>('session.history', { sessionId })
      const items = (history.items ?? []).filter(item => typeof item.seq !== 'number' || item.seq > since)
      const status = [...this.#pending.values()].some(item => item.sessionId === sessionId) ? 'waiting' : inferSessionStatus(items)
      writeJson(response, 200, await this.#response({ since, items, status }))
      return
    }
    const prompt = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/messages$/)
    if (prompt !== null) {
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (text.length === 0 || text.length > 100_000) throw new GatewayHttpError('bad-request', 'A message must contain between 1 and 100000 characters.')
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.prompt', {
        sessionId: decodePathSegment(prompt),
        mode: 'queue',
        content: [{ type: 'text', text }],
      })))
      return
    }
    const cancellation = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/cancel$/)
    if (cancellation !== null) {
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.cancel', { sessionId: decodePathSegment(cancellation) })))
      return
    }
    if (url.pathname === '/v1/interactions/respond') {
      const rpcId = typeof body.rpcId === 'string' ? body.rpcId : ''
      const interaction = this.#pending.get(rpcId)

      if (interaction === undefined || !isExpectedInteractionResponse(interaction, body.result)) {
        throw new GatewayHttpError('bad-request', 'The interaction response does not match a current approval or question request.')
      }
      const receipt = await this.#dsh.respond({ rpcId, result: body.result })
      this.#pending.delete(rpcId)
      writeJson(response, 200, await this.#response(receipt))
      return
    }
    writeError(response, { code: 'not-found', message: 'The requested mobile operation is not available.' })
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
      this.#pending.set(envelope.rpcId, { rpcId: envelope.rpcId, type: 'approval/requested', sessionId, payload, receivedAt: new Date().toISOString() })
    } else if (payload.type === 'question/requested' && sessionId !== undefined && Array.isArray(payload.questions)) {
      this.#pending.set(envelope.rpcId, { rpcId: envelope.rpcId, type: 'question/requested', sessionId, payload, receivedAt: new Date().toISOString() })
    } else if (payload.type === 'approval/resolved' && typeof payload.approvalId === 'string') {
      for (const [rpcId, item] of this.#pending) if (item.payload.approvalId === payload.approvalId) this.#pending.delete(rpcId)
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
    if (total > MAX_BODY_BYTES) throw new GatewayHttpError('bad-request', 'The request body is too large.')
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('not an object')
    return parsed as Record<string, unknown>
  } catch {
    throw new GatewayHttpError('bad-request', 'The request body must be a JSON object.')
  }
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

function writeError(response: ServerResponse, error: MobileGatewayError): void {
  const status = error.code === 'unauthorized' ? 401 : error.code === 'not-found' ? 404 : error.code === 'bad-request' ? 400 : 502
  writeJson(response, status, { error })
}

function decodePathSegment(match: RegExpMatchArray): string {
  const segment = match[1]
  if (segment === undefined) throw new GatewayHttpError('bad-request', 'The session path is invalid.')
  return decodeURIComponent(segment)
}

function isExpectedInteractionResponse(interaction: PendingInteraction, result: unknown): boolean {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return false
  const response = result as Record<string, unknown>
  if (response.ok !== true || response.value === null || typeof response.value !== 'object' || Array.isArray(response.value)) return false
  const value = response.value as Record<string, unknown>
  if (interaction.type === 'approval/requested') {
    return value.sessionId === interaction.sessionId && value.approvalId === interaction.payload.approvalId && (value.outcome === 'allowed-once' || value.outcome === 'rejected')
  }
  if (value.sessionId !== interaction.sessionId || value.answer === null || typeof value.answer !== 'object' || Array.isArray(value.answer)) return false
  const answers = (value.answer as Record<string, unknown>).answers
  if (!Array.isArray(answers) || answers.length !== (interaction.payload.questions as unknown[]).length) return false
  const expectedIds = new Set((interaction.payload.questions as Array<{ id?: unknown }>).map(question => question.id).filter((id): id is string => typeof id === 'string'))
  return expectedIds.size === answers.length && answers.every((answer) => {
    if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return false
    const item = answer as Record<string, unknown>
    return typeof item.id === 'string' && expectedIds.delete(item.id) && Array.isArray(item.selected) && item.selected.every(selected => typeof selected === 'string') && (item.custom === undefined || typeof item.custom === 'string')
  })
}

function inferSessionStatus(items: Array<{ event?: Record<string, unknown> }>): 'running' | 'waiting' | 'idle' {
  const last = items.at(-1)?.event
  if (last?.type === 'approval/requested' || last?.type === 'question/requested') return 'waiting'
  if (last?.type === 'host/session-status' && last.running === true) return 'running'
  return 'idle'
}

function toGatewayError(error: unknown): MobileGatewayError {
  if (error instanceof GatewayHttpError) return { code: error.code, message: error.message }
  if (error instanceof DshLoopbackError) return { code: error.code, message: error.message }
  return { code: 'upstream-unavailable', message: 'The local DeepSeek Harness runtime is unavailable.' }
}
