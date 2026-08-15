import { create } from 'zustand'
import { clearConnection, loadConnection, saveConnection } from '@/api/connection-store'
import type { MobileConnection } from '@/types/mobile'

interface ConnectionState {
  connection?: MobileConnection
  initialized: boolean
  initialize(): Promise<void>
  setConnection(connection: MobileConnection): Promise<void>
  forgetConnection(): Promise<void>
}

/** Holds only device-scoped connection metadata for the native mobile client. */
export const useConnectionStore = create<ConnectionState>(set => ({
  initialized: false,
  async initialize(): Promise<void> {
    const connection = await loadConnection()
    set({ connection, initialized: true })
  },
  async setConnection(connection: MobileConnection): Promise<void> {
    await saveConnection(connection)
    set({ connection })
  },
  async forgetConnection(): Promise<void> {
    await clearConnection()
    set({ connection: undefined })
  },
}))
