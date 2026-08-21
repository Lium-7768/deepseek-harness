import { describe, expect, it } from 'vitest'
import {
  modeOptionDisabled,
  permissionOptionsLocked,
  selectionOptionDisabled,
  sessionDetailReturnTarget,
} from '../src/components/session-route-logic.ts'

describe('session route interaction guards', () => {
  it('disables mode changes until the session query confirms a blank session', () => {
    expect(modeOptionDisabled({ sessionsPending: true, sessionsError: false, blank: false, broken: false })).toBe(true)
    expect(modeOptionDisabled({ sessionsPending: false, sessionsError: true, blank: true, broken: false })).toBe(true)
    expect(modeOptionDisabled({ sessionsPending: false, sessionsError: false, blank: true, broken: false })).toBe(false)
  })

  it('locks permission changes for unknown, busy, and submitting states', () => {
    expect(
      permissionOptionsLocked({
        eventsError: true,
        eventsPending: false,
        eventsStale: false,
        status: undefined,
        submitting: false,
      }),
    ).toBe(true)
    expect(
      permissionOptionsLocked({
        eventsError: false,
        eventsPending: true,
        eventsStale: false,
        status: 'idle',
        submitting: false,
      }),
    ).toBe(true)
    expect(
      permissionOptionsLocked({
        eventsError: false,
        eventsPending: false,
        eventsStale: true,
        status: 'idle',
        submitting: false,
      }),
    ).toBe(true)
    expect(
      permissionOptionsLocked({
        eventsError: false,
        eventsPending: false,
        eventsStale: false,
        status: 'running',
        submitting: false,
      }),
    ).toBe(true)
    expect(
      permissionOptionsLocked({
        eventsError: false,
        eventsPending: false,
        eventsStale: false,
        status: 'idle',
        submitting: true,
      }),
    ).toBe(true)
    expect(
      permissionOptionsLocked({
        eventsError: false,
        eventsPending: false,
        eventsStale: false,
        status: 'idle',
        submitting: false,
      }),
    ).toBe(false)
  })

  it('disables a second mode or model write while one is pending', () => {
    expect(selectionOptionDisabled(true)).toBe(true)
    expect(selectionOptionDisabled(false)).toBe(false)
  })

  it('returns a settled session-detail action to its current conversation rather than Drawer history', () => {
    expect(sessionDetailReturnTarget('session-current')).toEqual({
      pathname: '/session/[sessionId]',
      params: { sessionId: 'session-current' },
    })
    expect(sessionDetailReturnTarget(undefined)).toBe('/workspace')
  })
})
