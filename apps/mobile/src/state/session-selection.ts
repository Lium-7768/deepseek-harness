import { create } from 'zustand'
import { useEffect } from 'react'

interface SessionSelectionState {
  selectedSessionId?: string
  selectSession(sessionId: string): void
  clearSelection(): void
}

/** Keeps the active session stable while the drawer and nested routes change. */
export const useSessionSelectionStore = create<SessionSelectionState>(set => ({
  selectedSessionId: undefined,
  selectSession: selectedSessionId => set({ selectedSessionId }),
  clearSelection: () => set({ selectedSessionId: undefined }),
}))

/** Synchronizes a session route parameter into the workspace selection store. */
export function useRouteSessionSelection(sessionId: string | undefined): void {
  const selectSession = useSessionSelectionStore(state => state.selectSession)
  useEffect(() => {
    if (sessionId !== undefined && sessionId !== '') selectSession(sessionId)
  }, [selectSession, sessionId])
}
