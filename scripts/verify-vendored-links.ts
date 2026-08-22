/**
 * Verify that pnpm-lock.yaml resolves every vendored package name to a local
 * workspace path — never a registry copy. `linkWorkspacePackages: true`
 * (pnpm-workspace.yaml) resolves matching upstream semver ranges to pinned
 * vendored sources. `injectWorkspacePackages: true` may serialize peer-aware
 * workspace resolutions as `file:vendor/<directory>(...)` instead of `link:`.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import * as yaml from 'js-yaml'

const root = resolve(import.meta.dirname, '..')

interface Lockfile {
  importers?: Record<string, Record<string, unknown>>
  packages?: Record<string, unknown>
  snapshots?: Record<string, unknown>
}

/** Return the exact `file:` locator emitted for one vendored workspace path. */
function vendorFileLocator(directory: string): string {
  return `file:${directory}`
}

/**
 * Return whether one importer resolution stays inside a vendored workspace.
 * @param version - Lockfile resolution recorded for the dependency.
 * @param directory - Repository-relative vendor directory owning the package.
 * @returns `true` for a workspace link or the exact peer-aware local file locator.
 */
export function isVendoredWorkspaceResolution(version: string, directory: string): boolean {
  if (version.startsWith('link:')) return true
  const locator = vendorFileLocator(directory)
  return version === locator || version.startsWith(`${locator}(`)
}

/**
 * Return whether one materialized package or snapshot key stays inside a vendored workspace.
 * @param key - pnpm package or snapshot key.
 * @param packageName - Vendored package name.
 * @param directory - Repository-relative vendor directory owning the package.
 * @returns `true` for the exact peer-aware local file key.
 */
export function isVendoredWorkspacePackageKey(key: string, packageName: string, directory: string): boolean {
  const locator = `${packageName}@${vendorFileLocator(directory)}`
  return key === locator || key.startsWith(`${locator}(`)
}

/** Read package names together with their repository-relative vendor directories. */
async function vendoredPackages(): Promise<Map<string, string>> {
  const packages = new Map<string, string>()
  for (const entry of await readdir(join(root, 'vendor'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = `vendor/${entry.name}`
    let manifest: { name?: string }
    try {
      manifest = JSON.parse(await readFile(join(root, directory, 'package.json'), 'utf8')) as { name?: string }
    } catch {
      continue // not a package directory (e.g. vendor/README.md siblings)
    }
    if (manifest.name !== undefined) packages.set(manifest.name, directory)
  }
  return packages
}

/** Verify vendored importer resolutions and reject materialized registry copies. */
async function main(): Promise<void> {
  const packages = await vendoredPackages()
  if (packages.size === 0) throw new Error('verify-vendored-links: no vendored package manifests found under vendor/')
  const lockfile = yaml.load(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')) as Lockfile
  const violations: string[] = []

  // Importer resolutions must name a local workspace path. Peer-aware injected
  // workspaces use file:vendor/<directory>(...) while ordinary workspaces use link:.
  for (const [importer, sections] of Object.entries(lockfile.importers ?? {})) {
    for (const [section, dependencies] of Object.entries(sections)) {
      if (typeof dependencies !== 'object' || dependencies === null) continue
      for (const [dependency, entry] of Object.entries(dependencies as Record<string, { version?: string }>)) {
        const directory = packages.get(dependency)
        if (directory === undefined) continue
        const version = entry.version ?? ''
        if (!isVendoredWorkspaceResolution(version, directory)) {
          violations.push(
            `${importer} ${section}.${dependency} resolves to ${JSON.stringify(version)} `
            + `(expected link: or ${JSON.stringify(vendorFileLocator(directory))} with an optional peer suffix)`,
          )
        }
      }
    }
  }

  // Package/snapshot keys may materialize injected workspaces as
  // `<name>@file:vendor/<directory>(...)`; registry versions and other file paths
  // remain invalid because they fork the vendored framework identity.
  for (const section of ['packages', 'snapshots'] as const) {
    for (const key of Object.keys(lockfile[section] ?? {})) {
      for (const [packageName, directory] of packages) {
        if (!key.startsWith(`${packageName}@`)) continue
        if (!isVendoredWorkspacePackageKey(key, packageName, directory)) {
          violations.push(`${section} entry ${key} does not resolve to ${vendorFileLocator(directory)}`)
        }
        break
      }
    }
  }

  if (violations.length > 0) {
    console.error(`verify-vendored-links: ${String(violations.length)} lockfile resolution(s) bypass the vendored workspaces:`)
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exitCode = 1
    return
  }
  console.log(`verify-vendored-links: all ${String(packages.size)} vendored package names resolve to local workspaces.`)
}

if (import.meta.main) await main()
