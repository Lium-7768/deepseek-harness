import { afterEach, describe, expect, it } from 'vitest'
import { useSessionSelectionStore } from '../src/state/session-selection.ts'

describe('session selection store', () => {
  afterEach(() => useSessionSelectionStore.getState().clearSelection())

  it('keeps the nested session route as the workspace send target', () => {
    useSessionSelectionStore.getState().selectSession('session-nested')
    expect(useSessionSelectionStore.getState().selectedSessionId).toBe('session-nested')
  })
})
