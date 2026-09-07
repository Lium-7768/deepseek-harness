import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'

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

  /**
   * Invokes one allowlisted DSH RPC and returns its business value.
   * @param method - Allowlisted DSH RPC method name.
   * @param payload - JSON-serializable request payload forwarded to DSH.
   * @returns The accepted DSH business value.
   * @throws {DshLoopbackError} When DSH is unavailable, returns malformed data, or rejects the RPC.
   */
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
    const message = (await response.json()) as RpcResponse<T>
    if (message.rpcId !== rpcId) {
      throw new DshLoopbackError('upstream-unavailable', 'DSH returned an invalid RPC response.')
    }
    if (!message.result.ok) {
      throw new DshLoopbackError(
        'upstream-rejected',
        message.result.error.message,
        message.result.error.code,
        message.result.error.details,
      )
    }
    return message.result.value
  }

  /**
   * Sends a correlated response to a pending DSH interaction.
   * @param message - Pending RPC identifier and validated interaction result.
   * @returns DSH's acceptance receipt.
   * @throws {DshLoopbackError} When DSH is unavailable or rejects the response.
   */
  async respond(message: { rpcId: string; result: unknown }): Promise<unknown> {
    const response = await fetch(new URL('/api/respond', this.#baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: this.#baseUrl.host },
      body: JSON.stringify({ type: 'client-response', ...message }),
    })
    if (!response.ok) throw new DshLoopbackError('upstream-unavailable', `DSH returned HTTP ${response.status}.`)
    const receipt = (await response.json()) as { accepted?: boolean; reason?: string }
    if (receipt.accepted !== true)
      throw new DshLoopbackError('upstream-rejected', receipt.reason ?? 'DSH rejected the interaction response.')
    return receipt
  }

  /**
   * Streams validated DSH mux server requests over the desktop WebSocket downlink.
   * @param signal - Abort signal that closes the WebSocket and ends the stream.
   * @returns Mux RPC envelopes until DSH closes the downlink or the signal aborts.
   */
  mux(signal: AbortSignal): AsyncGenerator<{ rpcId: string; payload: Record<string, unknown> }> {
    return this.#stream('/api/events.mux', signal)
  }

  /**
   * Streams validated DSH host server requests over the desktop WebSocket downlink.
   * @param signal - Abort signal that closes the WebSocket and ends the stream.
   * @returns Host RPC envelopes until DSH closes the downlink or the signal aborts.
   */
  host(signal: AbortSignal): AsyncGenerator<{ rpcId: string; payload: Record<string, unknown> }> {
    return this.#stream('/api/events.host', signal)
  }

  async *#stream(
    path: '/api/events.host' | '/api/events.mux',
    signal: AbortSignal,
  ): AsyncGenerator<{ rpcId: string; payload: Record<string, unknown> }> {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const url = new URL(path, this.#baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url)
    const inbox: StreamItem[] = []
    let wake: (() => void) | undefined
    const enqueue = (item: StreamItem): void => {
      inbox.push(item)
      wake?.()
      wake = undefined
    }
    const handleMessage = (data: WebSocket.RawData): void => {
      const text = Array.isArray(data)
        ? Buffer.concat(data).toString()
        : data instanceof ArrayBuffer
          ? new TextDecoder().decode(data)
          : data.toString()
      const envelope = parseMuxEnvelope(text)
      if (envelope !== undefined) enqueue({ kind: 'frame', envelope })
    }
    const handleClose = (): void => {
      enqueue({ kind: 'end' })
    }
    const handleError = (): void => undefined
    const handleAbort = (): void => {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
    }
    socket.on('message', handleMessage)
    socket.once('close', handleClose)
    socket.on('error', handleError)
    signal.addEventListener('abort', handleAbort, { once: true })
    // An abort may already have fired between construction and this registration.
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    if (signal.aborted) handleAbort()
    try {
      while (true) {
        while (inbox.length > 0) {
          const item = inbox.shift() as StreamItem
          if (item.kind === 'end') return
          yield item.envelope
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      signal.removeEventListener('abort', handleAbort)
      socket.off('message', handleMessage)
      socket.off('close', handleClose)
      socket.off('error', handleError)
      handleAbort()
    }
  }
}

type StreamItem =
  | { kind: 'frame'; envelope: { rpcId: string; payload: Record<string, unknown> } }
  | { kind: 'end' }

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
  /** Mobile-safe category distinguishing transport availability from DSH rejection. */
  readonly code: 'upstream-unavailable' | 'upstream-rejected'
  /** DSH business error code when the upstream RPC rejected the request. */
  readonly upstreamCode: string | undefined
  /** DSH business error details when the upstream RPC rejected the request. */
  readonly details: unknown

  /**
   * @param code - Mobile transport category.
   * @param message - Upstream message retained for diagnostics.
   * @param upstreamCode - DSH business error code, when the RPC was rejected.
   * @param details - DSH business error details, when the RPC was rejected.
   */
  constructor(code: DshLoopbackError['code'], message: string, upstreamCode?: string, details?: unknown) {
    super(message)
    this.code = code
    this.upstreamCode = upstreamCode
    this.details = details
  }
}
