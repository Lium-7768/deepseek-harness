export type StoredSessionSelection = {
  deviceId: string
  gatewayUrl: string
  sessionId: string
}

type ConnectionIdentity = Pick<StoredSessionSelection, 'deviceId' | 'gatewayUrl'>

/**
 * Returns a locally remembered session only when it belongs to the active desktop and remains visible there.
 * @param selection - Locally persisted selection record.
 * @param connection - Active paired desktop identity.
 * @param sessionIds - Desktop-authoritative visible session identifiers.
 * @returns A valid session identifier, or undefined when it must not be restored.
 */
export function restorableSessionId(
  selection: StoredSessionSelection | undefined,
  connection: ConnectionIdentity,
  sessionIds: readonly string[],
): string | undefined {
  if (selection?.gatewayUrl !== connection.gatewayUrl || selection.deviceId !== connection.deviceId) return undefined
  return sessionIds.includes(selection.sessionId) ? selection.sessionId : undefined
}
