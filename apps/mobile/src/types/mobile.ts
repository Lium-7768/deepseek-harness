export interface MobileConnection {
  gatewayUrl: string
  deviceId: string
  accessToken: string
}

/** A short-lived desktop-issued QR payload that can be exchanged only once for a paired-device credential. */
export interface MobilePairingQrPayload {
  version: 1
  gatewayUrl: string
  pairingId: string
  pairingSecret: string
  expiresAt: string
}

/** The durable credential returned only after a pairing QR payload is redeemed. */
export interface MobilePairingCredential {
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

/** One versioned event forwarded by the authenticated Mobile Gateway SSE stream. */
export interface MobileStreamEvent {
  contractVersion: 1
  eventId: string
  type: string
  payload: Record<string, unknown>
  sessionId?: string
  seq?: number
  snapshot?: true
}

export type MobileSyncStatus = 'connected' | 'connecting' | 'disconnected'

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

/** One desktop search hit. Session title and workspace metadata stay owned by SessionListPayload. */
export interface MobileSessionSearchItem {
  sessionId: string
  snippet: string
}

export interface MobileSessionSearchPayload {
  items: MobileSessionSearchItem[]
  hasMore: boolean
}

/** A durable image only retrievable after the desktop proves the current session references it. */
export interface MobileImageAttachmentRef {
  attachmentId: string
  mediaType: MobileImageMediaType
  bytes: number
  width: number
  height: number
  name?: string
}

export interface MobileImageAttachmentPayload {
  attachment: MobileImageAttachmentRef
  data: string
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

/** Goal state is desktop-authoritative and arrives only through the session projection. */
export interface MobileGoalView {
  id: string
  revision: number
  objective: string
  phase: 'active' | 'paused' | 'blocked' | 'complete'
  blockedReason?: { message?: string }
}

/** One read-only host-owned background-job snapshot row. */
export interface MobileJobView {
  id: string
  kind: string
  label: string
  status: string
  detail?: string
  startedAt: number
  finishedAt?: number
}

export interface MobileJobsPayload {
  items: MobileJobView[]
}

/** Desktop-owned direct child session that belongs to one parent session. */
export type MobileSubagentEntry =
  | {
    kind: 'child'
    id: string
    mode: 'one-shot' | 'continuable'
    activity: 'running' | 'inactive'
    hasChildren: boolean
    label?: string
  }
  | { kind: 'diagnostic'; id: string; reason: 'corrupt' | 'unsupported' | 'unavailable' }

export interface MobileSubagentCatalogPayload {
  entries: MobileSubagentEntry[]
  parentAvailable: boolean
}

export interface MobileGoalRef {
  id: string
  revision: number
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
  intent?: { kind?: string; approve?: string }
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
