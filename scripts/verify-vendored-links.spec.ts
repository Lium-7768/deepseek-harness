import { describe, expect, it } from 'vitest'
import {
  isVendoredWorkspacePackageKey,
  isVendoredWorkspaceResolution,
} from './verify-vendored-links.ts'

describe('isVendoredWorkspaceResolution', () => {
  const cordisDirectory = 'vendor/cordis'

  it('accepts ordinary workspace links', () => {
    expect(isVendoredWorkspaceResolution('link:../../vendor/cordis', cordisDirectory)).toBe(true)
  })

  it('accepts the exact injected workspace locator with or without peer suffixes', () => {
    expect(isVendoredWorkspaceResolution('file:vendor/cordis', cordisDirectory)).toBe(true)
    expect(
      isVendoredWorkspaceResolution(
        'file:vendor/cordis(@deepseek-ai/cordis-plugin-loader@1.0.2)',
        cordisDirectory,
      ),
    ).toBe(true)
  })

  it('rejects registry versions and local paths outside the owning vendor directory', () => {
    expect(isVendoredWorkspaceResolution('4.0.1', cordisDirectory)).toBe(false)
    expect(isVendoredWorkspaceResolution('file:packages/core/session', cordisDirectory)).toBe(false)
    expect(isVendoredWorkspaceResolution('file:vendor/loader', cordisDirectory)).toBe(false)
  })

  it('accepts only exact injected workspace package and snapshot keys', () => {
    expect(
      isVendoredWorkspacePackageKey(
        '@deepseek-ai/cordis@file:vendor/cordis(@deepseek-ai/cordis-plugin-loader@1.0.2)',
        '@deepseek-ai/cordis',
        cordisDirectory,
      ),
    ).toBe(true)
    expect(isVendoredWorkspacePackageKey('@deepseek-ai/cordis@4.0.1', '@deepseek-ai/cordis', cordisDirectory)).toBe(false)
    expect(isVendoredWorkspacePackageKey('@deepseek-ai/cordis@file:vendor/loader', '@deepseek-ai/cordis', cordisDirectory)).toBe(false)
  })
})
