import { mobileTheme } from '../theme'

/** Returns the minimum shell header height for the requested metadata rows.
 * @param hasHeaderMeta - Whether the shell renders a metadata row.
 * @returns The minimum header height in logical pixels.
 */
export function workspaceHeaderMinHeight(hasHeaderMeta: boolean): number {
  return mobileTheme.chrome.headerHeight + (hasHeaderMeta ? mobileTheme.chrome.headerMetaHeight : 0)
}

/** Returns the keyboard offset from the screen top to a shell content view.
 * @param topInset - The top safe-area inset reported by the device.
 * @param hasHeaderMeta - Whether the shell renders a metadata row.
 * @returns The keyboard offset in logical pixels.
 */
export function workspaceKeyboardVerticalOffset(topInset: number, hasHeaderMeta: boolean): number {
  const safeTop = Number.isFinite(topInset) && topInset > 0 ? topInset : 0
  return safeTop + workspaceHeaderMinHeight(hasHeaderMeta)
}
