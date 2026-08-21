# Agent Note: RC.8 desktop client module resolution

Status: implemented

English | [中文](2026-08-21-rc8-desktop-client-module-resolution.zh.md)

## Problem

The RC.8 client assembly removes the former `@deepseek-ai/dsh-client-web-react` aggregate and mounts individual API remote contributions. The desktop Web shell resolves client bundle externals only from its frozen static module table. An omitted remote contract therefore stops the packaged desktop at the boot page, while a module namespace supplied for a `./remote` entry exposes `default` rather than the contribution's `descriptors` array and prevents `@deepseek-ai/dsh-api-remotes` from mounting. Separately, the desktop event mux and host endpoints use WebSocket in RC.8, but the Mobile Gateway loopback client still attempted an SSE subscription.

## Decision

`packages/client/web/src/platform.ts` declares the commands, goal, dynamic Cordis, file-reference, host-plugin-inventory, message-feedback, and session-reference remote specifiers as platform modules. `packages/client/web/src/seed.ts` statically imports their default exports and maps each specifier to that contribution object. The Web shell manifest lists the owner packages as build dependencies, and the packaged desktop runtime includes the Web application with React and React DOM so the staged runtime can resolve the same client assembly.

`DshLoopbackClient` opens authenticated WebSocket subscriptions for both desktop event channels and preserves the Mobile Gateway's existing authenticated mobile SSE projection. The Gateway keeps its device boundary and does not expose the desktop Web GUI or its raw event endpoints to the phone.

The desktop package is rebuilt from current client artifacts after the Web static bundle is rebuilt. This keeps static-linked JavaScript and emitted UI CSS aligned with the frozen module table copied into the Electron runtime.

## Verification

The Web frontend production build succeeds after the module table and its default remote imports are rebuilt. The packaged desktop application starts a local Web runtime and Mobile Gateway without client console errors. `node --test packages/mobile/gateway/tests/*.mjs` passes all 15 tests, including the mux and host WebSocket regression coverage. `vitest run apps/mobile/tests/` passes all 70 mobile tests, and `tsc --noEmit -p apps/mobile/tsconfig.json` succeeds. An iPhone 17 Pro simulator reconnects its mobile SSE stream to the rebuilt desktop Gateway after a cache-cleared Metro restart.

## Alternatives considered

**Keep the removed Web React aggregate.** This was rejected because RC.8 ships individual remote contracts. Reintroducing an obsolete aggregate would hide the actual ownership of the mounted remote namespaces and diverge from upstream package exports.

**Resolve remote contracts dynamically from the profile.** This was rejected because client bundles require shared singleton externals. The frozen Web table is the supported static assembly path and turns an omitted remote into a build-visible declaration mismatch rather than profile-dependent desktop boot behavior.

**Keep the Mobile Gateway on SSE for desktop event inputs.** This was rejected because the desktop mux and host transports are WebSocket in RC.8. The Gateway converts only the authenticated mobile-facing projection to SSE, which retains the established native reconnect interface without copying the desktop protocol.

## Consequences

A future API remote mounted by `@deepseek-ai/dsh-api-remotes` requires its package dependency, platform word, and default contribution entry in the Web static table. Browser-facing package updates also require regenerating their static-linked client artifacts and the Web frontend before Electron packaging. Mobile consumers continue to receive the existing versioned, authenticated SSE stream while the Gateway follows the desktop WebSocket transport upstream.
