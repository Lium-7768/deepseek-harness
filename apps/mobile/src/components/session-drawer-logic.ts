import type { MobileWorkspace, SessionSummary } from '@/types/mobile'

/** The two session ordering modes supported by the drawer model. */
export type SessionOrder = 'manual' | 'updated'

/** A row rendered by the drawer's workspace and session tree. */
export type SessionDrawerRow =
  | { kind: 'workspace'; key: string; label: string; workspace?: MobileWorkspace }
  | { kind: 'session'; key: string; session: SessionSummary }
  | { kind: 'overflow'; key: string; workspaceKey: string; hiddenCount: number; expanded: boolean }

/** Maximum initial session rows shown by one expanded workspace, matching the desktop browser. */
export const COLLAPSED_WORKSPACE_SESSION_LIMIT = 5

/** Resolves the active session from a root or nested Expo Router route. */
export function sessionIdFromRoute(route: { name: string; params?: unknown } | undefined): string | undefined {
  if (route === undefined || (route.name !== 'session/[sessionId]' && !route.name.startsWith('session/[sessionId]/')))
    return undefined
  if (route.params === null || typeof route.params !== 'object' || Array.isArray(route.params)) return undefined
  const sessionId = (route.params as Record<string, unknown>).sessionId
  return typeof sessionId === 'string' && sessionId.trim() !== '' ? sessionId : undefined
}

/** Resolves the mobile drawer width while preserving a usable content column. */
export function drawerWidthForViewport(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0
  return Math.min(360, Math.round(viewportWidth * 0.84))
}

/** Sorts session summaries without mutating the gateway response. */
export function sortSessions(items: readonly SessionSummary[], order: SessionOrder): SessionSummary[] {
  const result = [...items]
  if (order === 'manual') return result
  return result.sort((a, b) => sessionUpdatedAt(b) - sessionUpdatedAt(a))
}

/** Resolves only an explicitly selected session; it never falls back to list order. */
export function selectedSessionTarget(
  items: readonly SessionSummary[],
  selectedSessionId: string | undefined,
): SessionSummary | undefined {
  if (selectedSessionId === undefined) return undefined
  return items.find(item => item.sessionId === selectedSessionId)
}

/** Returns the numeric gateway timestamp used by recent-first sorting. */
export function sessionUpdatedAt(session: SessionSummary): number {
  return typeof session.updatedAt === 'number' && Number.isFinite(session.updatedAt) ? session.updatedAt : 0
}

/** Formats a session timestamp in the device's local time zone. */
export function formatSessionTime(updatedAt: unknown, now = Date.now()): string {
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return '时间未知'
  const date = new Date(updatedAt)
  if (!Number.isFinite(date.getTime())) return '时间未知'
  const current = new Date(now)
  const reference = Number.isFinite(current.getTime()) ? current : new Date()
  const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
  if (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  )
    return time
  const dateLabel =
    date.getFullYear() === reference.getFullYear()
      ? `${date.getMonth() + 1}月${date.getDate()}日`
      : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  return `${dateLabel} ${time}`
}

/** Resolves the desktop-compatible visible title for one session summary. */
export function sessionDisplayTitle(session: Pick<SessionSummary, 'blank' | 'title'> | undefined): string {
  if (session?.blank === true) return '新会话'
  const title = session?.title?.trim()
  return title === undefined || title === '' ? '新会话' : title
}

/** Returns the drawer's status label, prioritizing an active session over its timestamp. */
export function sessionTimeLabel(session: Pick<SessionSummary, 'running' | 'updatedAt'>, now = Date.now()): string {
  return session.running === true ? '处理中' : formatSessionTime(session.updatedAt, now)
}

/** Reports whether the desktop projected at least one named workspace. */
export function hasWorkspaceData(workspaces: readonly MobileWorkspace[]): boolean {
  return workspaces.length > 0
}

/** Reports whether one desktop session has a top-level row in the selected browser view. */
export function sessionVisible(session: SessionSummary, currentSessionId: string | undefined): boolean {
  return session.origin !== 'subagent' && (session.blank !== true || session.sessionId === currentSessionId)
}

