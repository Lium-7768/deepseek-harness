# Agent Note: Native mobile session title, workspace tree, and latest-message parity

Status: implemented

English | [中文](2026-08-19-mobile-session-title-workspace-tree-latest-message-parity.zh.md)

## Problem

The native session screen used a static `会话` title although the desktop/Web conversation header showed the selected session's title. The drawer first globally truncated recent sessions before it built workspace sections, so a workspace or one of its members could disappear despite being present in desktop `workspace.list`. The message list attempted `scrollToEnd` only once for a content-size change, which could leave a newly opened long session between historical messages after delayed Markdown, tool, or attachment layout.

## Decision

The paired native client reads session metadata through one `['session-list', gatewayUrl, deviceId]` React Query cache in the drawer, workspace entry screen, session screen, and rename flows. The session header resolves its title from that cache with the same `新会话` fallback used by drawer rows. Existing Gateway events invalidate this cache after host session and workspace mutations, so desktop changes remain the only authority.

`sessionRows()` consumes the complete unarchived session collection and the desktop-projected `workspaces[].sessionIds` order before rendering. Every desktop workspace section stays visible. Ungrouped sessions appear only when a session belongs to no workspace and are ordered by recency. The drawer applies the desktop browser's five-row overflow behavior separately inside each expanded workspace; expanding one group never hides or reassigns sessions in another group.

The session `FlatList` has a session-local latest-message policy. A route change or return to the chat tab requests a non-animated initial end position after history data and list layout arrive. Subsequent content-size changes follow the end only while the reader is still within the latest-message proximity. Scrolling upward clears the pending initial position and prevents live frames from taking over historical reading.

## Verification

The mobile strict TypeScript program passes. Focused Vitest coverage exercises desktop workspace membership order, empty and ungrouped sections, per-workspace overflow, title fallback, initial positioning, near-bottom following, and user-away-from-bottom behavior. iOS Debug builds and a paired iPhone 17 Pro simulator confirm the desktop-visible title in the native header plus the latest-message position for ordinary and tool-card conversations. Android Debug assembly and streamed installation pass, but the Android 16 AVD again entered a System UI ANR before its application UI could be assessed; the Android visual assertion remains a healthy-AVD or physical-device follow-up.

## Alternatives considered

**Keep a global first-five-session preview.** This was rejected because global recency truncation changes the desktop workspace tree: an otherwise visible workspace can become empty or disappear, and expansion has no stable group-local meaning.

**Create a mobile workspace store or extend the Gateway with a second grouping endpoint.** This was rejected because `/v1/sessions/list` already combines the desktop `session.list` and `workspace.list` projection. A second authority would add synchronization behavior without solving the rendering defect.

**Use an inverted list or always force-scroll for real-time messages.** This was rejected because it would change the current native message layout and make deliberate history reading unstable. The chosen `FlatList` policy preserves the existing reading direction while distinguishing initial entry from an intentional upward scroll.

## Consequences

The mobile drawer now has the same workspace membership model and group-local overflow semantics as the desktop/Web browser while retaining native gesture, safe-area, and `FlatList` behavior. The implementation deliberately does not reproduce desktop drag reordering or local persistent sort preferences; those require a separate mobile control surface and are outside the parity defect. iOS completed the final visual confirmation for delayed tool-card positioning; Android requires a healthy AVD or physical device because the current Android 16 AVD's System UI process is unstable. No desktop source or mobile Gateway permission surface changes are required.
