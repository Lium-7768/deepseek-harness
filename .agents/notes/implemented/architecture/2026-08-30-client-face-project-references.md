# Agent Note: Client face project references

Status: implemented

English | [中文](2026-08-30-client-face-project-references.zh.md)

## Problem

`packages/client/web` imports six host packages for its frozen static module table. Each `./remote` and `./typert` declaration file re-exports host types, and `tsconfig.base.json` `paths` resolves those workspace names to `src`. Without a project reference the client program compiled that host `src` as its own input instead of redirecting to the host build's declaration output, so host-only globals reached the client face: `node:buffer` and `node:module` failed `TS2591`, `Symbol.dispose` failed `TS2550`, and a `@deepseek-ai/dsh-session-projection/types` augmentation failed `TS2664`.

`injectWorkspacePackages: true` hid this. Materializing every workspace dependency as a `lib`-only copy removed `src` from the resolved graph, so the client face never saw host sources — and no deep `src` import resolved either, which the source plane requires.

## Decision

`pnpm-workspace.yaml` keeps `linkWorkspacePackages: true` and drops `injectWorkspacePackages: true`; workspace dependencies are symlinks again, and deep `src` imports resolve through each package's `"./src/*"` export. `packages/client/web/tsconfig.json` declares a project reference for every host package its module table names, matching how `packages/client/ui-goal` already references `packages/goal/goal`.

A project reference is what redirects a workspace import to its declaration output. `paths` alone only names the source, so the two settings must agree: every host package a client program imports needs a reference, and adding a module-table word without one returns the same host-globals failures.

## Consequences

The client face compiles against host declaration output, so host-only globals stay out of it, and the desktop Electron closure keeps working because its deploy step already copies workspace leftovers with `dereference: true` rather than relying on materialized dependencies. Adding a remote contract to the Web static module table now takes three coordinated edits — the package dependency, the `platform.ts` word and `seed.ts` entry pair that `satisfies Record<PlatformModule, unknown>` enforces, and the `tsconfig.json` reference.

Running `tsc -b tsconfig.client.json` alone reports host-globals errors on a tree whose host face was never built. `pnpm run typecheck` builds the host face first; the standalone client build is not a valid signal.

## Alternatives considered

- Keeping `injectWorkspacePackages: true`: it breaks every deep `src` import the source plane depends on, and no Agent Note or desktop document defended the setting.
- Widening `tsconfig.base.client.json` `lib` or `types` to accept the host globals: it would let genuinely host-only API compile into client bundles, which is the failure the split faces exist to catch.
- Dropping the host imports from the module table: the frozen table is what the packaged desktop resolves bundle externals from, and an omitted remote contract stops it at the boot page.
