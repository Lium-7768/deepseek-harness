# Agent Note: Native mobile conversation-flow parity

Status: implemented

English | [中文](2026-08-20-mobile-conversation-flow-parity.zh.md)

## Problem

The native session page reduced the desktop conversation timeline to user bubbles, assistant Markdown, and a generic tool card. It discarded assistant reasoning blocks, model retry disclosures, turn errors, actual tool names, correlated tool results, and the turn-level running footer. A phone could therefore show repeated “工具 / 暂无输出摘要” cards while the desktop displayed `Think`, `Tool call · bash`, retry failure details, and `Deep diving...` as distinct rows.

## Decision

`projectNativeConversationRows()` derives ordered native display rows directly from the desktop durable session events already returned by the Mobile Gateway. It retains `user/message`, assistant `reasoning` and `text` blocks, correlated `tool/call` and `tool/result` lifecycle records, `llm/retry`, and `turn/error`. The projection updates a tool-call row from its correlated result and preserves the source sequence for attachments and deterministic list identity.

The primary native session renders these row categories with separate React Native components. Assistant prose remains `NativeMarkdown`; reasoning uses an expandable `Think` disclosure; tool calls are compact `Tool call · <name>` rows with a state dot and expandable input/output; model retries expose the desktop-equivalent delay and failure disclosure; turn errors remain alerts; and an open durable turn renders `Deep diving...` independently at the list tail. List keys include row kind and source position because one desktop assistant event can emit both a reasoning row and a prose row.

The native renderer does not reproduce desktop DOM, CSS, drag behavior, or inspection panels. It maps desktop durable information and hierarchy to touch-sized native controls, preserving system text selection, accessibility roles, safe-area composition, and the existing native composer.

## Verification

The mobile strict TypeScript program passes. The native conversation projection test covers ordered user prose, Think, assistant text, correlated failed tool output, retry metadata, turn error, and active-turn timing. A paired iPhone 17 Pro simulator renders a running desktop session with actual compact tool names, separate Think rows, assistant Markdown, tool state dots, and no duplicate FlatList key warning after the key fix.

## Alternatives considered

**Continue using `projectVisibleMessages()`.** This was rejected because its compact cross-client presentation intentionally joins assistant chunks and exposes only user, assistant, and tool records. It is suitable for simple transcript views but cannot represent the desktop conversation row distinctions required by the primary mobile session.

**Render every raw event as JSON or an undifferentiated generic card.** This was rejected because event completeness alone does not preserve the desktop reading hierarchy. Durable events need a small mobile-specific projection that recognizes correlated tools, reasoning, retries, and turn errors.

**Embed the desktop/Web conversation in a WebView.** This was rejected because the mobile client remains native by product decision; native disclosure, scrolling, accessibility, attachment sharing, and safe-area behavior must remain owned by React Native.

## Consequences

The phone conversation now reflects the same durable information categories and order as the desktop/Web conversation while using native components. The additional projection is confined to the primary mobile session and derives solely from the desktop event log; it does not create a mobile agent loop, alter desktop event schemas, or expose desktop-only tool inspection and filesystem controls. A future desktop event category needs an explicit native row decision rather than silently falling into assistant Markdown or a generic tool card.
