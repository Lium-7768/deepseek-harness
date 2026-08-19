# Agent Note: Native mobile session title, workspace tree, and latest-message parity

Status: implemented

English | [中文](2026-08-19-mobile-session-title-workspace-tree-latest-message-parity.zh.md)

## Problem

The native session screen used a static `会话` title although the desktop/Web conversation header showed the selected session's title. The drawer first globally truncated recent sessions before it built workspace sections, so a workspace or one of its members could disappear despite being present in desktop `workspace.list`. Its fallback title was derived from a first user message because the raw desktop `session.list` summary does not carry the final projection title or `sessionListMetadata.blank`; that could duplicate a titled workspace member and display blank provisional members as ordinary rows. The event bridge also sent only the token portion of a device credential to `/v1/events`, while the Gateway requires `deviceId.accessToken`; normal prompt POSTs therefore reached the desktop while SSE failed with 401 and the phone did not receive the Agent execution.

## Decision

The paired native client reads session metadata through one `['session-list', gatewayUrl, deviceId]` React Query cache in the drawer, workspace entry screen, session screen, and rename flows. The session header resolves its title from that cache with the same `新会话` fallback used by drawer rows. The Gateway enriches its narrow session-list projection from `session.history.projections.values`: it uses the desktop `title` projection and only the `sessionListMetadata.blank` visibility metadata needed by the tree. Existing Gateway events invalidate this cache after host session and workspace mutations, so desktop changes remain the only authority.

`mobileAuthorization()` builds the one device-bound bearer value used by all authenticated mobile routes. `MobileApi` and `MobileSyncBridge` both use it, so `/v1/events` receives the same `Bearer deviceId.accessToken` credential as prompt requests. When a prompt succeeds, the session screen immediately marks its events cache as running and invalidates the durable history, incremental event, queue, and job snapshots; SSE remains the low-latency source of new durable and transient state while those authority reads close the submission boundary.

`sessionRows()` consumes the complete unarchived session collection and the desktop-projected `workspaces[].sessionIds` order before rendering. Every desktop workspace section stays visible. It marks every workspace member as accounted before evaluating visual eligibility, hides archived and subagent rows, and shows a blank row only when it is the selected session. Ungrouped sessions therefore appear only when a visible session belongs to no workspace and are ordered by recency. The drawer applies the desktop browser's five-row overflow behavior separately inside each expanded workspace; expanding one group never hides or reassigns sessions in another group.

The session `FlatList` has a session-local latest-message policy. A route change or return to the chat tab requests a non-animated initial end position after history data and list layout arrive. Subsequent content-size changes follow the end only while the reader is still within the latest-message proximity. Scrolling upward clears the pending initial position and prevents live frames from taking over historical reading.

## Verification

The mobile and Gateway strict TypeScript programs pass. Gateway integration coverage verifies authenticated versioned SSE and session-list history projection; focused Vitest coverage verifies the shared device credential, desktop workspace membership order, hidden blank and subagent accounting, per-workspace overflow, title fallback, initial positioning, near-bottom following, and user-away-from-bottom behavior. A paired iPhone 17 Pro simulator received HTTP 200 after the SSE authentication repair and its live session counters moved from 7 rounds / 31 steps to 8 rounds / 46 steps after a native prompt submission, with no further Gateway 401. Android Debug assembly and streamed installation pass, but the Android 16 AVD again entered a System UI ANR before its application UI could be assessed; the Android visual assertion remains a healthy-AVD or physical-device follow-up.

## Alternatives considered

**Keep a global first-five-session preview.** This was rejected because global recency truncation changes the desktop workspace tree: an otherwise visible workspace can become empty or disappear, and expansion has no stable group-local meaning.

**Create a mobile workspace store or extend the Gateway with a second grouping endpoint.** This was rejected because `/v1/sessions/list` already combines the desktop `session.list` and `workspace.list` projection. A second authority would add synchronization behavior without solving the rendering defect.

**Use an inverted list or always force-scroll for real-time messages.** This was rejected because it would change the current native message layout and make deliberate history reading unstable. The chosen `FlatList` policy preserves the existing reading direction while distinguishing initial entry from an intentional upward scroll.

## Consequences

The mobile drawer now has the same workspace membership model and group-local overflow semantics as the desktop/Web browser while retaining native gesture, safe-area, and `FlatList` behavior. Its mobile Gateway projection is intentionally limited to desktop-owned title and blank metadata; it does not introduce a second session store or expose desktop-only controls. The implementation deliberately does not reproduce desktop drag reordering or local persistent sort preferences; those require a separate mobile control surface and are outside the parity defect. iOS completed the title/tree regression and confirmed that authenticated live state updates arrive; Android requires a healthy AVD or physical device because the current Android 16 AVD's System UI process is unstable.
