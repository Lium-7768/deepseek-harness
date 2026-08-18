# Agent Note: Web-authoritative native mobile projection

Status: proposed

English | [中文](2026-08-19-web-authoritative-native-mobile-projection.zh.md)

## Problem

The native mobile client currently exposes only a subset of the Web conversation product while the desktop application already presents the accepted Web experience.

The resulting gaps include session lifecycle actions, workspace actions, image attachments, queue actions, message-level recovery, and complete interaction forms.

Adding unrelated desktop pages to manage mobile product behavior would create a second product surface and would not improve Web-to-mobile feature parity.

## Proposal

The Web client remains the authoritative product specification for visible conversation behavior, state transitions, and user terminology.

The desktop application remains unchanged and continues to host the existing Web experience and local DSH runtime.

The native mobile client renders the same durable session history, projections, tool views, interaction state, and settings values through native components appropriate for iOS and Android.

The mobile gateway exposes only authenticated thin routes over existing DSH session, workspace, interaction, attachment, and settings operations; it does not introduce a second agent loop, session store, or desktop-only product behavior.

## Mapping order

Conversation parity comes first: complete history paging, tool-card views, image attachments, queue actions, cancellation, retry-relevant error state, and interaction responses.

Session and workspace lifecycle comes second: create, rename, fork, archive, restore, membership, and workspace ordering actions already available through the DSH API.

Settings and lower-frequency auxiliary surfaces follow only when their Web behavior is available through an existing DSH operation and can be represented safely on a phone.

## Alternatives considered

**A separate desktop mobile-management application surface** was rejected because desktop already has the accepted Web product and device administration does not close conversation parity gaps.

**A WebView mobile client** was rejected because the product requires native mobile navigation, safe areas, gestures, and platform input behavior while preserving the Web product semantics.

**A separate mobile agent or replicated session store** was rejected because it would divide durable history, tool execution, approvals, and model context between clients.

## Acceptance criteria

The desktop application source and visible Web experience remain unchanged by this work.

Every mobile conversation control maps to an existing DSH operation and observes the same durable session events as Web.

The mobile client supports the Web conversation lifecycle that is safe on a phone, with UI-specific presentation differences limited to native interaction conventions.

Focused gateway, mobile logic, type, and simulator regression checks demonstrate that a message, tool result, approval, and session lifecycle action remain visible and consistent across the desktop Web view and the native client.

## Risks

Some Web capabilities depend on browser-only primitives or desktop-local resources and require a deliberate mobile representation rather than direct visual cloning.

Gateway additions can drift from the DSH API if they duplicate validation or define new state, so each route must delegate to an existing DSH operation and return its durable result.

The mobile client will continue to require a secure initial connection to a running desktop runtime; this work changes the product mapping, not the local security model.
