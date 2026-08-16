import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MobileDeviceSnapshot } from '@deepseek-ai/dsh-mobile-gateway'

/** Loads locally persisted device token hashes without ever reading plaintext credentials. */
export async function loadDeviceSnapshots(filePath: string): Promise<readonly MobileDeviceSnapshot[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isMobileDeviceSnapshot)
  } catch (error) {
    if (isMissingFile(error)) return []
    throw new Error(`Could not read paired-device data: ${errorMessage(error)}`)
  }
}

/** Atomically writes paired-device token hashes with owner-only file permissions. */
export async function saveDeviceSnapshots(filePath: string, snapshots: readonly MobileDeviceSnapshot[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporaryPath, JSON.stringify(snapshots), { encoding: 'utf8', mode: 0o600 })
  await rename(temporaryPath, filePath)
}

function isMobileDeviceSnapshot(value: unknown): value is MobileDeviceSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.deviceId === 'string' && typeof candidate.label === 'string' && typeof candidate.createdAt === 'string' && typeof candidate.tokenHash === 'string' && (candidate.revokedAt === undefined || typeof candidate.revokedAt === 'string')
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
