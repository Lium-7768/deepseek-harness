import * as SecureStore from 'expo-secure-store'
import type { MobileConnection } from '@/types/mobile'

const CONNECTION_KEY = 'dsh-mobile-connection-v1'

/** Reads the paired-device connection stored in the mobile operating system's secure storage. */
export async function loadConnection(): Promise<MobileConnection | undefined> {
  const encoded = await SecureStore.getItemAsync(CONNECTION_KEY)
  if (encoded === null) return undefined
  try {
    const value: unknown = JSON.parse(encoded)
    if (!isConnection(value)) return undefined
    return value
  } catch {
    return undefined
  }
}

/** Persists a desktop-issued device credential after the phone has been paired. */
export async function saveConnection(connection: MobileConnection): Promise<void> {
  await SecureStore.setItemAsync(CONNECTION_KEY, JSON.stringify(connection))
}

/** Deletes the local device credential without attempting to revoke it remotely. */
export async function clearConnection(): Promise<void> {
  await SecureStore.deleteItemAsync(CONNECTION_KEY)
}

function isConnection(value: unknown): value is MobileConnection {
  if (value === null || Array.isArray(value) || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.gatewayUrl === 'string' && typeof candidate.deviceId === 'string' && typeof candidate.accessToken === 'string'
}
