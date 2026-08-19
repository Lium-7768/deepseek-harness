import { describe, expect, it } from 'vitest'
import { isNearLatestMessage, shouldScrollToLatest } from '../src/components/session-scroll-logic.ts'

describe('session latest-message scroll policy', () => {
  it('positions an opened conversation at the newest message before the first scroll measurement', () => {
    expect(shouldScrollToLatest({ hasMessages: true, initialPositionPending: true, nearLatest: false })).toBe(true)
  })

  it('follows late content while the reader remains near the newest message', () => {
    expect(isNearLatestMessage(1_000, 400, 540)).toBe(true)
    expect(shouldScrollToLatest({ hasMessages: true, initialPositionPending: false, nearLatest: true })).toBe(true)
  })

  it('does not interrupt deliberate history reading away from the newest message', () => {
    expect(isNearLatestMessage(1_000, 400, 300)).toBe(false)
    expect(shouldScrollToLatest({ hasMessages: true, initialPositionPending: false, nearLatest: false })).toBe(false)
  })

  it('does not request a scroll for an empty conversation', () => {
    expect(shouldScrollToLatest({ hasMessages: false, initialPositionPending: true, nearLatest: true })).toBe(false)
  })
})
