export const sharedUiTokens = {
  colors: {
    background: '#f5f7fb',
    surface: '#ffffff',
    surfaceMuted: '#eef2f7',
    ink: '#172033',
    inkMuted: '#687386',
    inkFaint: '#98a2b3',
    border: '#e2e8f0',
    accent: '#2563eb',
    accentSoft: '#e8f0ff',
    success: '#16845b',
    successSoft: '#e9f8f1',
    warning: '#a45b00',
    warningSoft: '#fff4df',
    danger: '#b42318',
    dangerSoft: '#fff0ee',
    userBubble: '#e8f0ff',
    assistantBubble: '#ffffff',
    codeBackground: '#101827',
    codeForeground: '#dbeafe',
  },
  radius: { card: 18, control: 12, bubble: 16, pill: 999 },
  spacing: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28 },
  typography: { eyebrow: 11, caption: 12, body: 14, bodyLarge: 16, title: 30, lineBody: 21 },
  elevation: {
    card: {
      shadowColor: '#172033',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
  },
} as const
export type SharedMessageKind = 'user' | 'assistant' | 'tool' | 'system' | 'agent'
export type ToolState = 'running' | 'completed' | 'failed'
export type MessageSegment = { kind: 'text' | 'code'; text: string; language?: string }
export type SharedMessagePresentation = {
  kind: SharedMessageKind
  label: string
  text: string
  segments: MessageSegment[]
  toolState?: ToolState
  toolName?: string
  callId?: string
  toolInput?: string
  toolOutput?: string
  sourceSeq?: number
}
export type SharedEventItem = { seq?: number; event: Record<string, unknown> }
const PROTOCOL_TYPES = [
  'turn/',
  'agent/',
  'inbox/',
  'step/',
  'host/',
  'runtime/',
  'session/status',
  'heartbeat',
  'keepalive',
  'transport/',
  'connection/',
]
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
const normalizedType = (event: Record<string, unknown>) =>
  typeof event.type === 'string' ? event.type.toLowerCase().trim() : ''
function eventContent(event: Record<string, unknown>): string | undefined {
  for (const value of [event.content, event.text, event.message, event.delta, event.output, event.result]) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (Array.isArray(value)) {
      const text = value
        .map(item =>
          typeof item === 'string' ? item : typeof asRecord(item)?.text === 'string' ? asRecord(item)?.text : '',
        )
        .join('')
        .trim()
      if (text) return text
    }
    const nested = asRecord(value)
    if (nested) {
      const text = eventContent(nested)
      if (text) return text
    }
  }
  for (const key of ['data', 'payload']) {
    const nested = asRecord(event[key])
    if (nested) {
      const text = eventContent(nested)
      if (text) return text
    }
  }
  return undefined
}
function explicitRole(event: Record<string, unknown>): SharedMessageKind | undefined {
  const message = asRecord(event.message)
  const raw = [event.role, event.kind, message?.role, message?.kind].find(value => typeof value === 'string')
  if (typeof raw !== 'string') return undefined
  const role = raw.toLowerCase()
  if (role === 'user' || role === 'human') return 'user'
  if (role === 'assistant' || role === 'model') return 'assistant'
  if (['tool', 'toolcall', 'toolresult', 'function'].includes(role)) return 'tool'
  if (role === 'system') return 'system'
  if (role === 'agent') return 'agent'
  return undefined
}
function typeRole(event: Record<string, unknown>): SharedMessageKind | undefined {
  const type = normalizedType(event)
  if (type === 'user/message' || type.startsWith('user/')) return 'user'
  if (type === 'assistant/message' || type === 'assistant/chunk' || type.startsWith('assistant/')) return 'assistant'
  if (
    type === 'tool/call' ||
    type === 'tool/result' ||
    type.startsWith('tool/') ||
    type.includes('function') ||
    type.includes('command')
  )
    return 'tool'
  if (type === 'system/message' || type.startsWith('system/')) return 'system'
  if (type.startsWith('agent/')) return 'agent'
  return undefined
}
const isProtocolEvent = (event: Record<string, unknown>) => {
  const type = normalizedType(event)
  return !type || PROTOCOL_TYPES.some(prefix => type === prefix || type.startsWith(prefix))
}
const isInternalPrompt = (text: string) =>
  [
    '<system-reminder',
    'agents.md',
    'instructions from:',
    'pre-release stance',
    'current runtime context',
    'current dsh file policy',
    'approval policy:',
    'reply exactly mobilegatewayok',
    'reply exactly teamo_',
    'teamo_mobile_ok',
    'teamo_dsh_ok',
  ].some(marker => text.toLowerCase().includes(marker))
