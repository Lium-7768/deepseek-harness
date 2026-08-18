# Agent Note: Native mobile interaction feedback and mutation guards

Status: implemented

English | [中文](2026-08-17-native-mobile-interaction-feedback.zh.md)

## Problem

The native mobile client had actions whose state was implicit: multiline Return could be mistaken for send, send and stop could lose busy feedback, permission state could be stale, and selection or interaction controls could accept changes while a write was settling. Query failures and clipboard failures also lacked local recovery or accessible feedback.

## Decision

The composer keeps Return for newlines through `submitBehavior="newline"` and `returnKeyType="default"`; sending is an explicit button action. Send and stop use a 44px hit area, expose busy accessibility state, and render an ActivityIndicator while pending. Stop remains the primary action while a session is running unless cancellation itself is pending.

Permission options remain locked while the status query is pending, stale, errored, busy, or submitting. The status query refreshes periodically and on window focus. Selecting full access in Settings requires destructive confirmation. Mode and model writes use one mutation lock per screen and restore the previous model selection on failure.

Question options use radio or checkbox semantics with selected and disabled state. Answer inputs are locked while a response is submitted. Settings, session, mode, model, and permission query errors expose in-place retry. Forgetting a connection catches secure-store failures. Copy remains icon-only; clipboard failures update the accessible label and announce a short retry message without opening an Alert.

## Alternatives considered

**Use Return as the primary send gesture for multiline input.** Rejected because React Native does not guarantee `onSubmitEditing` for multiline TextInput on iOS, and Return must remain available for newlines.

**Hide stop while another request is pending.** Rejected because a running session must retain a visible cancellation affordance; only cancellation itself disables it.

**Allow selection writes to race.** Rejected because duplicate taps can issue competing session selections and repeated back navigation.

**Use an Alert for clipboard failure.** Rejected because copy is a frequent reading action and a modal is disproportionate to a recoverable error.

## Consequences

The mobile client has explicit request feedback and retry paths without changing the root drawer, navigation hierarchy, header, or visual token definitions. The gateway remains authoritative for final permission and selection validation.

## Verification

Focused mobile Vitest covers composer action policy, permission freshness locks, selection mutation locks, and question option semantics. Mobile TypeScript, focused Vitest, Expo JavaScript export, and `git diff --check` are the verification surface; native iOS build is outside scope.
