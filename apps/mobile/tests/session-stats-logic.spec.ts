import { describe, expect, it } from 'vitest'
import {
  formatStatisticsDuration,
  formatStatisticsTokens,
  sessionStatisticsLine,
} from '../src/components/session-stats-logic.ts'

describe('session statistics logic', () => {
  it('formats desktop-compatible compact tokens and durations', () => {
    expect(formatStatisticsTokens(147)).toBe('147')
    expect(formatStatisticsTokens(3_200_000)).toBe('3.2M')
    expect(formatStatisticsDuration(6_500)).toBe('6.5s')
    expect(formatStatisticsDuration(79_000)).toBe('1m19s')
  })

  it('renders durable desktop statistics projections without placeholder values', () => {
    const line = sessionStatisticsLine(
      {
        sessionStats: {
          turns: 41,
          steps: 79,
          llmMs: 379_000,
          toolMs: 12_200,
          ttftMs: 266_500,
          ttftSteps: 41,
          decodeMs: 528_000,
          decodeTokens: 77_616,
        },
        tokenUsage: {
          uncachedInputTokens: 192_000,
          cacheReadTokens: 3_000_000,
          cacheWriteTokens: 8_000,
          outputTokens: 250_000,
        },
      },
      [],
    )
    expect(line).toBe(
      '41 轮 · 79 步 | LLM 6m19s · 工具调用 12.2s | 首 token 平均 6.5s · 147 tok/s | 缓存命中 94% | 输入 3.2M tok · 输出 250K tok',
    )
  })

  it('falls back to durable completion events but omits unavailable timing and usage', () => {
    const line = sessionStatisticsLine(undefined, [
      { event: { type: 'turn/end' } },
      { event: { type: 'step/end' } },
    ] as never)
    expect(line).toBe('1 轮 · 1 步')
  })

  it('does not render invented statistics when neither projections nor events exist', () => {
    expect(sessionStatisticsLine(undefined, [])).toBeUndefined()
  })
})
