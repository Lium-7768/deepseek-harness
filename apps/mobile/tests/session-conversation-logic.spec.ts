import { describe, expect, it } from 'vitest'
import { activeTurnStartedAt, projectNativeConversationRows } from '../src/components/session-conversation-logic.ts'

describe('projectNativeConversationRows', () => {
  it('keeps the desktop conversation distinctions for prose, Think, tools, retry, and terminal errors', () => {
    const rows = projectNativeConversationRows([
      { seq: 1, event: { type: 'turn/start', time: 1_000, data: { turn: 4 } } },
      {
        seq: 2,
        event: {
          type: 'user/message',
          time: 1_100,
          data: { message: { content: [{ type: 'text', text: '继续' }] } },
        },
      },
      {
        seq: 3,
        event: {
          type: 'assistant/message',
          time: 1_200,
          data: {
            message: {
              content: [
                { type: 'reasoning', text: '先检查日志。' },
                { type: 'text', text: '我正在继续检查。' },
                { type: 'tool-call', name: 'bash' },
              ],
            },
          },
        },
      },
      {
        seq: 4,
        event: {
          type: 'tool/call',
          data: { callId: 'call-1', name: 'bash', arguments: { command: 'pwd' }, description: '读取当前目录' },
        },
      },
      {
        seq: 5,
        event: {
          type: 'tool/result',
          data: {
            message: {
              source: { callId: 'call-1' },
              content: [{ type: 'tool-result', isError: true, content: [{ type: 'text', text: 'permission denied' }] }],
            },
          },
        },
      },
      {
        seq: 6,
        event: {
          type: 'llm/retry',
          data: { retry: 1, maxRetries: 2, delayMs: 5_600, failure: { message: '429: rate limited' } },
        },
      },
      { seq: 7, event: { type: 'turn/error', data: { message: '模型不可用。', code: 'MODEL_UNAVAILABLE' } } },
    ])

    expect(rows).toEqual([
      { kind: 'user', sourceSeq: 2, text: '继续', time: 1_100 },
      { kind: 'reasoning', sourceSeq: 3, text: '先检查日志。' },
      { kind: 'assistant', sourceSeq: 3, text: '我正在继续检查。', time: 1_200 },
      {
        callId: 'call-1',
        kind: 'tool',
        output: 'permission denied',
        sourceSeq: 4,
        state: 'failed',
        summary: '读取当前目录',
        toolInput: '{\n  "command": "pwd"\n}',
        toolName: 'bash',
      },
      {
        delayMs: 5_600,
        failureMessage: '429: rate limited',
        kind: 'retry',
        maxRetries: 2,
        retry: 1,
        sourceSeq: 6,
      },
      { code: 'MODEL_UNAVAILABLE', kind: 'turn-error', message: '模型不可用。', sourceSeq: 7 },
    ])
  })

  it('projects in-progress reasoning and text deltas before a durable assistant message exists', () => {
    expect(
      projectNativeConversationRows([
        { seq: 1, event: { type: 'assistant/chunk', data: { turn: 3, step: 2, chunk: { type: 'reasoning-delta', index: 0, text: '分析' } } } },
        { seq: 2, event: { type: 'assistant/chunk', data: { turn: 3, step: 2, chunk: { type: 'reasoning-delta', index: 0, text: '中' } } } },
        { seq: 3, event: { type: 'assistant/chunk', data: { turn: 3, step: 2, chunk: { type: 'text-delta', index: 1, text: '正在' } } } },
        { seq: 4, event: { type: 'assistant/chunk', data: { turn: 3, step: 2, chunk: { type: 'text-delta', index: 1, text: '处理。' } } } },
      ]),
    ).toEqual([
      { kind: 'reasoning', rowKey: 'stream:3:2:reasoning:0', sourceSeq: 1, text: '分析中' },
      { kind: 'assistant', rowKey: 'stream:3:2:assistant:1', sourceSeq: 3, text: '正在处理。' },
    ])
  })

  it('replaces same-step streaming deltas with the durable assistant message once settled', () => {
    expect(
      projectNativeConversationRows([
        { seq: 1, event: { type: 'assistant/chunk', data: { turn: 3, step: 2, chunk: { type: 'text-delta', index: 0, text: '临时' } } } },
        {
          seq: 2,
          event: {
            type: 'assistant/message',
            data: { turn: 3, step: 2, message: { content: [{ type: 'text', text: '最终正文。' }] } },
          },
        },
      ]),
    ).toEqual([{ kind: 'assistant', sourceSeq: 2, text: '最终正文。' }])
  })

  it('returns only the latest unclosed desktop turn start time', () => {
    expect(
      activeTurnStartedAt([
        { seq: 1, event: { type: 'turn/start', time: 1_000, data: { turn: 1 } } },
        { seq: 2, event: { type: 'turn/end', data: { turn: 1 } } },
        { seq: 3, event: { type: 'turn/start', time: 2_000, data: { turn: 2 } } },
      ]),
    ).toBe(2_000)
  })
})
