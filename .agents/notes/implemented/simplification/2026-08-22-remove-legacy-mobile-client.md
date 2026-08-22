# Agent Note: Remove the legacy mobile client from the desktop workspace

Status: implemented

English | [中文](2026-08-22-remove-legacy-mobile-client.zh.md)

## Problem

The desktop workspace contained a complete Expo and React Native client under `apps/mobile` after the independently versioned `deepseek-harness-mobile` repository became the native client's source of truth. The duplicate workspace retained native build metadata, mobile-only dependencies, and a shared presentation package that no desktop or web module consumed.

## Decision

The desktop workspace contains no native client application. The independently versioned mobile repository owns its Expo project, native iOS and Android files, mobile presentation types, and mobile release automation. The desktop workspace retains `packages/mobile/gateway` because `apps/desktop` uses it to provide authenticated pairing, allowlisted HTTP and SSE projection, and replay for paired native devices.

The cleanup removes `apps/mobile`, `packages/client/ui-shared`, the mobile-only pnpm patch and package extension, their lockfile entries, and stale generated catalog and translation-manifest references. The workspace source-path aliases cover exported `src/*` imports used by existing PowerShell, renderer, and settings client tests.

## Alternatives considered

**Keep the old client as a workspace consumer.** This would preserve a second native build entrypoint and allow the old UI to drift from the independent repository, while keeping Expo dependencies coupled to desktop installation and release work.

**Move the Mobile Gateway to the independent mobile repository.** The Gateway runs inside the desktop process and enforces the boundary around the desktop runtime, so placing it with the client would break its ownership and deployment model.

**Retain the shared presentation package for possible future reuse.** The package has no active consumer after the client removal. Retaining it would create an unsupported workspace surface without an owner or test target.

## Consequences

Desktop and web development no longer installs, builds, or tests a native Expo application. Native client changes occur only in `deepseek-harness-mobile`; desktop changes that affect mobile pairing or synchronization remain in `packages/mobile/gateway` and `apps/desktop`.

The repository keeps historical Agent Notes that describe the former client paths as immutable records. Current generated documentation and active configuration contain no references to the removed packages.

## Verification

The workspace lockfile resolves without the removed Expo and shared-presentation dependencies. The Mobile Gateway package builds and its integration tests run from the desktop workspace. The repository build, generated configuration catalog, bilingual catalog pairing, package-path validation, and documentation gates cover the remaining desktop and gateway surfaces.
