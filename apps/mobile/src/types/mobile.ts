export interface MobileConnection {
  gatewayUrl: string
  deviceId: string
  accessToken: string
}

export interface SessionSummary {
  sessionId: string
  title?: string
  status?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface SessionListPayload {
  items: SessionSummary[]
}

export interface SessionHistoryItem {
  seq?: number
  event: Record<string, unknown>
  [key: string]: unknown
}

export interface SessionHistoryPayload {
  items: SessionHistoryItem[]
  [key: string]: unknown
}

export interface MobileGatewayFault {
  error: {
    code: string
    message: string
  }
}
