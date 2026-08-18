import type {
  MobileAgentPresetDetail,
  MobileAgentPresetListPayload,
  MobileConnection,
  MobileGatewayFault,
  MobileModelCatalogPayload,
  MobilePromptContent,
  MobileQueuePayload,
  MobileSettingsMutatePayload,
  MobileSettingsNamespaceView,
  MobileSettingsPayload,
  MobileSettingsUpdatePayload,
  MobileSessionModelsPayload,
  PendingInteractionsPayload,
  SessionEventsPayload,
  SessionHistoryPayload,
  SessionListPayload,
} from '@/types/mobile'

interface GatewayEnvelope<T> {
  contractVersion: 1
  data: T
}

export type MobileApiErrorKind =
  | 'network'
  | 'credentials'
  | 'session-not-found'
  | 'desktop-unavailable'
  | 'model-unavailable'
  | 'agent-preset-locked'
  | 'agent-preset-not-found'
  | 'agent-preset-invalid'
  | 'settings-rejected'
  | 'settings-conflict'
  | 'protocol'
  | 'http'
  | 'unknown'

export interface MobileApiDiagnostic {
  kind: MobileApiErrorKind
  code?: string
  status?: number
  rawMessage?: string
}

/** Carries stable Chinese UI text separately from gateway and network diagnostics. */
export class MobileApiError extends Error {
  readonly kind: MobileApiErrorKind
  readonly userMessage: string
  readonly diagnostic: MobileApiDiagnostic

  /**
   * @param kind - Stable category used for diagnostics and UI policy.
   * @param userMessage - Chinese text safe for direct user presentation.
   * @param diagnostic - Original gateway or network details for diagnostics.
   */
  constructor(kind: MobileApiErrorKind, userMessage: string, diagnostic: Omit<MobileApiDiagnostic, 'kind'> = {}) {
    super(userMessage)
    this.name = 'MobileApiError'
    this.kind = kind
    this.userMessage = userMessage
    this.diagnostic = { kind, ...diagnostic }
  }
}

/**
 * Returns safe Chinese UI text without exposing an unknown English exception.
 * @param error - Unknown failure received from a request or local operation.
 * @param fallback - Chinese text used when the failure is not recognized.
 * @returns Chinese text suitable for a user-facing error surface.
 */
export function mobileErrorMessage(error: unknown, fallback = '移动端请求失败，请稍后重试。'): string {
  if (error instanceof MobileApiError) return error.userMessage
  if (error instanceof Error && containsChinese(error.message)) return error.message
  return fallback
}

/** Calls only the versioned Mobile Gateway API with a paired-device credential. */
export class MobileApi {
  readonly #connection: MobileConnection

  /** @param connection - A desktop-issued device credential and Gateway URL. */
  constructor(connection: MobileConnection) {
    let parsed: URL
    try {
      parsed = new URL(connection.gatewayUrl)
    } catch (error) {
      throw createError('unknown', '移动网关地址无效，请检查连接设置。', { rawMessage: rawMessage(error) }, false)
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      throw createError(
        'protocol',
        '移动网关地址必须使用 HTTP 或 HTTPS。',
        { rawMessage: `协议 ${parsed.protocol}` },
        false,
      )
    this.#connection = { ...connection, gatewayUrl: parsed.toString().replace(/\/$/, '') }
  }

  /** Loads the sessions shown by the current DSH Web sidebar. */
  listSessions(): Promise<SessionListPayload> {
    return this.#post<SessionListPayload>('/v1/sessions/list', {})
  }

  /** Loads one durable session-history page from the desktop runtime. */
  sessionHistory(
    sessionId: string,
    options: { beforeSeq?: number; maxMessages?: number } = {},
  ): Promise<SessionHistoryPayload> {
    return this.#post<SessionHistoryPayload>(`/v1/sessions/${encodeURIComponent(sessionId)}/history`, options)
  }

  /** Creates a desktop-owned session, optionally in one existing workspace. */
  createSession(input: { workspaceId?: string; cwd?: string; agentPreset?: string } = {}): Promise<{ sessionId: string }> {
    return this.#post<{ sessionId: string }>('/v1/sessions/create', input)
  }

  /** Renames one desktop-owned session. */
  renameSession(sessionId: string, title: string): Promise<{ title: string; seq: number }> {
    return this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/rename`, { title })
  }

  /** Forks one desktop-owned session at an optional durable event sequence. */
  forkSession(sessionId: string, atSeq?: number): Promise<{ sessionId: string }> {
    return this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/fork`, {
      ...(atSeq === undefined ? {} : { atSeq }),
    })
  }

