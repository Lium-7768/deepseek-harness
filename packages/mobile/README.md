---
description: "Package map for the mobile half: the loopback-only gateway that pairs one native mobile client with a running desktop DeepSeek Harness runtime."
kind: "package-group"
---

# mobile/ — native mobile client bridge

English | [中文](README.zh.md)

## Summary

The `mobile/` group bridges one paired native mobile client to a running desktop DeepSeek Harness runtime over loopback only. It owns no agent runtime and no session storage: the desktop runtime remains authoritative for sessions, workspaces, and history, and the gateway projects a selected allowlist of those operations into a mobile API. Because the adapter is a projection rather than a service layer, every runtime contract stays with the desktop packages it forwards to, and the mobile API deliberately excludes desktop-local capabilities such as arbitrary filesystem access, credentials, and raw terminal streams. Authoring rules for packages here follow the repository [conventions](../../AGENTS.md#conventions).

## Table of Contents

- [Packages](#packages)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The package README owns the pairing, subscription, and projection contracts.

| Package | Role | ctx key |
|---|---|---|
| [`gateway/`](gateway/README.md) | Projects desktop sessions, workspaces, history, and interaction into the paired mobile API | — |

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
