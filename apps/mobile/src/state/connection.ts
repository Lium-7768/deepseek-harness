import { create } from 'zustand'
import { clearConnection, loadConnection, saveConnection } from '@/api/connection-store'
import type { MobileConnection } from '@/types/mobile'

let initialization: Promise<void> | undefined

interface ConnectionState {
  connection?: MobileConnection
  initialized: boolean
  initialize(): Promise<void>
  setConnection(connection: MobileConnection): Promise<void>
  forgetConnection(): Promise<void>
}

/** Holds only device-scoped connection metadata for the native mobile client. */
export const useConnectionStore = create<ConnectionState>((set, get) => ({
  initialized: false,
  async initialize(): Promise<void> {
    if (get().initialized) return
    if (initialization !== undefined) return initialization
    initialization = loadConnection()
      .then((connection) => {
        set({ connection, initialized: true })
      })
      .finally(() => {
        initialization = undefined
      })
    return initialization
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
