import { useEffect } from 'react'
import { create } from 'zustand'
import {
  clearStoredSessionSelection,
  loadStoredSessionSelection,
  saveStoredSessionSelection,
} from '@/api/session-selection-store'
import { restorableSessionId } from '@/state/session-selection-logic'
import type { MobileConnection } from '@/types/mobile'

interface SessionSelectionState {
  selectedSessionId?: string
  clearSelection(): Promise<void>
  restoreSelection(connection: MobileConnection, sessionIds: readonly string[]): Promise<void>
  selectSession(connection: MobileConnection, sessionId: string): Promise<void>
  selectSessionForRoute(sessionId: string): void
}

/** Keeps the active session stable across native navigation and safe application reloads. */
export const useSessionSelectionStore = create<SessionSelectionState>(set => ({
  selectedSessionId: undefined,
  async clearSelection(): Promise<void> {
    await clearStoredSessionSelection()
    set({ selectedSessionId: undefined })
  },
  async restoreSelection(connection: MobileConnection, sessionIds: readonly string[]): Promise<void> {
    const stored = await loadStoredSessionSelection()
    const sessionId = restorableSessionId(stored, connection, sessionIds)
    if (sessionId === undefined && stored !== undefined) await clearStoredSessionSelection()
    set({ selectedSessionId: sessionId })
  },
  async selectSession(connection: MobileConnection, sessionId: string): Promise<void> {
    await saveStoredSessionSelection(connection, sessionId)
    set({ selectedSessionId: sessionId })
  },
  selectSessionForRoute(sessionId: string): void {
    set({ selectedSessionId: sessionId })
  },
}))

/** Synchronizes a nested session route into the transient workspace selection state. */
export function useRouteSessionSelection(sessionId: string | undefined): void {
  const selectSessionForRoute = useSessionSelectionStore(state => state.selectSessionForRoute)
  useEffect(() => {
    if (sessionId !== undefined && sessionId !== '') selectSessionForRoute(sessionId)
  }, [selectSessionForRoute, sessionId])
}
