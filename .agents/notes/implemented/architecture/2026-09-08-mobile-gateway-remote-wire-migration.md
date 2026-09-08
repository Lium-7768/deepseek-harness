# Agent Note: Mobile Gateway rides the unified Remote wire protocol

Status: implemented

English | [中文](2026-09-08-mobile-gateway-remote-wire-migration.zh.md)

## Problem

The api-gateway replaced the desktop downlink surface the Mobile Gateway was built on: the SSE downlinks `/api/events.mux` and `/api/events.host` with server-pushed `server-request` frames, and the per-method HTTP endpoints under `/api/<namespace>.<method>`, are gone. In their place the unified Remote protocol serves unary RPCs at `POST /api` and multiplexes client-opened logical streams over one WebSocket at `/api/remote.mux`. After the platform branch took master's api-gateway, every upstream call the gateway made broke, so the loopback client and all route handlers had to migrate or the gateway would serve nothing.

## Decision

`DshLoopbackClient` speaks the unified wire. `call(endpoint, args)` posts `{type: 'client-request', rpcId, method, payload: {args}}` with the loopback `host` header — the gateway needs no browser auth cookie on the loopback trust fence — and unwraps the `server-response` result envelope, mapping upstream `error` payloads to a typed `upstream-rejected` failure. `open(endpoint, args, signal)` connects one WebSocket to `/api/remote.mux`, sends `open`/`cancel` frames with a gateway-generated `streamId`, and yields `item` values until `end`, an `error` frame, or caller abort.

The gateway's upstream surface shrinks to gateway-owned streams plus per-session follows. Three streams run for the gateway lifetime: forwarded Host events (`$events`), session control (`session/control`), and workspace follow (`workspace/follow`). Each live subscription lazily opens one `session/follow` stream for its session and the gateway releases it when no subscription needs it, so per-session streams stay bounded by paired-device subscriptions. Queue and job snapshots moved from mux frames to `session/control` baseline and delta frames; session titles and blank metadata moved from per-session history reads to control-stream projections.

Route handlers keep the mobile HTTP contract unchanged — every `/v1/...` path, the response envelope, the SSE event types, and Bearer device auth stay as before — and translate to the new Remote methods: queue mutation through `session/updateQueue`, goals through `goals/*` with `agentId`/`ref` scoped arguments, subagents through `subagents/list`, `subagents/prompt`, and `subagents/interruptByParent`, message feedback through `messageFeedback/*`, and interaction answers through `$events/result` after the gateway validates the responding device's payload against the remembered waterfall request.

## Alternatives considered

**Keep the retired downlink protocol alive on the platform branch.** The gateway would diverge from master's client, keep dead code paths, and still break when master's gateway endpoints disappear entirely.

**Expose the Remote protocol directly to native clients.** That couples mobile to a desktop-internal wire format and exposes fields outside the paired-device API; the constrained `/v1/...` envelope stays the mobile contract.

**Poll unary RPCs instead of holding streams.** Polling reintroduces the delayed-visible-work problem the subscription design already solved and loses real-time forwarded events.

## Consequences

One protocol serves the whole gateway↔desktop surface, and the mobile-facing contract is untouched, so the native client needs no change. Per-session upstream work is proportional to live subscriptions rather than the session count. History reads now ride the `session/follow` snapshot with an optional `session/page` continuation for older windows instead of a dedicated history endpoint.

## Verification

The loopback-client suite verifies unary calls, error mapping, `$events/result` answering, stream item consumption, error frames, and caller-abort cancellation against a fixture that speaks the unified wire. The integration suite exercises every mobile route group — pairing, history, lifecycle paging, prompts, queue and job snapshots, SSE host events, subscription replay, goal and subagent controls, plan review, search, attachments, projections, running-state baselines, and failed result reporting — against a fixture DSH serving `POST /api` and `/api/remote.mux`. Repository typecheck and lint pass.