export function isUserVisibleEvent(event: Record<string, unknown>): boolean {
  if (isProtocolEvent(event)) return false
  const kind = explicitRole(event) ?? typeRole(event)
  if (kind !== 'user' && kind !== 'assistant' && kind !== 'tool') return false
  const text = eventContent(event) ?? ''
  return kind === 'tool' || (Boolean(text) && !isInternalPrompt(text))
}
export function formatEventText(event: Record<string, unknown>): string {
  return eventContent(event) ?? ''
}
function visibleMessageText(text: string, kind: SharedMessageKind): string {
  return kind === 'assistant' ? text.replace(/<think>\s*[\s\S]*?<\/think>\s*/gi, '').trim() : text
}
function visibleEventText(event: Record<string, unknown>, kind: SharedMessageKind): string {
  const container = asRecord(event.data) ?? event
  const message = asRecord(container.message)
  const content = message?.content
  if (kind === 'assistant' && Array.isArray(content))
    return content
      .flatMap((block) => {
        const record = asRecord(block)
        return record?.type === 'text' && typeof record.text === 'string' ? [record.text] : []
      })
      .join('')
      .trim()
  return visibleMessageText(formatEventText(event), kind)
}
function fieldText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value !== undefined && value !== null && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return undefined
    }
  }
  return undefined
}
export function classifyEvent(event: Record<string, unknown>, _index = 0): SharedMessagePresentation {
  const type = normalizedType(event)
  const kind = explicitRole(event) ?? typeRole(event) ?? 'system'
  const text = visibleEventText(event, kind)
  const tool = kind === 'tool'
  const toolName =
    typeof event.toolName === 'string' ? event.toolName : typeof event.name === 'string' ? event.name : undefined
  const input = fieldText(event.input ?? event.args ?? event.arguments ?? asRecord(event.payload)?.input)
  const output = fieldText(event.output ?? event.result ?? asRecord(event.payload)?.output)
  return {
    kind,
    label:
      kind === 'user'
        ? '你'
        : kind === 'tool'
          ? (toolName ?? '工具执行')
          : kind === 'agent'
            ? '智能体进度'
            : kind === 'system'
              ? '系统'
              : '助手',
    text,
    segments: splitMessageSegments(text),
    ...(tool
      ? {
        toolState: getToolState(type),
        ...(toolName ? { toolName } : {}),
        ...(input ? { toolInput: input } : {}),
        ...(output ? { toolOutput: output } : {}),
      }
      : {}),
    ...(typeof event.callId === 'string' ? { callId: event.callId } : {}),
  }
}
export function projectVisibleMessages(items: SharedEventItem[]): SharedMessagePresentation[] {
  const projected: SharedMessagePresentation[] = []
  for (const item of [...items].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    if (!isUserVisibleEvent(item.event)) continue
    const next = { ...classifyEvent(item.event), ...(item.seq === undefined ? {} : { sourceSeq: item.seq }) }
    if (next.kind !== 'tool' && !next.text.trim()) continue
    const previous = projected[projected.length - 1]
    const type = normalizedType(item.event)
    if (
      next.kind === 'assistant' &&
      (type === 'assistant/chunk' || type === 'assistant/delta') &&
      previous?.kind === 'assistant'
    ) {
      previous.text += next.text
      previous.segments = splitMessageSegments(previous.text)
      if (next.sourceSeq !== undefined) previous.sourceSeq = next.sourceSeq
    } else projected.push(next)
  }
  return projected
}
export function splitMessageSegments(text: string): MessageSegment[] {
  const result: MessageSegment[] = []
  text.split('```').forEach((part, index) => {
    if (!part.trim()) return
    if (index % 2 === 1) {
      const firstNewline = part.indexOf('\n')
      const language = firstNewline > 0 ? part.slice(0, firstNewline).trim() : undefined
      const code = firstNewline > 0 ? part.slice(firstNewline + 1) : part
      result.push({ kind: 'code', text: code.trimEnd(), ...(language ? { language } : {}) })
    } else result.push({ kind: 'text', text: part.trim() })
  })
  return result
}
export function getToolState(type: string): ToolState {
  if (type.includes('error') || type.includes('fail')) return 'failed'
  if (type.includes('complete') || type.includes('success') || type.includes('done') || type === 'tool/result')
    return 'completed'
  return 'running'
}
