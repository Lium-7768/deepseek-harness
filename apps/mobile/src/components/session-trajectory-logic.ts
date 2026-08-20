import type { SharedEventItem } from '@deepseek-ai/dsh-client-ui-shared'

export type NativeTrajectoryActivityKind =
  | 'assistant'
  | 'compaction'
  | 'context'
  | 'error'
  | 'question'
  | 'reasoning'
  | 'retry'
  | 'tool'
  | 'user'

export type NativeTrajectoryActivityState = 'completed' | 'failed' | 'running'

export type NativeTrajectoryActivity = {
  id: string
  kind: NativeTrajectoryActivityKind
  title: string
  detail?: string
  state?: NativeTrajectoryActivityState
  toolName?: string
  turn?: number
  showTurn?: boolean
  durationMs?: number
}

type EventRecord = Record<string, unknown>
type MessageBlock = { type?: unknown; text?: unknown }

/**
 * Maps desktop durable events to the small set of user-readable activities that
 * belong in the native trajectory tab. Transport-only events, streaming deltas,
 * and turn delimiters are deliberately omitted because the desktop ledger also
 * presents their semantic result rather than its raw event protocol.
 *
 * @param items - Gateway history and live events in durable-sequence order.
 * @returns Ordered, correlated activities suitable for a native list.
 */
export function projectNativeTrajectoryActivities(
  items: readonly SharedEventItem[],
): NativeTrajectoryActivity[] {
  const activities: NativeTrajectoryActivity[] = []
  const toolByCallId = new Map<string, { index: number; startedAt?: number }>()
  let openTurn: number | undefined

  for (const item of orderedItems(items)) {
    const event = item.event
    const type = stringField(event.type)
    if (type === undefined) continue
    const data = recordField(event.data) ?? event
    const turn = numberField(data.turn) ?? openTurn
    const time = numberField(event.time)

    if (type === 'turn/start') {
      openTurn = numberField(data.turn) ?? openTurn
      continue
    }
    if (type === 'turn/end') {
      openTurn = undefined
      continue
    }
    if (type === 'assistant/chunk') continue

    if (type === 'user/message') {
      pushActivity(activities, {
        id: activityId(item, 'user'),
        kind: 'user',
        title: '你的请求',
        ...textDetail(messageText(data)),
        ...turnField(turn),
      })
      continue
    }

    if (type === 'assistant/message') {
      const blocks = messageBlocks(data)
      const text = blocks
        .flatMap(block => block.type === 'text' && typeof block.text === 'string' ? [block.text] : [])
        .join('\n')
      const reasoning = blocks
        .flatMap(block => block.type === 'reasoning' && typeof block.text === 'string' ? [block.text] : [])
        .join('\n')
      if (reasoning.trim()) {
        pushActivity(activities, {
          id: activityId(item, 'reasoning'),
          kind: 'reasoning',
          title: '分析问题',
          ...textDetail(reasoning),
          ...turnField(turn),
        })
      }
      if (text.trim()) {
        pushActivity(activities, {
          id: activityId(item, 'assistant'),
          kind: 'assistant',
          title: '生成回复',
          ...textDetail(text),
          ...turnField(turn),
        })
      }
      continue
    }

    if (type === 'tool/call') {
      const callId = stringField(data.callId)
      const toolName = stringField(data.name) ?? '工具'
      const activity: NativeTrajectoryActivity = {
        id: activityId(item, callId ?? `tool-${activities.length}`),
        kind: 'tool',
        state: 'running',
        title: toolActivityTitle(toolName),
        toolName,
        ...textDetail(toolCallDetail(toolName, data)),
        ...turnField(turn),
      }
      pushActivity(activities, activity)
      if (callId !== undefined) {
        toolByCallId.set(callId, {
          index: activities.length - 1,
          ...(time === undefined ? {} : { startedAt: time }),
        })
      }
      continue
    }

    if (type === 'tool/result') {
      const result = toolResult(data)
      const knownTool = result.callId === undefined ? undefined : toolByCallId.get(result.callId)
      if (knownTool !== undefined) {
        const current = activities[knownTool.index]
        if (current !== undefined) {
          activities[knownTool.index] = {
            ...current,
            state: result.failed ? 'failed' : 'completed',
            title: toolActivityTitle(current.toolName ?? '工具'),
            ...textDetail(toolResultDetail(result.output, result.failed)),
            ...(time === undefined || knownTool.startedAt === undefined
              ? {}
              : { durationMs: Math.max(0, time - knownTool.startedAt) }),
          }
        }
        continue
      }
      pushActivity(activities, {
        id: activityId(item, 'tool-result'),
        kind: 'tool',
        state: result.failed ? 'failed' : 'completed',
        title: '执行操作',
        ...textDetail(toolResultDetail(result.output, result.failed)),
        ...turnField(turn),
      })
      continue
    }

    if (type === 'llm/retry') {
      const failure = recordField(data.failure)
      pushActivity(activities, {
        id: activityId(item, 'retry'),
        kind: 'retry',
        title: '正在重新连接模型',
        ...textDetail(stringField(failure?.message)),
        ...turnField(turn),
      })
      continue
    }

    if (type === 'turn/error') {
      pushActivity(activities, {
        id: activityId(item, 'turn-error'),
        kind: 'error',
        title: '本次任务未完成',
        ...textDetail(stringField(data.message)),
        ...turnField(turn),
      })
      continue
    }

    if (type.includes('context')) {
      const source = [data.sourceName, data.source, data.filename, data.fileName]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      pushActivity(activities, {
        id: activityId(item, 'context'),
        kind: 'context',
        title: '已加载参考资料',
        ...textDetail(source === undefined ? undefined : fileName(source)),
        ...turnField(turn),
      })
      continue
    }

    if (type.includes('compact')) {
      pushActivity(activities, {
        id: activityId(item, 'compaction'),
        kind: 'compaction',
        title: '已整理历史内容',
        ...textDetail(stringField(data.summary)),
        ...turnField(turn),
      })
      continue
    }

    if (type.includes('approval') || type.includes('question')) {
      pushActivity(activities, {
        id: activityId(item, 'question'),
        kind: 'question',
        title: '需要你的确认',
        ...textDetail(stringField(data.question) ?? stringField(data.message) ?? stringField(data.title)),
        ...turnField(turn),
      })
    }
  }

  const firstActivityByTurn = new Set<number>()
  return activities.map((activity) => {
    if (activity.turn === undefined || firstActivityByTurn.has(activity.turn)) return activity
    firstActivityByTurn.add(activity.turn)
    return { ...activity, showTurn: true }
  })
}

