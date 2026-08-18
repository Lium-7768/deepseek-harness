# Agent Note: Native mobile interaction and sidebar parity

Status: implemented

English | [中文](2026-08-16-native-mobile-sidebar-visual-parity.zh.md)

## Problem

The native client exposed the session browser as a stacked route, which changed the workspace context and prevented the left-side drawer interaction used by the reference UI. The same screens mixed platform glyphs with text glyphs, exposed copy actions as text buttons, and left the connection form attached to the shell edge. Pending interactions, settings, and composer controls also left loading states implicit or suggested mutations that the mobile gateway did not support.

## Decision

The root Expo Router `Drawer` owns the session browser, left-side animation, dismissible backdrop, safe-area window, and drawer lifecycle. `SessionDrawer` is only its content renderer; the legacy `/sessions` address redirects to the workspace instead of mounting a second modal. The content keeps local search, numeric recent ordering, overflow expansion, settings navigation, and a visibly disabled desktop-only workspace-addition entry. Workspace grouping is enabled only when session summaries contain workspace data; manual reordering and session creation are not claimed without a reorder or create operation, so the drawer exposes a disabled explanation and a return-to-workspace entry instead. Session titles use list metadata when available, with a bounded fallback history read only for rows whose title is still a placeholder. The active session is highlighted by its route session id. `NativeIcon` is the single semantic SVG adapter used by the native client components in this flow. Message and code copy controls use only copy/check icons and keep their success state visible briefly without interrupting the transcript. `WorkspaceShell` owns horizontal safe-area insets, while each form or composer uses a keyboard-avoiding container and translated validation or action text.

`WorkspaceShell` reads `useSafeAreaInsets()` and applies the top inset to the custom header separately from its content; header and metadata rows use shared minimum heights and grow with text. Workspace, session, interaction, and connection content derives iOS keyboard offsets from the top inset and shell header tokens, and scrollable content dismisses the keyboard on drag. The root drawer passes its official content props to `DrawerContentScrollView`, which supplies drawer safe-area padding and scrolling.

The interaction screen uses a scrollable native list with explicit loading, error, disconnected, empty, pull-to-refresh, and return-to-session states. Approval and question responses continue to use the versioned Mobile Gateway response operation. The Gateway exposes redacted settings reads and safe default updates, provider/model catalogs, session model selection, and Agent preset reads and selection; the native settings and composer screens use those operations instead of inventing local mutations. Permission choices come from the host projection and submit through the existing `/permission` session command. Attachments, provider credentials, plugin editing, and custom preset authoring remain visibly disabled or read-only because the mobile contract does not admit those operations. Mode and model selections are durable desktop decisions, not local presentation state.

The root drawer navigation closes before opening a session, workspace, or settings route; selecting settings while already on settings only closes the drawer. Screens that do not need session navigation, such as connection and pending interactions, suppress the menu and use an explicit back action where appropriate. Brand surfaces use the existing whale mark, and `NativeIcon` draws the shared 24px outline vocabulary with `react-native-svg` so controls do not depend on platform font glyph metrics. Compact icon actions keep at least a 36px hit target. Connection failures stay in a translated inline error surface rather than exposing raw request text.

Native screens use the Web conversation geometry at the 390px reference width: settings keeps one 16/24 heading with 24px content insets, the drawer keeps a 60px brand row and 38px new-session row, tabs use intrinsic widths with a 36px gap, message bubbles use the Web 22px radius and 16/24 text metrics, and the composer uses a 34px circular send control with borderless 28px toolbar controls. The stats line is transparent 12/20 text. Expo development-menu overlays are excluded from product layout verification.

## Alternatives considered

**Keep the sessions screen as a pushed route.** Rejected because a route replaces the workspace context and creates a second navigation owner instead of using the root drawer's backdrop and left-side dismissal gesture.

**Keep character glyphs beside the existing icon components.** Rejected because glyph metrics and meaning vary across fonts and platforms, so tool rows did not match the rest of the native client.

**Show a success alert after every copy.** Rejected because alerts interrupt reading and duplicate the visual confirmation already provided by the check icon.

**Keep the static interaction column and alerts.** Rejected because long interaction lists could not be read reliably and alerts implied unsupported attachment, permission, or model mutations.

**Add a separate UI-only attachment or settings API.** Rejected because supported settings use the existing host settings seam, while attachments still have no admitted mobile operation or durable semantics; inventing either behavior in the UI would diverge from the desktop runtime.

**Label a route back to the workspace as “new session.”** Rejected because the Mobile Gateway exposes no session-create operation; the control would imply a new durable session while sending the next prompt to an existing session.

## Consequences

The workspace remains visible behind the root left drawer, and selecting a session or settings entry closes it before navigation. Search and recent ordering are local to the drawer, while list loading is one request per refresh; history is read only for rows whose list metadata still has a fallback title. The first Mobile Gateway API exposes one numerically timestamped session list without workspace grouping, reorder, create, mutation, or directory-picker operations; it also exposes redacted settings and model/preset operations for supported defaults and session selections. The drawer disables unsupported grouping/reordering choices, returns to the workspace instead of claiming to create a session, and reports that adding a workspace requires the desktop application. The native shell keeps a whale brand anchor with 48px and 35px minimum rows for session/workspace context; text scaling can grow those rows instead of being clipped. It uses 35px tabs with a 2px active indicator and gives the composer a 22px radius with disabled secondary controls for desktop-only capabilities.

`app.json` keeps `orientation: "portrait"` alongside `ios.supportsTablet: true`. Expo documents portrait orientation as an explicit lock, but no product requirement authorizes changing it in this change; landscape iPad and split-view policy remain deferred rather than being inferred from the tablet flag.

Pending interactions remain usable on small screens and failures have a visible recovery path. Users can distinguish phone-supported actions from desktop-only state. Attachments, provider credentials, plugin editing, and custom preset authoring remain unavailable; the UI makes those limits explicit rather than silently dropping a tap. Supported settings defaults and session model or Agent preset selections use Gateway operations with desktop validation and durable semantics.

## Verification

The implementation follows the official [Expo Router drawer guidance](https://docs.expo.dev/router/advanced/drawer/), [React Navigation safe-area guidance](https://reactnavigation.org/docs/handling-safe-area/), [React Native KeyboardAvoidingView guidance](https://reactnative.dev/docs/keyboardavoidingview), and [Expo screen-orientation reference](https://docs.expo.dev/versions/latest/sdk/screen-orientation/). The mobile TypeScript program and focused Vitest files pin the shared shell geometry and drawer behavior; their exact results are reported with the implementation. `git diff --check` is also required. Native iOS screenshots from the earlier audit cover the connection form, workspace overlay, and session drawer, but the final Metro run was blocked by a stale generated desktop `index.mjs` bundle importing `node:crypto`, so those screenshots do not prove the final drawer source.
