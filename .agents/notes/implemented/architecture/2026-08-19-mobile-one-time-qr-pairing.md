# Agent Note: Mobile one-time QR pairing

Status: implemented

English | [中文](2026-08-19-mobile-one-time-qr-pairing.zh.md)

## Problem

The native client previously required a user to copy a Mobile Gateway URL, a device identifier, and an access token from the desktop control window. That flow was slow on a phone, exposed a long-lived credential to the clipboard and visual copy errors, and did not provide a bounded enrollment ceremony for a new device.

## Decision

The desktop control window creates a five-minute, single-use pairing record through the Mobile Gateway. The Gateway keeps only a hash of the high-entropy pairing secret and associates the record with an opaque pairing id and optional device label. The desktop encodes the gateway URL, pairing id, pairing secret, and expiry time into a QR code. It does not put the durable device credential in the QR payload.

`POST /v1/pairing/redeem` is deliberately the only unauthenticated pairing route. It requires both the pairing id and secret, rejects expired or consumed records as `pairing-not-found`, removes a valid record before returning, and issues the existing durable paired-device credential exactly once. All ordinary mobile Gateway routes continue to authenticate that credential.

The React Native connection screen presents scanning as its primary action while retaining manual gateway, device-id, and token input as a recovery path. `apps/mobile/app/connect/scan.tsx` uses `expo-camera` `CameraView` to read the desktop QR payload, validates its structure and expiry locally, redeems it over HTTPS, and saves the returned credential through `expo-secure-store`. Invalid, expired, or previously redeemed codes use the recoverable `pairing-invalid` presentation instead of exposing upstream details.

The Expo configuration declares the Chinese camera-permission text and the iOS `keychain-access-groups` entitlement. The checked-in iOS project and Pod lockfile register `ExpoCamera` and barcode-scanning frameworks so a native iOS build contains the scanner. The iOS simulator uses an ad-hoc signing path that can display an empty final entitlement dictionary; the source entitlement is nevertheless kept in the generated project for a provisioned physical-device build.

## Credential ownership and lifetime

A pairing record is bootstrap material, not a device credential. It expires in five minutes, is consumed before credential issuance, and cannot be used again after a successful or failed stale redemption. The durable credential remains the only credential stored on the phone, in operating-system secure storage, and it is the credential that existing revocation and authenticated Gateway behavior apply to.

The QR code intentionally carries a gateway address because the first cross-network transport remains a later phase. Pairing does not open desktop Web GUI routes or raw desktop APIs, introduce a separate mobile account, or change the desktop's authority over sessions and workspace data. The event synchronization decision remains documented in [Mobile Gateway SSE projection](2026-08-19-mobile-gateway-sse-projection.md).

## Alternatives considered

**Copy a permanent token manually.** This reused the early developer workflow but made everyday enrollment error-prone and placed a durable secret in a phone's clipboard path. It remains only as a recovery path for controlled environments, not the primary interaction.

**Encode the durable credential directly in the QR code.** This shortened the round trip but would make any captured code valid until explicit revocation. A short-lived bootstrap secret limits the QR code's exposure window and allows the Gateway to enforce single use.

**Require an authenticated device to create another device.** That would avoid an unauthenticated redemption endpoint but makes the first mobile enrollment circular and couples the desktop control window to an existing phone. Desktop-local QR creation is the trusted enrollment action instead.

**Expose desktop Web or DSH APIs to the scanner.** This would bypass the Mobile Gateway's purpose-built credential boundary and expose unnecessary desktop surfaces. The narrow redemption endpoint keeps the public pairing vocabulary limited to bootstrap data and a resulting device credential.

## Verification

The Gateway integration suite verifies that one generated secret yields one durable credential and rejects a later redemption. Mobile API tests validate a successful unauthenticated redemption request and local presentation of expired or consumed pairing failures. Strict TypeScript checks pass for the mobile app, Gateway, and desktop app, and the Gateway package builds successfully.

An iPhone 17 Pro iOS 26.0 simulator build links Expo Camera and opens the connection page, the primary QR entry, and the scanner route without a SecureStore Keychain exception. Granting the simulated camera permission renders the native scanner container and fallback action. The simulator has no usable virtual camera, so its AVFoundation preview error does not replace physical-device validation of actual QR image capture.

## Consequences

A user can pair a new phone by opening the desktop control window, showing a QR code, and scanning it in the native client without copying a durable token. The QR payload is now a versioned bootstrap format and the Gateway owns its expiry and consumption semantics. This adds a narrow unauthenticated endpoint and native camera dependency, both constrained to enrollment; it does not solve cross-network connectivity, physical-device camera verification, device listing or revocation UI, push notifications, or cloud identity. Those remain separate follow-up work.