/** Formats a concise native duration without exposing raw timestamps. */
export function formatTrajectoryDuration(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1_000
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}秒`
  const rounded = Math.round(seconds)
  return `${Math.floor(rounded / 60)}分${rounded % 60}秒`
}

function toolActivityTitle(toolName: string): string {
  return toolActionName(toolName)
}

function toolActionName(toolName: string): string {
  const normalized = toolName.toLowerCase()
  if (normalized === 'bash' || normalized.includes('terminal')) return '运行命令'
  if (normalized.includes('read') || normalized.includes('open_file')) return '读取文件'
  if (normalized.includes('write') || normalized.includes('edit')) return '编辑文件'
  if (normalized.includes('search')) return '搜索资料'
  if (normalized.includes('todo')) return '更新任务清单'
  if (normalized.includes('goal')) return '查看当前目标'
  if (normalized.includes('job_output')) return '查看任务输出'
  if (normalized.includes('browser')) return '访问网页'
  return '执行操作'
}

function toolCallDetail(toolName: string, data: EventRecord): string {
  const description = stringField(data.description)
  if (description !== undefined && !isTechnicalText(description)) return description
  const target = toolTarget(data.arguments)
  return target === undefined ? `正在${toolActionName(toolName)}。` : `${toolActionName(toolName)}：${target}`
}

function toolResultDetail(output: string | undefined, failed: boolean): string {
  const readable = output === undefined || isTechnicalText(output) ? undefined : previewText(output)
  if (readable !== undefined) return readable
  return failed ? '操作未完成，请在桌面端查看详细错误信息。' : '操作完成，可在桌面端查看完整结果。'
}

function toolTarget(value: unknown): string | undefined {
  const record = recordField(value)
  if (record === undefined) return undefined
  const path = stringField(record.path)
  if (path !== undefined) return fileName(path)
  return stringField(record.query) ?? stringField(record.url)
}

function isTechnicalText(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('{')
    || trimmed.startsWith('[')
    || /(^|\s)(Error|TypeError|ReferenceError|SyntaxError|Traceback|stack trace)\b/i.test(trimmed)
}

function activityId(item: SharedEventItem, suffix: string): string {
  return `trajectory:${item.seq ?? 'live'}:${suffix}`
}

function orderedItems(items: readonly SharedEventItem[]): SharedEventItem[] {
  return [...items].sort((left, right) => (left.seq ?? Number.MAX_SAFE_INTEGER) - (right.seq ?? Number.MAX_SAFE_INTEGER))
}

function pushActivity(activities: NativeTrajectoryActivity[], activity: NativeTrajectoryActivity): void {
  activities.push(activity)
}

function turnField(turn: number | undefined): Pick<NativeTrajectoryActivity, 'turn'> {
  return turn === undefined ? {} : { turn }
}

function textDetail(value: string | undefined): Pick<NativeTrajectoryActivity, 'detail'> {
  const detail = previewText(value)
  return detail === undefined ? {} : { detail }
}

function previewText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  const limit = 160
  return normalized.length > limit ? `${normalized.slice(0, limit).trimEnd()}…` : normalized
}

function messageBlocks(data: EventRecord): MessageBlock[] {
  const message = recordField(data.message)
  const content = message?.content
  return Array.isArray(content)
    ? content.filter((block): block is MessageBlock => block !== null && typeof block === 'object' && !Array.isArray(block))
    : []
}

function messageText(data: EventRecord): string | undefined {
  const text = messageBlocks(data)
    .flatMap(block => block.type === 'text' && typeof block.text === 'string' ? [block.text] : [])
    .join('\n')
  return previewText(text)
}

function toolResult(data: EventRecord): { callId?: string; failed: boolean; output?: string } {
  const message = recordField(data.message)
  const source = recordField(message?.source)
  const block = Array.isArray(message?.content)
    ? message.content.find(value => recordField(value)?.type === 'tool-result')
    : undefined
  const result = recordField(block)
  const content = Array.isArray(result?.content) ? result.content : []
  const output = content
    .flatMap((value) => {
      const row = recordField(value)
      return row?.type === 'text' && typeof row.text === 'string' ? [row.text] : []
    })
    .join('\n')
    .trim()
  return {
    ...(stringField(source?.callId) === undefined ? {} : { callId: stringField(source?.callId) }),
    failed: result?.isError === true,
    ...(output ? { output } : {}),
  }
}

function fileName(value: string): string {
  return value.split(/[\\/]/).at(-1)?.trim() || value
}

function recordField(value: unknown): EventRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as EventRecord : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
