# Mobile Gateway Runtime Payload

This directory retains the self-contained ECMAScript module that was used during the **2026-08-18** local desktop-app validation to replace the mobile gateway payload inside an already-built DeepSeek Harness application bundle. It is retained as an auditable maintenance artifact; it is **not** an application entry point, a development server, or the source of truth for the mobile gateway.

## What the payload contains

`index.mjs` is a bundled snapshot of the mobile gateway module. It exports the `DshLoopbackClient`, `DshLoopbackError`, `MobileDeviceRegistry`, and `MobileGateway` runtime symbols. The snapshot is intended only for controlled recovery or inspection of a previously deployed desktop bundle.

> **Do not copy this snapshot into a newly built desktop application.** It predates the current workspace-aware session-list projection and therefore does not include the `workspace.list` integration required by the current React Native drawer.

| Concern | Maintained location |
|---|---|
| Gateway source code | `packages/mobile/gateway/src/` |
| Gateway package entry | `packages/mobile/gateway/src/index.ts` |
| Reproducible bundled output | `packages/mobile/gateway/lib/index.mjs` after the build command |
| Historical runtime snapshot | `scripts/mobile-gateway-runtime-payload/index.mjs` |

## Regenerate a current payload

Use Node.js 22 and build the gateway package from its canonical TypeScript source. The generated `lib/` directory is intentionally ignored because it is reproducible.

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
pnpm --filter @deepseek-ai/dsh-mobile-gateway bundle
```

The current runtime module is then available at:

```text
packages/mobile/gateway/lib/index.mjs
```

Only copy that freshly generated file into a desktop application bundle when performing an explicit, controlled desktop recovery operation. Stop the desktop application first, preserve a backup of the original archive, and validate pairing, session synchronization, workspace grouping, and message exchange after repacking. Regular development and releases must continue to use the normal desktop build pipeline instead.

## Validation

Before treating a regenerated bundle as usable, run the gateway integration tests from the repository root:

```bash
node --test packages/mobile/gateway/tests/mobile-gateway.integration.mjs
```

The test suite verifies paired-device request handling and normalized desktop history events. UI behavior and workspace tree presentation remain covered by the mobile application’s type checks and component logic tests.
