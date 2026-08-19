import { create } from 'zustand'
import type { MobileSyncStatus } from '@/types/mobile'

type MobileSyncState = {
  status: MobileSyncStatus
  lastEventAt?: number
  setStatus: (status: MobileSyncStatus) => void
  markEvent: () => void
}

/** Holds only mobile transport liveness; durable session data stays on the desktop. */
export const useMobileSyncStore = create<MobileSyncState>(set => ({
  status: 'disconnected',
  setStatus: status => set({ status }),
  markEvent: () => set({ lastEventAt: Date.now() }),
}))
