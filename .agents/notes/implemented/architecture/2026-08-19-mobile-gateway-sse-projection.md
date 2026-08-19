# Agent Note: Mobile Gateway SSE projection

Status: implemented

English | [中文](2026-08-19-mobile-gateway-sse-projection.zh.md)

## Problem

The native mobile client previously refreshed desktop session events, queue state, and pending interactions through independent 2.5-second queries. The separate polling cycles delayed visible desktop changes and could briefly render a queue, interaction list, and session state from different desktop moments. A Gateway restart also needed an explicit client recovery path.

## Decision

The Mobile Gateway exposes an authenticated `GET /v1/events` Server-Sent Events stream. It normalizes the existing desktop DSH mux and host downlinks into a versioned mobile event envelope with an ephemeral gateway event id, event type, payload, optional session id, optional durable session sequence, and a snapshot marker for whole-state frames.

The Gateway remains a thin projection. It forwards session durable events, host session/workspace status, queue snapshots, and interaction frames from DSH. It retains only the existing pending-interaction and queue snapshots needed to serve its narrow HTTP API. It does not own a session database, replay log, Agent Loop, or client-specific business state.

The React Native root mounts one `MobileSyncBridge`. While the app is active it opens one authenticated SSE connection using the paired-device credential, tracks only transport liveness in a small store, and updates existing TanStack Query caches. It closes on background/inactive lifecycle transitions and reconnects with bounded backoff. On each `gateway/ready` baseline it invalidates durable history and transient snapshots so the mobile cache reloads from the desktop authority.

Session events are deduplicated by their durable sequence in the `session-events` cache. Queue frames replace the queue cache because they are host-owned whole snapshots. Interaction and workspace frames invalidate only their corresponding query families. This removes high-frequency polling from session, interaction, queue, and permission views while preserving initial HTTP reads and manual retry behavior.

## Recovery semantics

A mobile Gateway client receives a `gateway/ready` baseline immediately after authentication. The mobile app then refetches session history, events, interactions, queues, and active session lists. Durable history continues to use the desktop `seq` cursor and paging APIs; transient queue and interaction state is reloaded as a desktop snapshot rather than reconstructed locally.

The Gateway reconnects its DSH mux and host streams after an upstream closure. Host stream reconnection is only maintained while a mobile SSE client is present. Gateway shutdown aborts upstream streams, clears retry timers, and closes downstream SSE clients.

## Alternatives considered

**Continue independent polling.** It retained a simple transport but left visible latency, redundant requests, and short-lived inconsistencies between related queries. It was rejected for active session synchronization.

**Create a separate persisted mobile Session Store.** It could replay events locally, but would duplicate desktop state ownership and create conflict/recovery logic outside DSH. It was rejected because desktop/Web remains the sole authority.

**Expose the desktop mux protocol directly to native clients.** That would couple the app to a desktop-internal wire format and expose fields not needed by mobile rendering. The Gateway-specific versioned envelope was chosen instead.

**Use WebSocket.** Bidirectional streaming is not required because mobile mutations already use authenticated HTTP routes. SSE keeps the new real-time channel narrow and uses the native client's lifecycle model.

## Verification

The Gateway integration suite verifies that an unauthenticated client is rejected and an authenticated client receives the ready baseline, a durable mux session event, and a host session-status frame through `/v1/events`. Existing integration coverage continues to exercise messages, history, interactions, queues, workspaces, and image content. Mobile and Gateway TypeScript programs compile with strict settings.

## Consequences

Active native views update through a single authenticated event connection instead of several high-frequency polls. Initial reads and recovery remain HTTP-based, so an interrupted stream converges to the desktop state on reconnect. The Gateway event id is intentionally ephemeral; durable continuity remains the responsibility of desktop session `seq` values and history paging. Goal, Plan, Jobs, Subagent, pairing, token rotation, and cross-network transport remain separate later phases.