/** Builds desktop-consistent workspace and ungrouped rows from authoritative workspace membership. */
export function sessionRows(
  items: readonly SessionSummary[],
  workspaces: readonly MobileWorkspace[],
  groupBy: 'workspace' | 'flat',
  currentSessionId?: string,
): Exclude<SessionDrawerRow, { kind: 'overflow' }>[] {
  if (groupBy === 'flat')
    return items
      .filter(session => sessionVisible(session, currentSessionId))
      .map(session => ({ kind: 'session', key: `session:${session.sessionId}`, session }))

  const byId = new Map(items.map(session => [session.sessionId, session]))
  const accounted = new Set<string>()
  const rows: Exclude<SessionDrawerRow, { kind: 'overflow' }>[] = []
  for (const workspace of workspaces) {
    const sessions: SessionSummary[] = []
    for (const sessionId of workspace.sessionIds) {
      accounted.add(sessionId)
      const session = byId.get(sessionId)
      if (session !== undefined && sessionVisible(session, currentSessionId)) sessions.push(session)
    }
    rows.push({ kind: 'workspace', key: `workspace:${workspace.workspaceId}`, label: workspaceLabel(workspace), workspace })
    rows.push(...sessions.map(session => ({ kind: 'session' as const, key: `session:${session.sessionId}`, session })))
  }

  const ungrouped = items
    .filter(session => !accounted.has(session.sessionId) && sessionVisible(session, currentSessionId))
    .sort((a, b) => sessionUpdatedAt(b) - sessionUpdatedAt(a))
  if (ungrouped.length > 0) {
    rows.push({ kind: 'workspace', key: 'workspace:ungrouped', label: '未分组' })
    rows.push(...ungrouped.map(session => ({ kind: 'session' as const, key: `session:${session.sessionId}`, session })))
  }
  return rows
}

/**
 * Keeps all workspace nodes visible while applying desktop-compatible expansion
 * and the per-workspace five-session overflow rule to their child rows.
 */
export function visibleWorkspaceRows(
  rows: readonly Exclude<SessionDrawerRow, { kind: 'overflow' }>[],
  collapsedWorkspaceKeys: ReadonlySet<string>,
  expandedWorkspaceSessionKeys: ReadonlySet<string>,
): SessionDrawerRow[] {
  const visible: SessionDrawerRow[] = []
  let workspace: Extract<SessionDrawerRow, { kind: 'workspace' }> | undefined
  let sessions: Extract<SessionDrawerRow, { kind: 'session' }>[] = []

  const flushWorkspace = (): void => {
    if (workspace === undefined) return
    visible.push(workspace)
    if (!collapsedWorkspaceKeys.has(workspace.key)) {
      const expanded = expandedWorkspaceSessionKeys.has(workspace.key)
      visible.push(...(expanded ? sessions : sessions.slice(0, COLLAPSED_WORKSPACE_SESSION_LIMIT)))
      if (sessions.length > COLLAPSED_WORKSPACE_SESSION_LIMIT) {
        visible.push({
          kind: 'overflow',
          key: `overflow:${workspace.key}`,
          workspaceKey: workspace.key,
          hiddenCount: sessions.length - COLLAPSED_WORKSPACE_SESSION_LIMIT,
          expanded,
        })
      }
    }
    sessions = []
  }

  for (const row of rows) {
    if (row.kind === 'workspace') {
      flushWorkspace()
      workspace = row
    } else {
      sessions.push(row)
    }
  }
  flushWorkspace()
  return visible
}

/** Uses the desktop title first and falls back to the final path segment for a workspace row. */
export function workspaceLabel(workspace: MobileWorkspace): string {
  if (workspace.title.trim() !== '') return workspace.title
  const path = workspace.path?.replace(/[\\/]+$/, '')
  const base = path?.split(/[\\/]/).at(-1)
  return base !== undefined && base !== '' ? base : workspace.workspaceId
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, '0')
}
