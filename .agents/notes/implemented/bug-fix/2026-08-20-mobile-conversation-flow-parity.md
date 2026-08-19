# Agent Note: Native mobile conversation-flow parity

Status: implemented

English | [中文](2026-08-20-mobile-conversation-flow-parity.zh.md)

## Problem

The native session page reduced the desktop conversation timeline to user bubbles, assistant Markdown, and a generic tool card. It discarded assistant reasoning blocks, model retry disclosures, turn errors, actual tool names, correlated tool results, and the turn-level running footer. A phone could therefore show repeated “工具 / 暂无输出摘要” cards while the desktop displayed `Think`, `Tool call · bash`, retry failure details, and `Deep diving...` as distinct rows.

## Decision

`projectNativeConversationRows()` derives ordered native display rows directly from the desktop durable session events already returned by the Mobile Gateway. It retains `user/message`, in-progress `assistant/chunk` reasoning and text deltas, settled assistant `reasoning` and `text` blocks, correlated `tool/call` and `tool/result` lifecycle records, `llm/retry`, and `turn/error`. Streaming deltas merge by desktop turn, step, block index, and kind; the settled assistant message replaces same-step transient rows. The projection updates a tool-call row from its correlated result, preserves the source sequence for attachments, and assigns each live block a `stream:<turn>:<step>:<kind>:<index>` key so React Native does not remount it while text grows.

The primary native session renders these row categories with separate React Native components. Assistant prose remains `NativeMarkdown` at the compact shared mobile body density; reasoning uses an expandable `Think` disclosure; tool calls are compact `Tool call · <name>` rows with a state dot and expandable IN/OUT details; model retries expose the desktop-equivalent delay and failure disclosure; turn errors remain alerts; and an open durable turn renders `Deep diving...` in a dedicated native run-status slot below the transcript so it remains visible outside the `FlatList` viewport. The visible Think, active Goal, and generic tool rows use the desktop `ic_ds_think_outline_14`, `ic_ds_goal_outline_16`, and `sparkle_16` SVG paths. Tool input and output use bounded nested readers, and long fenced code or JSON blocks start limited to 16 lines with an explicit expand control. When a reader leaves the latest message, the list stops following streamed content and exposes an icon-only return-to-latest control.

The native renderer does not reproduce desktop DOM, CSS, drag behavior, or inspection panels. It maps desktop durable information and hierarchy to touch-sized native controls, preserving system text selection, accessibility roles, safe-area composition, and the existing native composer.

The workspace stores only a device-bound `{ gatewayUrl, deviceId, sessionId }` selection in SecureStore. After a native reload, it restores that identifier only after the current paired desktop session list confirms both the paired device and the session still exist; a changed desktop connection, forgotten device, archived session, or deleted session clears the local record. The record never includes an access token or copied session content. The workspace replaces its large marketing hero with a compact current-session picker and desktop update label. Settings use touch-safe separated rows instead of stacked cards, while the visible model, plugin, preset, folder, and project-add icons use the exact desktop shared SVG paths.

## Verification

The mobile strict TypeScript program passes. The native conversation projection test covers ordered user prose, Think, assistant text, correlated failed tool output, retry metadata, turn error, active-turn timing, in-progress reasoning/text deltas, settled-message replacement, and stable stream row keys. The scroll policy test covers follow ownership and return-to-latest visibility. The selection recovery test covers same-device restoration, cross-device rejection, and invalid desktop-session rejection. A paired iPhone 17 Pro simulator renders a running desktop session with actual compact tool names, separate Think rows, assistant Markdown, tool state dots, current desktop step advancement, compact workspace selection controls, and separated settings rows without a duplicate FlatList key warning.

## Alternatives considered

**Continue using `projectVisibleMessages()`.** This was rejected because its compact cross-client presentation intentionally joins settled assistant chunks and exposes only user, assistant, and tool records. It is suitable for simple transcript views but cannot represent the desktop conversation row distinctions or in-progress stream deltas required by the primary mobile session.

**Render every raw event as JSON or an undifferentiated generic card.** This was rejected because event completeness alone does not preserve the desktop reading hierarchy. Durable events need a small mobile-specific projection that recognizes correlated tools, reasoning, retries, and turn errors.

**Embed the desktop/Web conversation in a WebView.** This was rejected because the mobile client remains native by product decision; native disclosure, scrolling, accessibility, attachment sharing, and safe-area behavior must remain owned by React Native.

## Consequences

The phone conversation now reflects the same durable information categories, streaming progression, and reader-ownership behavior as the desktop/Web conversation while using native components. The additional projection is confined to the primary mobile session and derives solely from the desktop event log; it does not create a mobile agent loop, alter desktop event schemas, or expose desktop-only tool inspection and filesystem controls. A future desktop event category needs an explicit native row decision rather than silently falling into assistant Markdown or a generic tool card.
