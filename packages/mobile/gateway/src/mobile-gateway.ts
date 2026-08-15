import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { DshLoopbackClient, DshLoopbackError } from './dsh-loopback-client.ts'
import { MobileDeviceRegistry } from './device-registry.ts'
import type { MobileDevice, MobileDeviceCredential, MobileGatewayError, MobileResponse } from './types.ts'

export interface MobileGatewayOptions {
  dshUrl: string
  host?: string
  port?: number
}

export interface MobileGatewayStatus {
  url: string
}

const LOOPBACK_HOST = '127.0.0.1'
const MAX_BODY_BYTES = 256 * 1024

/** Provides a narrow HTTP API for paired native clients over one local DSH runtime. */
export class MobileGateway {
  readonly #dsh: DshLoopbackClient
  readonly #devices = new MobileDeviceRegistry()
  readonly #host: string
  readonly #port: number
  #server: Server | undefined
  #status: MobileGatewayStatus | undefined

  /** @param options - Loopback DSH and local listener configuration. */
  constructor(options: MobileGatewayOptions) {
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
    return status
  }

  /** Stops the listener and waits until no request handler remains active. */
  async stop(): Promise<void> {
    const server = this.#server
    this.#server = undefined
    this.#status = undefined
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
    if (url.pathname === '/v1/sessions/list') {
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.list', {})))
      return
    }
    const history = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/history$/)
    if (history !== null) {
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.history', { sessionId: decodeURIComponent(history[1]) })))
      return
    }
    const prompt = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/messages$/)
    if (prompt !== null) {
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (text.length === 0 || text.length > 100_000) throw new GatewayHttpError('bad-request', 'A message must contain between 1 and 100000 characters.')
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.prompt', {
        sessionId: decodeURIComponent(prompt[1]),
        mode: 'queue',
        content: [{ type: 'text', text }],
      })))
      return
    }
    const cancellation = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/cancel$/)
    if (cancellation !== null) {
      writeJson(response, 200, await this.#response(await this.#dsh.call('session.cancel', { sessionId: decodeURIComponent(cancellation[1]) })))
      return
    }
    writeError(response, { code: 'not-found', message: 'The requested mobile operation is not available.' })
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

function toGatewayError(error: unknown): MobileGatewayError {
  if (error instanceof GatewayHttpError) return { code: error.code, message: error.message }
  if (error instanceof DshLoopbackError) return { code: error.code, message: error.message }
  return { code: 'upstream-unavailable', message: 'The local DeepSeek Harness runtime is unavailable.' }
}
