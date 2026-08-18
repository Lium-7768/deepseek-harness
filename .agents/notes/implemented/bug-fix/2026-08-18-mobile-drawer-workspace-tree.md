# Agent Note: Mobile drawer workspace tree

Status: implemented

## Problem

The native drawer received only `session.list`, so it could not reproduce the desktop workspace membership and its explicit Ungrouped bucket. It also placed its brand and controls directly in the drawer scroll view, which did not reserve the iPhone top safe area.

## Decision

`MobileGateway` obtains `workspace.list` with `session.list` and returns the desktop-owned workspace id, title, path, session order, and archived-session ids in the existing mobile session-list response. The React Native drawer filters archived sessions, renders each workspace in desktop order, and always renders `未分组` for sessions outside every workspace. Workspace nodes remain visible and toggle only their child session rows; each node exposes its expanded state to native accessibility. The drawer is enclosed in a `SafeAreaView` on the top, left, and bottom edges; the footer occupies the bottom safe content area rather than adding its own inset. Locked agent-mode rows remain disabled but retain readable text and selection contrast.

## Alternatives considered

**Inferring projects from session titles or file paths** was rejected because neither value is a desktop workspace membership record and it would create a divergent client-side grouping rule.

**Keeping a flat mobile list when no workspace fields accompany a session** was rejected because the desktop workspace API already owns both membership and the explicit Ungrouped bucket.

**Padding only the brand row** was rejected because search, view controls, and any future header content would remain able to enter the Dynamic Island region.

## Consequences

The paired desktop runtime must provide `workspace.list` for a mobile session-list request. Mobile users see the same project membership order as the desktop sidebar, with an explicit empty or populated `未分组` row, and can collapse each folder without removing it from the tree. The gateway integration fixture and drawer logic tests cover the projected workspace membership, ungrouped fallback, and collapsed-child behavior.
