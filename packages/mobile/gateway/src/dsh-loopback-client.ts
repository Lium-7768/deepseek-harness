import { randomUUID } from 'node:crypto'

interface RpcFailure {
  ok: false
  error: { code: string; message: string; details: unknown }
}

interface RpcSuccess<T> {
  ok: true
  value: T
}

interface RpcResponse<T> {
  type: 'server-response'
  rpcId: string
  result: RpcSuccess<T> | RpcFailure
}

/** Calls the existing DSH API only through its loopback listener. */
export class DshLoopbackClient {
  readonly #baseUrl: URL

  /** @param baseUrl - The loopback URL owned by the desktop DSH runtime. */
  constructor(baseUrl: string) {
    const parsed = new URL(baseUrl)
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      throw new Error('The Mobile Gateway only accepts a loopback DSH URL.')
    }
    this.#baseUrl = parsed
  }

  /** Invokes one allowlisted DSH RPC and returns its business value. */
  async call<T>(method: string, payload: unknown): Promise<T> {
    const rpcId = randomUUID()
    const response = await fetch(new URL(`/api/${method}`, this.#baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: this.#baseUrl.host,
      },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
    })
    if (!response.ok) throw new DshLoopbackError('upstream-unavailable', `DSH returned HTTP ${response.status}.`)
    const message = await response.json() as RpcResponse<T>
    if (message.type !== 'server-response' || message.rpcId !== rpcId) {
      throw new DshLoopbackError('upstream-unavailable', 'DSH returned an invalid RPC response.')
    }
    if (!message.result.ok) throw new DshLoopbackError('upstream-rejected', message.result.error.message)
    return message.result.value
  }

  /** Sends a correlated response to a pending DSH interaction. */
  async respond(message: { rpcId: string; result: unknown }): Promise<unknown> {
    const response = await fetch(new URL('/api/respond', this.#baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: this.#baseUrl.host },
      body: JSON.stringify({ type: 'client-response', ...message }),
    })
    if (!response.ok) throw new DshLoopbackError('upstream-unavailable', `DSH returned HTTP ${response.status}.`)
    const receipt = await response.json() as { accepted?: boolean; reason?: string }
    if (receipt.accepted !== true) throw new DshLoopbackError('upstream-rejected', receipt.reason ?? 'DSH rejected the interaction response.')
    return receipt
  }

  /** Streams validated DSH mux server requests until the caller aborts. */
  async *mux(signal: AbortSignal): AsyncGenerator<{ rpcId: string; payload: Record<string, unknown> }> {
    const response = await fetch(new URL('/api/events.mux', this.#baseUrl), { headers: { host: this.#baseUrl.host }, signal })
    if (!response.ok || response.body === null) throw new DshLoopbackError('upstream-unavailable', `DSH returned HTTP ${response.status}.`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const data = chunk.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('')
          if (data !== '') {
            const envelope = parseMuxEnvelope(data)
            if (envelope !== undefined) yield envelope
          }
          boundary = buffer.indexOf('\n\n')
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
  }
}

function parseMuxEnvelope(data: string): { rpcId: string; payload: Record<string, unknown> } | undefined {
  try {
    const value: unknown = JSON.parse(data)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
    const record = value as Record<string, unknown>
    if (record.type !== 'server-request' || typeof record.rpcId !== 'string') return undefined
    if (record.payload === null || typeof record.payload !== 'object' || Array.isArray(record.payload)) return undefined
    return { rpcId: record.rpcId, payload: record.payload as Record<string, unknown> }
  } catch {
    return undefined
  }
}

/** An upstream DSH fault translated to a Mobile Gateway-safe error. */
export class DshLoopbackError extends Error {
  readonly code: 'upstream-unavailable' | 'upstream-rejected'

  /** @param code - Mobile error category. @param message - Safe operator message. */
  constructor(code: DshLoopbackError['code'], message: string) {
    super(message)
    this.code = code
  }
}
