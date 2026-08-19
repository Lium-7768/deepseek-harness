# Agent Note: Mobile Agent observation and constrained control

Status: implemented

English | [中文](2026-08-19-mobile-agent-observation-control.zh.md)

## Problem

The native client could render a durable conversation and respond to generic approvals, but it did not surface the desktop Web application's current Goal, plan-review presentation, background jobs, or direct subagent catalog. A phone user could therefore lose the execution context that the desktop presents above and beside a conversation, even though the desktop runtime remained the sole owner of all Agent state.

## Decision

The Mobile Gateway remains a narrow loopback adapter over the existing DSH API. Goal state is not fetched through a new API or stored in a mobile state store: the native session page reads the `goal` value from the existing session-history projection. It renders only active, paused, and blocked goals, matching the desktop GoalBar's visibility rule, and forwards only the desktop's existing `goal.edit`, `goal.pause`, `goal.resume`, and `goal.clear` mutations with the projected `{ id, revision }` compare-and-swap reference.

The Gateway retains authoritative transient `session/jobs` mux snapshots in memory and exposes them read-only through the authenticated `POST /v1/sessions/:sessionId/jobs` route. The native client presents the Web-equivalent job metadata—kind, label, detail or status, and live state—without inventing a job stop operation that the Web job list does not expose.

Direct children are listed through existing `subagent.list` RPC, read through `subagent.history`, and opened on a native child-session route. A continuable child may receive mobile content only through `subagent.prompt` using its parent-session authority, and it may receive `subagent.interrupt`; one-shot children remain read-only. The interrupt acknowledgement retains the desktop API meaning: it confirms admitted cancellation, not immediate child quiescence.

The native interaction screen recognizes a plan review only when the pending batch is one single-select question with `intent.kind` equal to `plan-review`, markdown `detail`, the declared approval label, and no more than one alternative option. It renders desktop-equivalent approve, decline, and discuss actions. Discuss forwards the existing cancelled interaction response only for this narrowed form; generic questions retain the complete form renderer and require structured answers.

## Synchronization and authorization

All new routes require the existing paired-device credential. They call the desktop DSH API only through the Gateway's validated loopback client; the Gateway does not expose an arbitrary RPC selector, desktop Web routes, files, credentials, shell access, or a mobile Agent Loop.

The existing authenticated SSE stream writes `session/jobs` snapshots directly into React Query and invalidates history after durable `goal/*` events so the projection is reloaded from the desktop authority. Gateway readiness invalidates job and subagent queries together with existing session caches. No high-frequency polling or durable mobile copy of execution state is introduced.

## Alternatives considered

**Build a mobile-specific Agent state store.** A second store would have to resolve ordering, recovery, and ownership conflicts with the desktop runtime. History projections, mux snapshots, existing DSH RPC methods, and the established SSE bridge already provide the required desktop-authoritative data paths.

**Expose a generic DSH RPC forwarding endpoint.** This would let a paired phone reach desktop-only capabilities such as filesystem, credential, plugin, or host operations. Explicit Gateway paths restrict the mobile surface to the same Goal, plan-review, job, and subagent capabilities selected for this phase.

**Treat every pending question as a plan review.** A compact approve/decline card cannot represent multi-question, multiselect, or more-than-binary requests. Structural narrowing preserves every answer available to generic questions and restricts cancellation semantics to the desktop-defined plan-review intent.

**Make one-shot subagents writable.** One-shot children do not have the direct-parent continuation contract that validates human prompt delivery. Leaving them read-only preserves desktop execution ownership and avoids pretending a historical child session can resume.

## Verification

The Mobile Gateway integration suite covers authenticated job projection, Goal CAS pause validation and forwarding, subagent list/history/prompt/interrupt forwarding, one-shot interrupt rejection, and plan-review discussion cancellation only after structural validation. Mobile API tests cover all versioned Goal, job, and subagent paths and request bodies. Strict TypeScript checks pass for the Gateway and native app, and the Gateway package builds successfully.

The iPhone 17 Pro iOS 26.0 simulator Debug build starts through the configured 8090 Metro endpoint after reinstalling the current app bundle. The simulator's connected workspace view loads without a JavaScript or native startup exception. The available desktop session did not contain an active Goal, jobs, or child agents during this smoke run, so data-populated visual confirmation remains tied to a future live Agent execution.

## Consequences

A paired phone now observes the execution context the desktop uses for Goal, jobs, plan review, and direct children, and can perform the same scoped Goal and continuable-child actions through the desktop authority. This expands the Mobile Gateway allowlist and native routes, but it deliberately does not add mobile workflow authoring, arbitrary job cancellation, child creation, desktop host controls, standalone agent execution, or a replacement for the desktop durable session model.
