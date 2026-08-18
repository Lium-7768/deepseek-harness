import { describe, expect, it } from 'vitest'
import { classifyEvent } from '../src/index.ts'

describe('classifyEvent fallback labels', () => {
  it('uses Chinese labels when tool, agent, and system names are absent', () => {
    expect(classifyEvent({ type: 'tool/result' }).label).toBe('工具执行')
    expect(classifyEvent({ type: 'agent/progress' }).label).toBe('智能体进度')
    expect(classifyEvent({ type: 'system/message' }).label).toBe('系统')
  })
})
