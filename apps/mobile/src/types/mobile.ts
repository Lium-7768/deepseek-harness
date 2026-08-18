export interface MobileConnection {
  gatewayUrl: string
  deviceId: string
  accessToken: string
}

/** Image MIME types accepted by the desktop session.prompt API. */
export type MobileImageMediaType = 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'

/** A native-composer content block forwarded unchanged by the Mobile Gateway. */
export type MobilePromptContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: MobileImageMediaType; data: string; name?: string }

export type MobilePromptContent = MobilePromptContentPart[]

/** One host-owned pending inbox item projected from a DSH `session/queue` mux frame. */
export interface MobileQueueItem {
  id: string
  placement: 'context' | 'queued' | 'steering'
  message: { content: MobilePromptContent }
}

export interface MobileQueuePayload {
  items: MobileQueueItem[]
}

export interface SessionSummary {
  sessionId: string
  title?: string
  running?: boolean
  updatedAt?: number
  blank?: boolean
  agentPreset?: string
  [key: string]: unknown
}

/** Desktop-owned workspace membership projected with the mobile session list. */
export interface MobileWorkspace {
  workspaceId: string
  title: string
  path?: string
  sessionIds: string[]
}

export interface SessionListPayload {
  items: SessionSummary[]
  workspaces: MobileWorkspace[]
  archivedSessionIds: string[]
}

export interface SessionHistoryItem {
  seq?: number
  event: Record<string, unknown>
  /** Host-computed desktop tool-card view that clients may render without echoing it back. */
  view?: unknown
  [key: string]: unknown
}

export interface SessionHistoryPayload {
  items: SessionHistoryItem[]
  hasMore?: boolean
  projections?: MobileSessionProjectionsBlock
  [key: string]: unknown
}

/** Session projection baseline returned with the history tail. */
export interface MobileSessionProjectionsBlock {
  asOfSeq: number
  values: Record<string, unknown>
}

/** Host-owned permission choices projected from the session log. */
export interface MobilePermissionSelect {
  options: Array<{ value: string; name: string; description?: string }>
  currentValue: string
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

export interface MobileSettingsSecretView {
  path: string[]
  set: boolean
}

export interface MobileSettingsNamespaceView {
  ns: string
  schema: unknown
  value: unknown
  base?: unknown
  user?: unknown
  applies: 'live' | 'restart'
  secrets: MobileSettingsSecretView[]
  revision: number
}

export interface MobileSettingsPayload {
  writable: boolean
  hasDocument: boolean
  namespaces: MobileSettingsNamespaceView[]
}

export interface MobileSettingsPathOp {
  op: 'set' | 'unset'
  path: string[]
  value?: unknown
}

export interface MobileSettingsUpdatePayload {
  ns: string
  patch: Record<string, unknown>
  expectedRevision?: number
}

export interface MobileSettingsMutatePayload {
  ns: string
  ops: MobileSettingsPathOp[]
  expectedRevision?: number
}

export interface MobileModelReasoningEffort {
  id: string
  name: string
  description?: string
}

export interface MobileModelCatalogModel {
  id: string
  name: string
  description?: string
  reasoning?: {
    efforts: MobileModelReasoningEffort[]
    defaultEffort?: string
  }
}

export interface MobileModelProviderGroup {
  id: string
  name: string
  models: MobileModelCatalogModel[]
}

export interface MobileModelCatalogFailure {
  id: string
  name: string
  message: string
}

export interface MobileModelCatalogPayload {
  groups: MobileModelProviderGroup[]
  failures: MobileModelCatalogFailure[]
}

export interface MobileSessionModelsPayload {
  current: MobileModelSelection
  routable: boolean
  groups: MobileModelProviderGroup[]
  failures: MobileModelCatalogFailure[]
}

/** Complete provider/model route selected for the next session turn. */
export interface MobileModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

export interface MobileAgentPresetEntry {
  id: string
  trust: 'system' | 'user'
  isDefault: boolean
  name?: string
  description?: string
  broken?: string
}

export interface MobileAgentPresetListPayload {
  presets: MobileAgentPresetEntry[]
  authorable: boolean
  hasDocument: boolean
}

export interface MobileAgentPresetDetail {
  agentPreset: string
  trust: 'system' | 'user'
  content: string
  name?: string
  description?: string
}
