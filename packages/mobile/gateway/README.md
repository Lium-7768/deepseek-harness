# @deepseek-ai/dsh-mobile-gateway

English | [中文](README.zh.md)

A loopback-only adapter between one desktop DeepSeek Harness runtime and a paired native mobile client. `MobileGateway` projects selected session, workspace, history, prompt, task, approval, and interaction operations into the mobile API. It returns desktop-owned workspace membership and archived-session ids so the native drawer preserves the desktop session tree, and it projects user-visible history without exposing internal agent protocol traffic.

Run `pnpm --filter @deepseek-ai/dsh-mobile-gateway bundle` to generate `lib/index.mjs` and `lib/index.d.mts`. The desktop packaging flow copies this built package into the desktop runtime; the source file under `scripts/mobile-gateway-runtime-payload/` is an archival snapshot and is not a runtime entry.

## Model Experience

### Prompt forwarding and history projection

#### What the model sees

`MobileGateway` forwards admitted user prompts to the existing desktop runtime; it does not create a second prompt, model selection, or provider call path.

#### Token effect

None at the gateway layer; token accounting and prompt construction remain owned by the desktop runtime.

#### KV Cache effect

None at the gateway layer; the gateway does not reorder or rewrite model context.

## Known Limitations and Deferred Work

- **The gateway is local-runtime scoped** — it serves the desktop runtime that starts it and does not provide cloud session replication or a second agent runtime.
- **The mobile API is an allowlist** — desktop-local capabilities such as arbitrary filesystem access, credentials, unrestricted settings mutation, and raw terminal streams remain outside the adapter.
- **Runtime payload replacement is a controlled packaging operation** — a desktop distribution must use a freshly built `lib/index.mjs`, not the archived snapshot.
