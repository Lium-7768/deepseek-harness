# Agent Note: Native desktop and mobile clients over one local DSH runtime

Status: proposed

English | [中文](2026-08-15-native-desktop-mobile-clients.zh.md)

## Problem

The Web GUI is the only product client for a local DSH runtime. It is the authoritative presentation of sessions, messages, tool calls, questions, approvals, workflows, settings, and workspace state, but it does not supply a native desktop lifecycle or a native mobile experience. A direct internet exposure of the Web GUI is inappropriate for a native mobile client: its browser trust fence protects browser callers and is deliberately not an authentication or device-authorization protocol.

The product needs a desktop application that owns the local runtime lifecycle and an iOS/Android application with native screens. Both clients must preserve the Web GUI's product semantics without creating a second Agent runtime, session store, tool executor, or cloud session service.

## Proposal

Add two product clients and one local adapter.

The desktop client is an Electron application. Its main process starts and stops the packaged Node runtime and `dsh web` on loopback, waits for readiness, renders the existing Web GUI in a `BrowserWindow`, owns single-instance and tray behavior, and starts an optional local Mobile Gateway. The Electron renderer receives no arbitrary filesystem, shell, or process IPC capability.

The mobile client is an Expo-managed React Native application. It has native screens for the Web GUI's mobile-suitable product flows: workspace and session browsing, conversation history, prompt submission, running-task state, tool summaries and details, questions, approvals, permitted artifacts, and connection settings. It does not embed the Web GUI or a WebView.

The Mobile Gateway is a local desktop process or contribution that binds only to loopback. It adapts selected existing DSH APIs and events into a small versioned mobile API. A reverse tunnel may forward only this Mobile Gateway hostname; it must not forward the raw Web GUI or general `/api` surface. The Gateway performs one-time desktop-confirmed device pairing, checks a device-bound short-lived credential on every request, records device revocation, and forwards only operations explicitly admitted to the mobile API. It does not execute Agents, retain a cloud copy of session logs, expose model credentials, proxy arbitrary URLs, or grant filesystem access.

The Web GUI remains the product reference. Every Web GUI feature has one documented mobile posture: `adopt`, `adapt for mobile`, `desktop only`, or `deferred`. Each adopted or adapted feature has a Web reference flow, a mobile screen, a Gateway API entry, and an equivalence test scenario. Mobile layout and gestures can differ from desktop; session, tool, approval, error, and permission semantics cannot.

## Mobile API ownership

The Gateway owns versioned mobile request and event envelopes. It maps them to current DSH API methods and event projections rather than exposing DSH RPC method names to the phone. The first version admits session listing and history, session creation, prompt submission, task cancellation, questions, approvals, tool summaries, and permitted artifact metadata. It excludes host path selection/opening, credentials, unrestricted settings mutation, arbitrary tool parameters, raw terminal streams, environment data, and general workspace traversal.

A mobile response or event includes both a mobile `contractVersion` and the DSH version it was adapted from. Gateway contract tests use the same DSH fixtures as the Web client and prove equivalent session, task, question, approval, and tool states for the admitted operations.

## Device access

A desktop user initiates pairing from the desktop application. The phone scans a one-time short-lived pairing code, generates or registers a device identity, and stores its device credential in the mobile operating system's secure storage. The desktop user confirms the pairing before the Gateway permits requests. The desktop application can revoke a device immediately; revoked devices cannot refresh credentials or call the Gateway.

The reverse tunnel is transport only. Browser cookies and embedded service credentials are not mobile API authorization. A credential intended for automated server workloads must not ship inside a mobile application package.

## Feature mapping

| Web feature area | Mobile posture | Initial native treatment |
| --- | --- | --- |
| Workspace picker, sidebar, session tree | adapt for mobile | Workspace picker and session list screens. |
| Session trajectory and composer | adopt | Conversation screen, native composer, send and cancel. |
| Tool rows and details | adapt for mobile | Expandable summary cards and detail screen. |
| Questions, plan review, and risk confirmation | adopt | Native modal or full-screen response flows. |
| Workflow run panel | adapt for mobile | Read-only activity card before command controls. |
| Subagents, skills, attachments, artifacts | adapt for mobile | Incremental native views after core conversation flows. |
| Model and plugin settings | deferred or limited | Read-only connection/model information until a permitted mutation is specified. |
| Directory pickers, opening local paths, credentials | desktop only | Explain that the action requires the desktop application. |

## Consequences

The proposal preserves one DSH runtime and one durable session history while adding two maintained client codebases and a security-sensitive Gateway. Native clients gain first-class desktop and mobile interaction, but the project must maintain Web-to-mobile feature mapping and contract tests whenever the upstream Web product changes.

The desktop application can be delivered incrementally because it renders the existing Web GUI. The mobile application cannot be delivered as a generic HTTP wrapper: device pairing, Gateway authorization, event projection, and the selected API subset are part of the product design and require integration tests.

## Alternatives considered

**PWA or a WebView wrapper.** Rejected because the desired mobile experience is a native application with native navigation and interaction, not a browser page presented through an application icon.

**Expose the existing Web GUI or `/api` through a public tunnel.** Rejected because the existing browser trust check is not a device authentication system and the raw API contains desktop-local capabilities unsuitable for a phone.

**Run a cloud DSH runtime and synchronize sessions.** Rejected because it duplicates the Agent runtime and durable state, broadens the security and operations scope, and is unnecessary while the desktop computer is the execution host.

**Create an unrelated mobile backend.** Rejected because it would duplicate DSH business policy instead of adapting existing runtime behavior.

## Acceptance criteria

- The desktop application starts the local DSH Web GUI only on loopback, renders it in Electron, and stops the owned child process on orderly exit.
- The mobile application does not include a WebView and uses native screens for every admitted operation.
- The Gateway accepts only paired, unrevoked devices and rejects raw DSH routes, host capabilities, credentials, and requests outside the admitted mobile API.
- A phone and the Web GUI observe equivalent session, task, tool, question, and approval state for every admitted mobile operation.
- The feature map records a mobile posture and a verification scenario for every Web feature area considered by the mobile release.
- A reverse tunnel, when configured, reaches only the Gateway's loopback listener and does not expose the DSH Web GUI or general `/api` listener.

## Risks

A Gateway that copies the Web API too broadly can become an unaudited remote-control surface. The API allowlist and device checks must be reviewed as security behavior, not treated as UI convenience.

Upstream changes to the Web GUI or API proxy can alter mobile semantics. The feature map and fixture-based contract tests must identify that drift before a mobile release.

Device pairing, credential rotation, and revocation add state that the existing Web GUI does not own. The first implementation must keep this state local to the desktop application and avoid inventing a cloud account system.

## Desktop lifecycle and device control
The desktop process publishes `starting`, `running`, `stopped`, and `error` runtime states to its restricted preload bridge, renders a retry page after a child failure, and keeps the DSH listener on loopback. Its mobile control window creates one-time credentials, lists paired devices, and revokes them immediately. The durable paired-device file stores only SHA-256 credential hashes with owner-only permissions; it never stores access tokens.
## Related

- [GUI layering and RPC protocol](../../implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)
- [Browser API trust boundary](../../implemented/architecture/2026-07-28-api-browser-trust-boundary.md)
- [Unary API Remote migration](2026-08-10-unary-apiproxy-remote-migration.md)
- [Current Web application entry](../../../../apps/web/src/main.ts)
- [Current API RPC map](../../../../packages/host/apiproxy/src/api/rpc-map.ts)
