import { describe, expect, it } from 'vitest'
import {
  drawerWidthForViewport,
  formatSessionTime,
  hasWorkspaceData,
  selectedSessionTarget,
  sessionIdFromRoute,
  sessionRows,
  sessionTimeLabel,
  sortSessions,
  visibleWorkspaceRows,
} from '../src/components/session-drawer-logic.ts'
import type { SessionSummary } from '../src/types/mobile.ts'

const session = (sessionId: string, updatedAt: number, extra: Record<string, unknown> = {}): SessionSummary => ({
  sessionId,
  updatedAt,
  ...extra,
})

describe('session drawer logic', () => {
  it('keeps the mobile drawer at the visual parity width without exceeding its cap', () => {
    expect(drawerWidthForViewport(390)).toBe(328)
    expect(drawerWidthForViewport(480)).toBe(360)
    expect(drawerWidthForViewport(0)).toBe(0)
  })

  it('sorts recent sessions by numeric gateway timestamps without mutating input', () => {
    const items = [session('old', 10), session('new', 20)]
    expect(sortSessions(items, 'updated').map(item => item.sessionId)).toEqual(['new', 'old'])
    expect(items.map(item => item.sessionId)).toEqual(['old', 'new'])
  })

  it('keeps manual order as a stable copy for callers with a real manual source', () => {
    const items = [session('first', 10), session('second', 20)]
    expect(sortSessions(items, 'manual').map(item => item.sessionId)).toEqual(['first', 'second'])
  })

  it('formats an updated session timestamp instead of using a relative placeholder', () => {
    const now = new Date(2026, 7, 17, 15, 45).getTime()
    const updatedAt = new Date(2026, 7, 16, 9, 8).getTime()
    expect(formatSessionTime(updatedAt, now)).toBe('8月16日 09:08')
    expect(sessionTimeLabel(session('recent', updatedAt), now)).toBe('8月16日 09:08')
  })

  it('shows processing status before the session timestamp', () => {
    expect(sessionTimeLabel({ running: true, updatedAt: 1 }, Date.now())).toBe('处理中')
  })

  it('uses an explicit label for invalid timestamps', () => {
    for (const updatedAt of [undefined, null, '', Number.NaN, Number.POSITIVE_INFINITY, 0]) {
      expect(formatSessionTime(updatedAt)).toBe('时间未知')
    }
  })

  it('uses desktop workspace membership order and retains an explicit ungrouped node', () => {
    const items = [session('a', 10), session('b', 9), session('c', 8)]
    const workspaces = [
      { workspaceId: 'w1', title: '项目一', sessionIds: ['b', 'a'] },
      { workspaceId: 'w2', title: '项目二', sessionIds: [] },
    ]
    expect(hasWorkspaceData(workspaces)).toBe(true)
    expect(
      sessionRows(items, workspaces, 'workspace').map(row =>
        row.kind === 'workspace' ? row.label : row.session.sessionId,
      ),
    ).toEqual(['项目一', 'b', 'a', '项目二', '未分组', 'c'])
  })

  it('keeps workspace and ungrouped folders visible when a workspace is collapsed', () => {
    const rows = sessionRows(
      [session('a', 10), session('b', 9), session('c', 8)],
      [{ workspaceId: 'w1', title: '项目一', sessionIds: ['a', 'b'] }],
      'workspace',
    )
    expect(
      visibleWorkspaceRows(rows, new Set(['workspace:w1'])).map(row =>
        row.kind === 'workspace' ? row.label : row.session.sessionId,
      ),
    ).toEqual(['项目一', '未分组', 'c'])
    expect(
      visibleWorkspaceRows(rows, new Set()).map(row => (row.kind === 'workspace' ? row.label : row.session.sessionId)),
    ).toEqual(['项目一', 'a', 'b', '未分组', 'c'])
  })

  it('renders all sessions beneath ungrouped when the desktop has no registered workspace', () => {
    const items = [session('a', 10), session('b', 9)]
    expect(hasWorkspaceData([])).toBe(false)
    expect(
      sessionRows(items, [], 'workspace').map(row => (row.kind === 'workspace' ? row.label : row.session.sessionId)),
    ).toEqual(['未分组', 'a', 'b'])
    expect(sessionRows(items, [], 'flat').every(row => row.kind === 'session')).toBe(true)
  })

  it('resolves only the explicitly selected session', () => {
    const items = [session('first', 10), session('second', 20)]
    expect(selectedSessionTarget(items, undefined)).toBeUndefined()
    expect(selectedSessionTarget(items, 'second')?.sessionId).toBe('second')
    expect(selectedSessionTarget(items, 'missing')).toBeUndefined()
  })

  it('keeps the active session when the drawer is opened from a nested session route', () => {
    expect(sessionIdFromRoute({ name: 'session/[sessionId]', params: { sessionId: 'root' } })).toBe('root')
    expect(sessionIdFromRoute({ name: 'session/[sessionId]/interactions', params: { sessionId: 'nested' } })).toBe(
      'nested',
    )
    expect(sessionIdFromRoute({ name: 'settings', params: { sessionId: 'not-a-session-route' } })).toBeUndefined()
    expect(sessionIdFromRoute({ name: 'session/[sessionId]/interactions', params: {} })).toBeUndefined()
  })
})
