---
description: "移动端分组的包索引：仅经回环把一个配对的原生移动客户端接入正在运行的桌面端 DeepSeek Harness 运行时的网关。"
kind: "package-group"
---

# mobile/ — 原生移动客户端桥接层

[English](README.md) | 中文

## 摘要

`mobile/` 分组仅经回环把一个配对的原生移动客户端桥接到正在运行的桌面端 DeepSeek Harness 运行时。它不持有 Agent 运行时，也不持有会话存储：会话、工作区与历史仍以桌面端运行时为准，网关只把其中一份准入清单内的操作投影到移动端 API。由于该适配层是投影而非服务层，每项运行时约定都留在它所转发的桌面端包中；移动端 API 也有意排除任意文件系统访问、凭据、原始终端流等仅限桌面端的能力。本分组内的包遵循仓库[约定](../../AGENTS.md#conventions)。

## 目录

- [包](#packages)
- [开发笔记](#dev-note)

-----

<a id="packages"></a>
## 包

包 README 拥有配对、订阅与投影约定。

| 包 | 职责 | ctx key |
|---|---|---|
| [`gateway/`](gateway/README.zh.md) | 把桌面端会话、工作区、历史与交互投影到配对的移动端 API | — |

<a id="dev-note"></a>
## 开发笔记

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
