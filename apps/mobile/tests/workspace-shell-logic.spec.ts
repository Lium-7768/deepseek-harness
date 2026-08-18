import { describe, expect, it } from 'vitest'
import { workspaceHeaderMinHeight, workspaceKeyboardVerticalOffset } from '../src/components/workspace-shell-logic.ts'
import { mobileTheme } from '../src/theme.ts'

describe('workspace shell geometry', () => {
  it('keeps the shell header minimums derived from shared chrome tokens', () => {
    expect(workspaceHeaderMinHeight(false)).toBe(mobileTheme.chrome.headerHeight)
    expect(workspaceHeaderMinHeight(true)).toBe(mobileTheme.chrome.headerHeight + mobileTheme.chrome.headerMetaHeight)
  })

  it('adds the device top inset to the content keyboard offset', () => {
    expect(workspaceKeyboardVerticalOffset(59, false)).toBe(59 + mobileTheme.chrome.headerHeight)
    expect(workspaceKeyboardVerticalOffset(59, true)).toBe(
      59 + mobileTheme.chrome.headerHeight + mobileTheme.chrome.headerMetaHeight,
    )
    expect(workspaceKeyboardVerticalOffset(Number.NaN, false)).toBe(mobileTheme.chrome.headerHeight)
  })
})
