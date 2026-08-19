/** Pixel distance from the message list end that still counts as reading the latest conversation. */
export const LATEST_MESSAGE_PROXIMITY_PX = 72

/** Reports whether a list viewport is at or close enough to the newest visible message. */
export function isNearLatestMessage(
  contentHeight: number,
  viewportHeight: number,
  offsetY: number,
  proximityPx = LATEST_MESSAGE_PROXIMITY_PX,
): boolean {
  if (![contentHeight, viewportHeight, offsetY, proximityPx].every(Number.isFinite)) return false
  return contentHeight - viewportHeight - Math.max(0, offsetY) <= Math.max(0, proximityPx)
}

/** Decides whether the native conversation should expose a manual return-to-latest control. */
export function shouldShowReturnToLatest({ hasMessages, nearLatest }: { hasMessages: boolean; nearLatest: boolean }): boolean {
  return hasMessages && !nearLatest
}

/** Decides whether the native list may move to the latest message without overriding deliberate history reading. */
export function shouldScrollToLatest({
  hasMessages,
  initialPositionPending,
  nearLatest,
}: {
  hasMessages: boolean
  initialPositionPending: boolean
  nearLatest: boolean
}): boolean {
  return hasMessages && (initialPositionPending || nearLatest)
}
