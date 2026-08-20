import { describe, expect, it } from 'vitest'
import {
  formatTrajectoryDuration,
  projectNativeTrajectoryActivities,
} from '../src/components/session-trajectory-logic.ts'

describe('native trajectory activity projection', () => {
  it('maps durable events into readable activities and merges a tool result with its call', () => {
    const activities = projectNativeTrajectoryActivities([
      { seq: 1, event: { type: 'turn/start', time: 1_000, data: { turn: 4 } } },
      {
        seq: 2,
        event: {
          type: 'user/message',
          data: { turn: 4, message: { content: [{ type: 'text', text: '请读取项目配置' }] } },
        },
      },
      {
        seq: 3,
        event: {
          type: 'tool/call',
          time: 2_000,
          data: { turn: 4, callId: 'call-1', name: 'read_file', description: '读取应用配置' },
        },
      },
      {
        seq: 4,
        event: {
          type: 'tool/result',
          time: 3_500,
          data: {
            turn: 4,
            message: {
              source: { callId: 'call-1' },
              content: [{ type: 'tool-result', content: [{ type: 'text', text: '已读取配置文件' }] }],
            },
          },
        },
      },
      {
        seq: 5,
        event: {
          type: 'assistant/message',
          data: {
            turn: 4,
            message: {
              content: [
                { type: 'reasoning', text: '先检查配置，再确认默认模型。' },
                { type: 'text', text: '配置读取完成。' },
              ],
            },
          },
        },
      },
      { seq: 6, event: { type: 'assistant/chunk', data: { turn: 4 } } },
      { seq: 7, event: { type: 'turn/end', data: { turn: 4 } } },
    ] as never)

    expect(activities).toEqual([
      expect.objectContaining({ kind: 'user', title: '你的消息', detail: '请读取项目配置', turn: 4, showTurn: true }),
      expect.objectContaining({
        kind: 'tool',
        title: '已完成读取文件 · read_file',
        detail: '已读取配置文件',
        state: 'completed',
        turn: 4,
        durationMs: 1_500,
      }),
      expect.objectContaining({ kind: 'reasoning', title: '完成思考', detail: '先检查配置，再确认默认模型。', turn: 4 }),
      expect.objectContaining({ kind: 'assistant', title: '生成回复', detail: '配置读取完成。', turn: 4 }),
    ])
    expect(activities.some(activity => activity.title.includes('tool/call'))).toBe(false)
  })

  it('keeps an unfinished tool visible as a running user-facing operation', () => {
    const activities = projectNativeTrajectoryActivities([
      {
        seq: 8,
        event: {
          type: 'tool/call',
          data: { turn: 2, callId: 'call-2', name: 'bash', arguments: { command: 'git status' } },
        },
      },
    ] as never)

    expect(activities).toEqual([
      expect.objectContaining({ kind: 'tool', title: '正在运行命令 · bash', state: 'running', turn: 2, showTurn: true }),
    ])
  })

  it('formats compact operation durations without raw timestamps', () => {
    expect(formatTrajectoryDuration(1_500)).toBe('1.5秒')
    expect(formatTrajectoryDuration(79_000)).toBe('1分19秒')
  })
})
