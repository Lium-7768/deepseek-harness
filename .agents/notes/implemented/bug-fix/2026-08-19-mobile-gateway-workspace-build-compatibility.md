# Agent Note: Mobile gateway workspace build compatibility

Status: implemented

English | [中文](2026-08-19-mobile-gateway-workspace-build-compatibility.zh.md)

## Problem

The host workspace build includes `packages/mobile/gateway`, whose public package entry and desktop runtime payload use `lib/index.mjs`. The current tsdown defaults emitted `.js` output for that package. The injected workspace package layout also exposes built package files rather than every package `src` directory, while host and client tests intentionally import selected source subpaths. TypeScript 6 declaration generation for the gateway requires a Babel generator release compatible with rolldown-plugin-dts.

## Decision

`packages/mobile/gateway/tsdown.config.ts` explicitly maps ESM JavaScript output to `.mjs`, so its JavaScript and declaration filenames match `@deepseek-ai/dsh-mobile-gateway` package metadata and the desktop runtime loader. `tsconfig.base.json` maps the source subpaths used by host and client tests to their repository source directories, and `tsconfig.client.json` references `packages/client/ui-shared`; the shared package test is a client-face test. `pnpm-workspace.yaml` keeps `@babel/generator` 7.29.8 scoped to the React Native Worklets extension while resolving `rolldown-plugin-dts` to `@babel/generator` 8.0.0-rc.6 for TypeScript 6 declaration output.

## Alternatives considered

**Changing the mobile gateway package metadata and desktop runtime to `.js`** was rejected because the packaged runtime and existing integration test intentionally load `lib/index.mjs`; changing the public entry would create an unnecessary runtime migration.

**Keeping a global Babel generator override** was rejected because it forces the declaration generator to use the React Native-specific version and fails while printing TypeScript 6 AST nodes.

**Rewriting source-subpath tests to import built files** was rejected because static TypeScript checks must resolve workspace code through repository source paths and remain runnable without prebuilt dependency artifacts.

## Consequences

The mobile gateway produces `lib/index.mjs` and `lib/index.d.mts` on every workspace build. The root typecheck, mobile TypeScript check, and gateway integration test verify the shared workspace configuration. The React Native Worklets build retains its required generator dependency without selecting it for host declaration generation.
