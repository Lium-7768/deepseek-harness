---
description: "Loopback-only mobile gateway for maintainers pairing one native mobile client with a running desktop DeepSeek Harness runtime."
kind: "package-reference"
---

# @deepseek-ai/dsh-mobile-gateway

English | [中文](README.zh.md)

## Summary

A loopback-only adapter between one desktop DeepSeek Harness runtime and a paired native mobile client. `MobileGateway` projects selected session, workspace, history, prompt, task, approval, and interaction operations into the mobile API. It returns desktop-owned workspace membership and archived-session ids so the native drawer preserves the desktop session tree, and it projects user-visible history without exposing internal agent protocol traffic.

## Table of Contents

- [Use this package](#use-this-package)
- [Real-time session projection](#real-time-session-projection)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Run `pnpm --filter @deepseek-ai/dsh-mobile-gateway bundle` to generate `lib/index.js` and `lib/types/index.d.ts`. An embedding application instantiates `MobileGateway` in-process and owns the desktop integration around it.

<a id="real-time-session-projection"></a>
## Real-time session projection

The gateway reaches the desktop runtime through the api-gateway wire protocol: unary Remote RPCs ride `POST /api`, and every DSH stream (forwarded Host events, session control, workspace follow, per-session follow) multiplexes over one loopback WebSocket at `/api/remote.mux`.

`POST /v1/sessions/running` returns only ids for running desktop sessions. A paired client creates a connection-owned session lease with `POST /v1/sessions/:sessionId/subscriptions`, then activates it with `POST /v1/subscriptions/:subscriptionId/activate`. Lease creation returns immediately with a durable-sequence watermark, cutover event id, activation token, and Gateway-owned transient snapshots; it does not wait for session history.

During activation the Gateway verifies the watermark and token, replays buffered durable events newer than the watermark, and changes the lease to live delivery over the existing authenticated `GET /v1/events` SSE connection. Durable history is read from the DSH `session/follow` stream snapshot with an optional `session/page` continuation for older windows. A bounded buffer that overflows requires the mobile client to reload authoritative history instead of accepting a silent event gap.

<a id="model-experience"></a>
## Model Experience

### Prompt forwarding and history projection

#### What the model sees

`MobileGateway` forwards admitted user prompts to the existing desktop runtime; it does not create a second prompt, model selection, or provider call path.

#### Token effect

None at the gateway layer; token accounting and prompt construction remain owned by the desktop runtime.

#### KV Cache effect

None at the gateway layer; the gateway does not reorder or rewrite model context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The gateway is local-runtime scoped** — it serves the desktop runtime that starts it and does not provide cloud session replication or a second agent runtime.
- **The mobile API is an allowlist** — desktop-local capabilities such as arbitrary filesystem access, credentials, unrestricted settings mutation, and raw terminal streams remain outside the adapter.
- **No shipping desktop host yet** — the repository's desktop application does not mount the gateway; an embedding application must instantiate it and own pairing storage, the listener port, and device credential persistence.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
