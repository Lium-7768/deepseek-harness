# Agent Note: Mobile-safe attachments and content search

Status: implemented

English | [中文](2026-08-19-mobile-safe-attachments-and-search.zh.md)

## Problem

The native client could upload compressed library images with a prompt, but it did not render durable images already present in a desktop-owned conversation, offer a system share/save path for those permitted images, provide a camera capture entry, or search message content across sessions. The existing drawer only matched session title and identifier locally, which did not match the desktop Web browser's content-search behavior.

## Decision

The Mobile Gateway exposes the existing `session.search` API as authenticated `POST /v1/sessions/search`. It validates a nonempty search string, rejects NUL characters and values longer than 500 characters before contacting DSH, and returns the desktop result set unchanged: at most the desktop-selected content matches, each with an opaque session id, a visible-message excerpt, and `hasMore`. The native drawer waits 250 ms after an edit, replaces its grouped tree with flat content hits while a query is active, displays the desktop excerpt below the existing session title, and asks the user to refine a query when `hasMore` is true. Clearing the query restores the existing workspace tree without creating a separate mobile index or search database.

The native message renderer reads image blocks only from an ordinary history event's `data.message.content` array. For each typed durable image reference it calls the existing session-scoped attachment route. That route already delegates to `session.attachment`, whose desktop implementation proves the current session log references the opaque attachment id before returning bytes and image metadata. The native client accepts only the declared raster media types and positive image metadata, uses an in-memory React Query result for the current app session, and never receives desktop paths, artifact directories, or arbitrary URLs.

An image thumbnail has loading, retry, and full-screen preview states. In the preview, Expo FileSystem writes the already authorized base64 image to the mobile cache directory and Expo Sharing opens the operating system's share sheet with the verified MIME type. The share sheet provides platform-owned sending and saving actions; the application does not implement a desktop filesystem download route or persist a mobile copy outside the system-selected destination.

The composer keeps its existing four-image maximum, JPEG quality compression, and failed-send draft retention. Its attachment action now presents camera capture or photo-library selection. Both sources request base64 data at the same quality setting and flow through the same bounded prompt-image payload, so a failed desktop upload leaves the selected draft visible for retry.

## Alternatives considered

**Proxy arbitrary desktop files and artifacts.** A generic path or artifact read would weaken the Mobile Gateway's purpose-built session boundary and expose desktop filesystem names, locations, and unreviewed content types. This change proxies only durable image ids that the desktop has authorized for the current session.

**Build a mobile search index.** Indexing all histories on the phone would duplicate desktop content, consume storage, and make desktop deletes and retention rules harder to honor. The desktop `session.search` API already selects visible user, assistant, and steering content and bounds the result set.

**Return direct desktop image URLs.** URLs would reveal host topology and make cache and credential handling a client concern. The existing authenticated Gateway post route preserves the paired-device credential boundary and transports only the current image bytes.

**Save images directly to a shared photo library.** Direct saving requires platform-specific permission policy and creates another durable copy without a user destination decision. The native system share sheet lets the operating system expose its standard save or send choices after the user explicitly selects one.

## Verification

Gateway integration tests cover authenticated content search forwarding, rejection of NUL search input before the desktop call, and session-authorized attachment read forwarding. Mobile API tests cover the credential headers, request bodies, and percent-encoded session and attachment paths. Strict TypeScript checks pass for the Gateway and native app, and the Gateway package builds successfully.

iPhone 17 Pro iOS 26.0 simulator builds after Expo prebuild and Pod installation link ExpoFileSystem and the Expo module runtime used by Expo Sharing. The first post-prebuild binary used the stale 8097 Metro endpoint; the Debug preprocessor now defines `RCT_METRO_PORT=8090`, and the reinstalled application loads the connected workspace from 8090 without a native or JavaScript exception. The available desktop state did not include a selected session with durable images or a content-search result, so populated image preview, system share-sheet, camera-capture, and search-result visual assertions remain future live-session checks.

## Consequences

A paired mobile client can now search desktop-visible conversation content without indexing it locally, preview and share/save only images already authorized by the current session, and attach a compressed photo from either the camera or library with retry-safe drafts. The feature adds Expo Sharing and direct Expo FileSystem dependencies plus their generated iOS registration. It deliberately does not expose arbitrary desktop files, directories, artifact browsing, text/diff file downloads, full offline search, unlimited pagination, or automatic background media synchronization.
