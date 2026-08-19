import type { SharedEventItem } from '@deepseek-ai/dsh-client-ui-shared'

export type NativeConversationRow =
  | {
    kind: 'user' | 'assistant'
    text: string
    sourceSeq?: number
    time?: number
  }
  | {
    kind: 'reasoning'
    text: string
    sourceSeq?: number
  }
  | {
    callId?: string
    kind: 'tool'
    output?: string
    sourceSeq?: number
    state: 'completed' | 'failed' | 'running'
    summary?: string
    toolInput?: string
    toolName: string
  }
  | {
    delayMs: number
    failureMessage: string
    kind: 'retry'
    maxRetries: number
    retry: number
    sourceSeq?: number
  }
  | {
    code?: string
    kind: 'turn-error'
    message: string
    sourceSeq?: number
  }

type EventRecord = Record<string, unknown>
type ContentBlock = { type?: unknown; text?: unknown }

/**
 * Projects desktop durable session events into ordered native conversation rows.
 *
 * The projection deliberately preserves the same durable distinctions the desktop
 * conversation uses: assistant prose and reasoning are separate, a tool call is
 * updated by its correlated result, and model retries remain expandable rows.
 *
 * @param items - Gateway history and SSE events ordered by durable sequence.
 * @returns Native rows derived only from desktop session events.
 */
export function projectNativeConversationRows(items: readonly SharedEventItem[]): NativeConversationRow[] {
  const rows: NativeConversationRow[] = []
  const toolRowByCallId = new Map<string, number>()
  for (const item of [...items].sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0))) {
    const event = item.event
    const type = stringField(event.type)
    const data = recordField(event.data) ?? event
    const sourceSeq = item.seq
    if (type === 'user/message') {
      const text = textFromMessage(data)
      if (text) rows.push({ kind: 'user', text, ...(sourceSeq === undefined ? {} : { sourceSeq }), ...eventTime(event) })
      continue
    }
    if (type === 'assistant/message') {
      for (const block of messageBlocks(data)) {
        if (block.type === 'reasoning' && typeof block.text === 'string' && block.text.trim()) {
          rows.push({ kind: 'reasoning', text: block.text.trim(), ...(sourceSeq === undefined ? {} : { sourceSeq }) })
        }
      }
      const text = messageBlocks(data)
        .flatMap(block => (block.type === 'text' && typeof block.text === 'string' ? [block.text] : []))
        .join('')
        .trim()
      if (text) rows.push({ kind: 'assistant', text, ...(sourceSeq === undefined ? {} : { sourceSeq }), ...eventTime(event) })
      continue
    }
    if (type === 'tool/call') {
      const callId = stringField(data.callId)
      const toolName = stringField(data.name) ?? '工具调用'
      const row: NativeConversationRow = {
        kind: 'tool',
        state: 'running',
        toolName,
        ...(callId === undefined ? {} : { callId }),
        ...(fieldText(data.arguments) === undefined ? {} : { toolInput: fieldText(data.arguments) }),
        ...(fieldText(data.description) === undefined ? {} : { summary: fieldText(data.description) }),
        ...(sourceSeq === undefined ? {} : { sourceSeq }),
      }
      rows.push(row)
      if (callId !== undefined) toolRowByCallId.set(callId, rows.length - 1)
      continue
    }
    if (type === 'tool/result') {
      const result = toolResult(data)
      if (result.callId !== undefined) {
        const rowIndex = toolRowByCallId.get(result.callId)
        if (rowIndex !== undefined) {
          const existing = rows[rowIndex]
          if (existing?.kind === 'tool') {
            rows[rowIndex] = {
              ...existing,
              state: result.failed ? 'failed' : 'completed',
              ...(result.output === undefined ? {} : { output: result.output }),
            }
            continue
          }
        }
      }
      rows.push({
        kind: 'tool',
        state: result.failed ? 'failed' : 'completed',
        toolName: '工具结果',
        ...(result.output === undefined ? {} : { output: result.output }),
        ...(sourceSeq === undefined ? {} : { sourceSeq }),
      })
      continue
    }
    if (type === 'llm/retry') {
      const failure = recordField(data.failure)
      const retry = numberField(data.retry) ?? 1
      rows.push({
        delayMs: numberField(data.delayMs) ?? 0,
        failureMessage: stringField(failure?.message) ?? '模型请求失败。',
        kind: 'retry',
        maxRetries: numberField(data.maxRetries) ?? retry,
        retry,
        ...(sourceSeq === undefined ? {} : { sourceSeq }),
      })
      continue
    }
    if (type === 'turn/error') {
      rows.push({
        kind: 'turn-error',
        message: stringField(data.message) ?? '本回合执行失败。',
        ...(stringField(data.code) === undefined ? {} : { code: stringField(data.code) }),
        ...(sourceSeq === undefined ? {} : { sourceSeq }),
      })
    }
  }
  return rows
}

/**
 * Finds the durable start time of the currently open turn for the native running footer.
 *
 * @param items - Ordered session events.
 * @returns The latest unclosed turn start time, if any.
 */
export function activeTurnStartedAt(items: readonly SharedEventItem[]): number | undefined {
  const openTurns = new Map<number, number>()
  for (const item of items) {
    const type = stringField(item.event.type)
    const data = recordField(item.event.data) ?? item.event
    const turn = numberField(data.turn)
    if (turn === undefined) continue
    if (type === 'turn/start') {
      const time = numberField(item.event.time)
      if (time !== undefined) openTurns.set(turn, time)
    } else if (type === 'turn/end') openTurns.delete(turn)
  }
  return [...openTurns.values()].at(-1)
}

function messageBlocks(data: EventRecord): ContentBlock[] {
  const message = recordField(data.message)
  const content = message?.content
  return Array.isArray(content)
    ? content.filter((block): block is ContentBlock => block !== null && typeof block === 'object' && !Array.isArray(block))
    : []
}

function textFromMessage(data: EventRecord): string | undefined {
  const text = messageBlocks(data)
    .flatMap(block => (block.type === 'text' && typeof block.text === 'string' ? [block.text] : []))
    .join('')
    .trim()
  return text || undefined
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

function eventTime(event: EventRecord): { time?: number } {
  const time = numberField(event.time)
  return time === undefined ? {} : { time }
}

function recordField(value: unknown): EventRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as EventRecord) : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function fieldText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value === undefined || value === null || typeof value !== 'object') return undefined
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return undefined
  }
}
