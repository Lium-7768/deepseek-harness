# Agent Note: Normalize desktop and Mobile Gateway release members

Status: implemented

English | [中文](2026-08-22-normalize-desktop-and-gateway-release-members.zh.md)

## Problem

The workspace release-member policy already treats `packages/*/*` and `apps/*` as publishable artifacts, but the Mobile Gateway and desktop manifests retained bootstrap-era private metadata and incomplete publication payloads. The Gateway also bypassed the standard declaration-first build and package-owned invariant companion. These inconsistencies made the release, invariant, license, and packed-artifact checks disagree about what the desktop delivery surface contains.

## Decision

`@deepseek-ai/dsh-mobile-gateway`, `@deepseek-ai/dsh-desktop`, and `@deepseek-ai/dsh-desktop-runtime` are release members with root-aligned versions, public npm access metadata, repository directories, and MIT licenses. The desktop application publishes its `out` bundle with the materialized `.runtime` dependency closure. The dependency-only desktop runtime publishes its manifest, from which deployment materializes the closure.

The Gateway follows the ordinary DSH package layout: TypeScript emits `lib/types`, tsdown emits independent `lib/index.js` and `lib/invariant.js` entries, and the package exports and declares both. Its companion reserves the Gateway package name and documents that no independently observable Cordis event or durable-data relation exists beyond the integration-tested transport behavior.

This decision supersedes the dsh-family access assertions in [the former sequence policy](../../archived/process/2026-08-13-public-vendor-and-native-sequences.md). Publication still occurs only through the existing reviewed release path; declaring access metadata does not publish a package.

## Alternatives considered

**Keep the three manifests private.** This would leave packages that the workspace defines as release members unable to pass pack and invariant validation, while the desktop delivery tree would remain undocumented.

**Exclude desktop applications and the Gateway from release-member checks.** This would create a special unvalidated packaging class for artifacts that are installed or materialized in deployment, weakening the repository's manifest and payload policy.

**Use a publish-command `--access` flag.** A command flag overrides the manifest that travels with the artifact and cannot express package-owned access decisions consistently across release families.

## Consequences

Future release preparation can validate the Gateway, desktop application, and desktop runtime as complete package payloads. A later release tag may publish these members with public access; changing that access requires a separate release-policy decision.

The older access-policy record remains historical rationale for the staged release model but is no longer the current description of DSH package access. The workspace constraints, package manifests, and this note are the current source of truth.

## Verification

Workspace constraints validate the three manifests and their declared payloads. Package-invariant checks validate the Gateway companion, and the Gateway integration suite exercises its authenticated transport behavior after the standard build produces the published entries.
