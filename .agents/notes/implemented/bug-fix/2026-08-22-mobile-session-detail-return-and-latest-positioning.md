# Agent Note: Keep mobile session detail actions in the active conversation

Status: implemented

English | [中文](2026-08-22-mobile-session-detail-return-and-latest-positioning.zh.md)

## Problem

The mobile model selector is a sibling Drawer route rather than a nested child of the conversation route. A successful model write followed by `router.back()` therefore depends on incidental navigation history and can return to the workspace composer instead of the current conversation.

`FlatList` can emit an initial scroll measurement before its asynchronous history content has completed layout. Treating that measurement as intentional history reading cancels the pending initial scroll and leaves a newly opened conversation away from its latest visible message.

## Decision

The model selector returns with `router.replace(sessionDetailReturnTarget(sessionId))` after both its explicit back action and a successful `session.selectModel` request. `sessionDetailReturnTarget()` resolves a present session identifier to `/session/[sessionId]` and uses `/workspace` only when no session identifier exists.

The conversation list ignores `onScroll` proximity measurements while `initialLatestPositionPending` is true. `onContentSizeChange` remains the owner of the initial `scrollToEnd({ animated: false })` call and marks initial positioning complete only after requesting that scroll. Later measurements resume the existing near-latest policy, so deliberate history reading still exposes the return-to-latest control and does not get overridden by streaming updates.

## Alternatives considered

**Keep `router.back()`.** The root Drawer registers the conversation and model routes as siblings, so a back action has no invariant that identifies the active conversation. Preserving this dependence would retain the reported workspace/new-conversation fallback.

**Restructure every session detail route into a nested Stack.** A dedicated stack would also make back navigation deterministic, but it requires a route-file migration affecting mode, permissions, interactions, rename, subagents, and the Drawer registration. The model action requires a narrow correction now; the helper keeps a future stack migration compatible.

**Always scroll on every content update.** This would make new conversations look current but would repeatedly pull a reader away from deliberately opened history. The initial-position guard fixes the race while preserving the existing follow-only-when-near-latest behavior.

## Testing

`apps/mobile/tests/session-route-logic.spec.ts` verifies that a settled session detail action resolves to the current session path and only falls back to the workspace without a session identifier.

`apps/mobile/tests/session-scroll-logic.spec.ts` verifies that initial measurement events are ignored until positioning completes, while existing newest-message, deliberate-history, and empty-conversation cases remain covered.

## Consequences

Selecting a model no longer depends on the Drawer navigation history, and entering or returning to a conversation requests the newest visible message position before ordinary scroll tracking begins.

The model route intentionally uses replacement rather than preserving a history entry. Users return to the conversation they configured; the back gesture cannot reopen a completed selector. The other detail routes retain their existing navigation behavior and may be migrated to a nested Stack in a separate, broader navigation change.
