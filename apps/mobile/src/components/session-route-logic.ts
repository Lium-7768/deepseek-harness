/** Returns whether a mode option must stay disabled while session state is unavailable. */
export function modeOptionDisabled(input: {
  sessionsPending: boolean
  sessionsError: boolean
  blank: boolean
  broken: boolean
}): boolean {
  return input.sessionsPending || input.sessionsError || !input.blank || input.broken
}

/** Prevents permission writes while the host status is unknown, busy, or submitting. */
export function permissionOptionsLocked(input: {
  eventsError: boolean
  eventsPending: boolean
  eventsStale: boolean
  status: string | undefined
  submitting: boolean
}): boolean {
  return (
    input.eventsError ||
    input.eventsPending ||
    input.eventsStale ||
    input.status === 'running' ||
    input.status === 'waiting' ||
    input.submitting
  )
}

/** Prevents a second mode or model selection while the first write is settling. */
export function selectionOptionDisabled(submitting: boolean): boolean {
  return submitting
}

/** Returns the deterministic session route used after a session-detail action settles. */
export function sessionDetailReturnTarget(
  sessionId: string | undefined,
): '/workspace' | { pathname: '/session/[sessionId]'; params: { sessionId: string } } {
  return sessionId === undefined ? '/workspace' : { pathname: '/session/[sessionId]', params: { sessionId } }
}
