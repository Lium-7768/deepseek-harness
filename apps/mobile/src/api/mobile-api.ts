import type { MobileConnection, MobileGatewayFault, PendingInteractionsPayload, SessionEventsPayload, SessionHistoryPayload, SessionListPayload } from '@/types/mobile'

interface GatewayEnvelope<T> {
  contractVersion: 1
  data: T
}

/** Calls only the versioned Mobile Gateway API with a paired-device credential. */
export class MobileApi {
  readonly #connection: MobileConnection

  /** @param connection - A desktop-issued device credential and Gateway URL. */
  constructor(connection: MobileConnection) {
    const parsed = new URL(connection.gatewayUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('The Mobile Gateway URL must use HTTP or HTTPS.')
    this.#connection = { ...connection, gatewayUrl: parsed.toString().replace(/\/$/, '') }
  }

  /** Loads the sessions shown by the current DSH Web sidebar. */
  listSessions(): Promise<SessionListPayload> {
    return this.#post<SessionListPayload>('/v1/sessions/list', {})
  }

  /** Loads the current durable session history. */
  sessionHistory(sessionId: string): Promise<SessionHistoryPayload> {
    return this.#post<SessionHistoryPayload>(`/v1/sessions/${encodeURIComponent(sessionId)}/history`, {})
  }

  /** Polls new session events and derives the current status. */
  sessionEvents(sessionId: string, since: number): Promise<SessionEventsPayload> {
    return this.#post<SessionEventsPayload>(`/v1/sessions/${encodeURIComponent(sessionId)}/events`, { since })
  }

  /** Reads only the current approval and question requests for one DSH session. */
  pendingInteractions(sessionId: string): Promise<PendingInteractionsPayload> {
    return this.#post<PendingInteractionsPayload>(`/v1/sessions/${encodeURIComponent(sessionId)}/interactions`, {})
  }

  /** Sends a correlated response to a pending DSH interaction. */
  respondToInteraction(rpcId: string, result: unknown): Promise<unknown> {
    return this.#post('/v1/interactions/respond', { rpcId, result })
  }

  /** Queues one text prompt in the selected DSH session. */
  sendMessage(sessionId: string, text: string): Promise<unknown> {
    return this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/messages`, { text })
  }

  /** Requests cancellation of the selected DSH session. */
  cancelSession(sessionId: string): Promise<unknown> {
    return this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/cancel`, {})
  }

  async #post<T>(path: string, body: object): Promise<T> {
    const response = await fetch(`${this.#connection.gatewayUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#connection.deviceId}.${this.#connection.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const decoded: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      const fault = decoded as MobileGatewayFault | undefined
      throw new Error(fault?.error?.message ?? `The mobile connection returned HTTP ${response.status}.`)
    }
    const envelope = decoded as GatewayEnvelope<T>
    if (envelope.contractVersion !== 1) throw new Error('The desktop Mobile Gateway uses an unsupported contract version.')
    return envelope.data
  }
}
