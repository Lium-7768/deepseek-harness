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

export interface SessionEventItem extends SessionHistoryItem {
  event: Record<string, unknown>
}

export interface SessionEventsPayload {
  since: number
  items: SessionEventItem[]
  status: 'running' | 'waiting' | 'idle'
}

export interface DshQuestionOption {
  label: string
  description?: string
}

export interface DshQuestion {
  id: string
  question: string
  detail?: string
  header?: string
  options?: DshQuestionOption[]
  multiSelect?: boolean
}

export interface PendingApprovalInteraction {
  rpcId: string
  type: 'approval/requested'
  sessionId: string
  receivedAt: string
  payload: {
    type: 'approval/requested'
    sessionId: string
    approvalId: string
    toolName: string
    callId?: string
    reason?: string
  }
}

export interface PendingQuestionInteraction {
  rpcId: string
  type: 'question/requested'
  sessionId: string
  receivedAt: string
  payload: {
    type: 'question/requested'
    sessionId: string
    questions: DshQuestion[]
  }
}

export type PendingInteraction = PendingApprovalInteraction | PendingQuestionInteraction

export interface PendingInteractionsPayload {
  items: PendingInteraction[]
}
