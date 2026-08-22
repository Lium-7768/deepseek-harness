# Agent Note: Direct Remote dispatch remains explicit in agent scopes

Status: implemented

English | [中文](2026-08-23-remote-direct-scope-dispatch.zh.md)

## Problem

A generated Remote method can expose both a direct form, whose caller supplies an agent lookup identity, and a scoped alias, which derives that identity from the caller Context. `ClientRemote` previously preferred the scoped alias whenever the caller had an identity. Browser command UI intentionally submits commands from a session scope while still supplying `(agentId, line, images)`. The scoped alias removed `agentId`, treated `images` as its optional cancellation argument, and passed the image array to `AbortSignal.any`. Chromium rejected that value before the request reached the Host, so `/goal` and permission commands failed in both Web and Electron.

## Decision

`packages/api/gateway/src/client/index.ts` selects a direct method first only when all of its strict business codecs accept the supplied positional values. A scoped alias is selected only when its caller Context resolves an identity and its own strict positional form accepts those values. A trailing optional cancellation value counts only when it is a browser-native `AbortSignal`; any other value remains a business-input validation failure and is never supplied to `AbortSignal.any`.

The API Gateway client test covers an explicit direct call from an agent-scoped context. The API Remote matrix mounts the selected production contributions and proves that commands, Goals, file references, and session references preserve their explicit direct wire fields. The file and session reference rows also retain a real cancellation signal. The package README records the direct/scoped selection and cancellation rule.

## Alternatives considered

**Always prefer the scoped alias when an identity exists.** This was rejected because a caller Context does not erase an explicitly supplied lookup identity. Commands require the direct form to preserve their image business argument.

**Treat every extra trailing value as cancellation.** This was rejected because it converts malformed business input into a browser-native conversion exception and hides the original invocation error.

**Make direct methods unavailable from scoped contexts.** This was rejected because session-scoped UI can legitimately invoke a direct API with an explicit target identity; restricting that call would add an artificial ownership boundary.

## Consequences

Generated Remote overloads sharing one JavaScript method name now select variants from strict positional input shape instead of Context identity alone. Browser callers receive normal descriptor validation for invalid trailing values, while valid cancellation continues to combine with the contribution lifetime. Future direct/scoped pairs need a regression case when their business arity or codecs could overlap.
