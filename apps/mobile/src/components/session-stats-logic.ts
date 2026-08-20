import type { SharedEventItem } from '@deepseek-ai/dsh-client-ui-shared'

type SessionStatsProjection = {
  turns: number
  steps: number
  llmMs: number
  toolMs: number
  ttftMs: number
  ttftSteps: number
  decodeMs: number
  decodeTokens: number
}

type TokenUsageProjection = {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Formats token counts with the same compact units used by the desktop statistics ribbon. */
export function formatStatisticsTokens(value: number): string {
  const scaled = (amount: number): string =>
    amount >= 100 ? String(Math.round(amount)) : String(Math.round(amount * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`
  return `${scaled(value / 1_000_000)}M`
}

/** Formats an elapsed duration using desktop-compatible seconds and minutes. */
export function formatStatisticsDuration(milliseconds: number): string {
  const seconds = milliseconds / 1_000
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

/**
 * Formats decode throughput with the desktop conversation rule: whole tokens
 * from ten per second, one decimal below, and never a raw floating-point tail.
 */
export function formatStatisticsTokensPerSecond(tokensPerSecond: number): string {
  const clamped = Math.max(0, tokensPerSecond)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}

/** Builds the compact, desktop-aligned statistics ribbon from durable projections or visible-event fallback data. */
export function sessionStatisticsLine(
  projectionValues: Record<string, unknown> | undefined,
  items: readonly SharedEventItem[],
): string | undefined {
  const stats = readSessionStats(projectionValues?.sessionStats) ?? fallbackSessionStats(items)
  const usage = readTokenUsage(projectionValues?.tokenUsage)
  const groups: string[] = []
  if (stats.steps > 0) {
    groups.push(`${stats.turns} 轮 · ${stats.steps} 步`)
    const durations: string[] = []
    if (stats.llmMs > 0) durations.push(`LLM ${formatStatisticsDuration(stats.llmMs)}`)
    if (stats.toolMs > 0) durations.push(`工具调用 ${formatStatisticsDuration(stats.toolMs)}`)
    if (durations.length > 0) groups.push(durations.join(' · '))
    const speeds: string[] = []
    if (stats.ttftSteps > 0) speeds.push(`首 token 平均 ${formatStatisticsDuration(stats.ttftMs / stats.ttftSteps)}`)
    if (stats.decodeMs > 0 && stats.decodeTokens > 0)
      speeds.push(`${formatStatisticsTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000))} tok/s`)
    if (speeds.length > 0) groups.push(speeds.join(' · '))
  }
  if (usage !== undefined) {
    const input = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
    if (input > 0 || usage.outputTokens > 0) {
      if (input > 0) groups.push(`缓存命中 ${Math.round((usage.cacheReadTokens / input) * 100)}%`)
      groups.push(`输入 ${formatStatisticsTokens(input)} tok · 输出 ${formatStatisticsTokens(usage.outputTokens)} tok`)
    }
  }
  return groups.length > 0 ? groups.join(' | ') : undefined
}

function fallbackSessionStats(items: readonly SharedEventItem[]): SessionStatsProjection {
  const turns = items.filter(item => item.event.type === 'turn/end').length
  const steps = items.filter(item => item.event.type === 'step/end').length
  return { turns, steps, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 }
}

function readSessionStats(value: unknown): SessionStatsProjection | undefined {
  const record = readRecord(value)
  if (record === undefined) return undefined
  const fields = ['turns', 'steps', 'llmMs', 'toolMs', 'ttftMs', 'ttftSteps', 'decodeMs', 'decodeTokens'] as const
  const parsed = Object.fromEntries(fields.map(field => [field, finiteNonNegative(record[field])])) as Record<
    (typeof fields)[number],
    number | undefined
  >
  if (Object.values(parsed).some(field => field === undefined)) return undefined
  return parsed as SessionStatsProjection
}

function readTokenUsage(value: unknown): TokenUsageProjection | undefined {
  const record = readRecord(value)
  if (record === undefined) return undefined
  const fields = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const
  const parsed = Object.fromEntries(fields.map(field => [field, finiteNonNegative(record[field])])) as Record<
    (typeof fields)[number],
    number | undefined
  >
  if (Object.values(parsed).some(field => field === undefined)) return undefined
  return parsed as TokenUsageProjection
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}
