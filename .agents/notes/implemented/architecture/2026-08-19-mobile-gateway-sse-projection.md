# Agent Note: Mobile Gateway SSE projection

Status: implemented

English | [中文](2026-08-19-mobile-gateway-sse-projection.zh.md)

## Problem

The native mobile client needs to reflect active desktop and Web conversations without changing the DSH runtime. Independent refresh cycles delayed visible work, while refetching durable history concurrently with a newly opened event stream could leave a client without a defined handoff point between the HTTP read and real-time events.

## Decision

`@deepseek-ai/dsh-mobile-gateway` remains an external loopback projection over the DSH Remote wire protocol. It does not change the DSH Agent Loop, session persistence, Web UI, plugins, or wire protocol. `GET /v1/events` is the only long-lived mobile transport and continues to publish versioned host frames globally. Session events are delivered only through an explicit paired-device subscription.

A client establishes a session subscription with `POST /v1/sessions/:sessionId/subscriptions` and its last durable `seq`. The Gateway creates an immediate, connection-owned lease containing the requested watermark, a cutover event id, an activation token, and a bounded event buffer. It does not read DSH history while creating the lease, so a running turn cannot delay activation. The response carries only Gateway-owned queue, job, and pending-interaction snapshots; durable history is a `session/follow` snapshot read.

The client writes the Gateway snapshots into existing TanStack Query caches, activates the lease with `POST /v1/subscriptions/:subscriptionId/activate`, then invalidates durable history and session events. During the handoff the Gateway buffers session follow frames emitted after the cutover id. Activation verifies the token and watermark, replays only durable events whose `seq` is greater than the applied watermark, and changes the lease to live delivery. A full buffer marks the lease for resynchronization instead of silently dropping events.

`MobileSyncBridge` keeps the existing single authenticated SSE connection and no visual component changes. On `gateway/ready` it reads `POST /v1/sessions/running`, which returns only running session ids and avoids the complete workspace/history projection. It establishes leases for those ids and for later running `host/session-status` frames. Reconnect clears local lease bookkeeping and repeats this recovery path.

## Recovery semantics

The durable source remains DSH session history and its `seq` cursor. A mobile client reads history after activating a lease, then receives only newer durable events. Queue, jobs, and pending interactions are Gateway-owned snapshots and are replaced rather than reconstructed. If lease activation reports an expired buffer or fails, the bridge invalidates the same session query families so the existing HTTP readers converge to desktop authority.

The Gateway reconnects its upstream streams after connection closure; the forwarded event, session control, and workspace follow streams run for the gateway lifetime, and per-session follow streams only while a subscription needs them. Gateway shutdown aborts upstream streams, clears lease and retry state, and closes downstream clients.

## Alternatives considered

**Continue independent polling.** Polling retained visible delay and could combine related desktop state from different moments. It did not define a history-to-event handoff for an active turn.

**Read full history before opening a subscription.** A history read during an active turn delayed lease activation in the native client. The immediate lease plus post-activation history read keeps durable authority in DSH without blocking real-time delivery.

**Create a persisted mobile Session Store.** A separate mobile database would duplicate desktop session ownership and introduce conflict resolution outside DSH. The client keeps TanStack Query caches only.

**Replace DSH with Codex App Server.** Codex App Server owns Codex threads, turns, tools, and persistence; it cannot project DSH sessions without replacing the current runtime. Its subscription and recovery semantics informed this external adapter, not a runtime dependency.

**Expose the desktop mux protocol directly to native clients.** That would couple mobile to a desktop-internal wire format and expose fields outside the paired-device API. The Gateway keeps a constrained versioned envelope.

## Verification

Gateway integration coverage verifies subscription watermark filtering, cutover buffering, activation replay, session filtering, authenticated host discovery, history, interactions, queues, workspaces, messages, and images. Mobile API coverage verifies authenticated running-session discovery, subscription creation, and activation. Mobile TypeScript compilation passes.

A packaged desktop shell and paired iOS simulator run a real DSH task that streams 150 numbered Chinese lines. The native conversation displays partial output and `Deep diving...` while the desktop task is still processing, then displays all 150 lines after completion. No mobile page component is changed by this decision.

## Consequences

Desktop and Web remain the DSH authority, while mobile receives a reliable external mapping without an additional Agent Loop or DSH source fork. Lease buffers are deliberately finite and require HTTP resynchronization after overflow. The local loopback Gateway does not provide cross-network relay, TLS termination, push notifications, or multi-host coordination; those require a separately authenticated relay deployment.