  /** Archives one desktop-owned session through the workspace service. */
  archiveSession(sessionId: string): Promise<{ archivedSessionIds: string[] }> {
    return this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/archive`, {})
  }

  /** Reads one durable image attachment owned by a session. */
  readAttachment(sessionId: string, attachmentId: string): Promise<{ attachment: unknown; data: string }> {
    return this.#post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}`,
      {},
    )
  }

  /** Reads the desktop mux-derived pending inbox snapshot for one session. */
  sessionQueue(sessionId: string): Promise<MobileQueuePayload> {
    return this.#post<MobileQueuePayload>(`/v1/sessions/${encodeURIComponent(sessionId)}/queue`, {})
  }

  /** Updates one queued prompt using an existing DSH queue action. */
  updateQueue(sessionId: string, itemId: string, action: Record<string, unknown>): Promise<{ accepted: true }> {
    return this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/queue/${encodeURIComponent(itemId)}`, { action })
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

  /** Queues native text and image content in the selected desktop-owned session. */
  sendMessage(sessionId: string, content: MobilePromptContent): Promise<unknown> {
    return this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/messages`, { content })
  }

  /** Requests cancellation of the selected DSH session. */
  cancelSession(sessionId: string): Promise<unknown> {
    return this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/cancel`, {})
  }

  /** Reads redacted settings namespaces supported by the desktop runtime. */
  settingsDescribe(): Promise<MobileSettingsPayload> {
    return this.#post<MobileSettingsPayload>('/v1/settings/describe', {})
  }

  /** Updates one mobile-safe settings namespace through the desktop settings seam. */
  settingsUpdate(request: MobileSettingsUpdatePayload): Promise<MobileSettingsNamespaceView> {
    return this.#post<MobileSettingsNamespaceView>('/v1/settings/update', request)
  }

  /** Applies path-addressed edits without replacing redacted secret fields. */
  settingsMutate(request: MobileSettingsMutatePayload): Promise<MobileSettingsNamespaceView> {
    return this.#post<MobileSettingsNamespaceView>('/v1/settings/mutate', request)
  }

  /** Reads the desktop provider directory for the model settings view. */
  llmProviders(): Promise<{
    providers: Array<{
      provider: string
      displayName: string
      settingsNs: string
      settingsPath: string[]
      active: boolean
      declared?: boolean
    }>
  }> {
    return this.#post('/v1/llm/providers', {})
  }

  /** Reads the host-scoped model catalog for provider/model pickers. */
  llmModels(): Promise<MobileModelCatalogPayload> {
    return this.#post<MobileModelCatalogPayload>('/v1/llm/models', {})
  }

  /** Reads the exact model selection and catalog for one session. */
  sessionModels(sessionId: string): Promise<MobileSessionModelsPayload> {
    return this.#post<MobileSessionModelsPayload>(`/v1/sessions/${encodeURIComponent(sessionId)}/models`, {})
  }

  /** Selects a model route; the desktop API records the selection in the session log. */
  selectSessionModel(
    sessionId: string,
    selection: { provider: string; model: string; reasoningEffort?: string },
  ): Promise<{ selected: MobileSessionModelsPayload['current'] }> {
    return this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/model`, selection)
  }

  /** Lists Agent presets available for new or still-blank sessions. */
  agentPresets(): Promise<MobileAgentPresetListPayload> {
    return this.#post<MobileAgentPresetListPayload>('/v1/agent-presets/list', {})
  }

  /** Reads one preset composition for a read-only mobile detail view. */
  agentPreset(agentPreset: string): Promise<MobileAgentPresetDetail> {
    return this.#post<MobileAgentPresetDetail>('/v1/agent-presets/read', { agentPreset })
  }

  /** Selects an Agent preset; the desktop API appends the durable selection event. */
  selectSessionPreset(sessionId: string, agentPreset: string): Promise<{ agentPreset: string }> {
    return this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/agent-preset`, { agentPreset })
  }

  async #post<T>(path: string, body: object): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.#connection.gatewayUrl}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.#connection.deviceId}.${this.#connection.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      throw createError('network', '无法连接桌面端，请检查网络或网关地址。', { rawMessage: rawMessage(error) })
    }

    let decoded: unknown
    try {
      decoded = await response.json()
    } catch (error) {
      if (response.ok)
        throw createError('protocol', '桌面端返回了无效响应，请稍后重试。', {
          status: response.status,
          rawMessage: rawMessage(error),
        })
    }
    if (!response.ok) throw this.#httpError(response.status, decoded)
    if (!isGatewayEnvelope<T>(decoded))
      throw createError('protocol', '桌面端返回了无效响应，请稍后重试。', { status: response.status })
    return decoded.data
  }

  #httpError(status: number, decoded: unknown): MobileApiError {
    const fault = readGatewayFault(decoded)
    const code = fault?.code
    const raw = fault?.message
    const kind = errorKind(code, status)
    return createError(kind, userMessage(kind, code, status, raw), { code, status, rawMessage: raw })
  }
}

function isGatewayEnvelope<T>(value: unknown): value is GatewayEnvelope<T> {
  if (!isRecord(value) || value.contractVersion !== 1) return false
  return 'data' in value
}

function readGatewayFault(value: unknown): MobileGatewayFault['error'] | undefined {
  if (!isRecord(value) || !isRecord(value.error)) return undefined
  const code = typeof value.error.code === 'string' ? value.error.code : undefined
  const message = typeof value.error.message === 'string' ? value.error.message : undefined
  return code !== undefined && message !== undefined ? { code, message } : undefined
}

function errorKind(code: string | undefined, status: number): MobileApiErrorKind {
  const normalized = code?.toLowerCase()
  if (
    normalized === 'unauthorized' ||
    normalized === 'forbidden' ||
    normalized?.includes('credential') ||
    status === 401 ||
    status === 403
  )
    return 'credentials'
  if (normalized === 'session-not-found' || normalized === 'not-found') return 'session-not-found'
  if (normalized === 'model-unavailable') return 'model-unavailable'
  if (normalized === 'agent-preset-locked') return 'agent-preset-locked'
  if (normalized === 'agent-preset-not-found') return 'agent-preset-not-found'
  if (normalized === 'agent-preset-invalid') return 'agent-preset-invalid'
  if (normalized === 'settings-rejected') return 'settings-rejected'
  if (normalized === 'settings-conflict') return 'settings-conflict'
  if (status === 404) return 'session-not-found'
  if (
    normalized === 'upstream-unavailable' ||
    normalized === 'upstream-rejected' ||
    status === 502 ||
    status === 503 ||
    status === 504
  )
    return 'desktop-unavailable'
  if (normalized === 'bad-request' || (status >= 400 && status < 500)) return 'http'
  return status >= 400 ? 'http' : 'unknown'
}

function userMessage(
  kind: MobileApiErrorKind,
  code: string | undefined,
  status: number,
  raw: string | undefined,
): string {
  if (raw !== undefined && containsChinese(raw)) return raw
  if (kind === 'credentials') return '移动端凭据无效，请重新连接桌面端。'
  if (kind === 'session-not-found') return '未找到请求的会话或操作。'
  if (kind === 'model-unavailable') return '所选模型当前不可用，请重新选择。'
  if (kind === 'agent-preset-locked') return '会话已经开始，无法切换 Agent 模式。'
  if (kind === 'agent-preset-not-found') return '未找到所选 Agent 预设。'
  if (kind === 'agent-preset-invalid') return '所选 Agent 预设当前不可用。'
  if (kind === 'settings-rejected') return '设置未被桌面端接受，请检查输入。'
  if (kind === 'settings-conflict') return '设置已被其他窗口修改，请重新加载后再试。'
  if (kind === 'desktop-unavailable') return '桌面端当前不可用，请确认桌面端正在运行。'
  if (code === 'bad-request') return '移动端请求无效，请重试。'
  return `移动端连接请求失败（HTTP ${status}），请稍后重试。`
}

function createError(
  kind: MobileApiErrorKind,
  message: string,
  diagnostic: Omit<MobileApiDiagnostic, 'kind'> = {},
  report = true,
): MobileApiError {
  const error = new MobileApiError(kind, message, diagnostic)
  if (report) console.warn('[mobile-api]', error.diagnostic)
  return error
}

function rawMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function containsChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
