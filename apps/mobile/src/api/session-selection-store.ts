import * as SecureStore from 'expo-secure-store'
import { type StoredSessionSelection } from '@/state/session-selection-logic'
import type { MobileConnection } from '@/types/mobile'

const SESSION_SELECTION_KEY = 'dsh-mobile-session-selection-v1'

/**
 * Reads the last selected desktop session identifier from protected local storage.
 * @returns A device-bound session selection when the stored record is valid.
 */
export async function loadStoredSessionSelection(): Promise<StoredSessionSelection | undefined> {
  const encoded = await SecureStore.getItemAsync(SESSION_SELECTION_KEY)
  if (encoded === null) return undefined
  try {
    const value: unknown = JSON.parse(encoded)
    return isStoredSessionSelection(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Stores the selected session identifier for the currently paired desktop device.
 * @param connection - Paired mobile connection that owns the selected session.
 * @param sessionId - Desktop-issued session identifier.
 * @returns A promise that resolves after the selection is protected locally.
 */
export async function saveStoredSessionSelection(connection: MobileConnection, sessionId: string): Promise<void> {
  await SecureStore.setItemAsync(
    SESSION_SELECTION_KEY,
    JSON.stringify({ deviceId: connection.deviceId, gatewayUrl: connection.gatewayUrl, sessionId }),
  )
}

/** Clears the locally remembered session selection without affecting desktop session state. */
export async function clearStoredSessionSelection(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_SELECTION_KEY)
}

function isStoredSessionSelection(value: unknown): value is StoredSessionSelection {
  if (value === null || Array.isArray(value) || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.gatewayUrl === 'string'
    && candidate.gatewayUrl.trim() !== ''
    && typeof candidate.deviceId === 'string'
    && candidate.deviceId.trim() !== ''
    && typeof candidate.sessionId === 'string'
    && candidate.sessionId.trim() !== ''
  )
}
