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
