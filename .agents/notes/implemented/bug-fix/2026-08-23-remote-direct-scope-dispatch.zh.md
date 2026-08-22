# Agent Note: Agent 作用域内仍显式分派直接 Remote 调用

Status: implemented

[English](2026-08-23-remote-direct-scope-dispatch.md) | 中文

## Problem

一个生成的 Remote 方法可能同时提供直接形式和作用域别名：直接形式由调用方提供 agent lookup identity，作用域别名则从调用方 Context 推导该 identity。此前 `ClientRemote` 只要发现调用方拥有 identity 就优先选择作用域别名。浏览器命令 UI 会在会话作用域中提交命令，但仍显式传入 `(agentId, line, images)`。作用域别名移除了 `agentId` 后，把 `images` 当作可选取消参数并传给 `AbortSignal.any`。Chromium 在请求到达 Host 前拒绝该值，导致 Web 和 Electron 中的 `/goal` 及权限命令均失败。

## Decision

`packages/api/gateway/src/client/index.ts` 仅在全部严格业务编解码器接受传入位置值时优先选择直接方法。只有调用方 Context 可解析 identity，且作用域别名自身的严格位置形式也接受这些值时，才选择作用域别名。可选的尾随取消值仅在它是浏览器原生 `AbortSignal` 时才成立；其他值仍按业务输入校验，绝不会传给 `AbortSignal.any`。

API Gateway 客户端测试覆盖 agent 作用域中的显式直接调用。API Remote 矩阵会装载当前选定的生产贡献，证明命令、Goals、文件引用和会话引用均保留显式直接 wire 字段；文件和会话引用还保留真实取消信号。包 README 记录了 direct/scoped 选择与取消规则。

## Alternatives considered

**只要存在 identity 就始终优先作用域别名。** 该方案被拒绝，因为调用方 Context 的存在不会抹去显式提供的 lookup identity。命令必须使用直接形式来保留图片业务参数。

**把每个额外尾随值都当作取消参数。** 该方案被拒绝，因为它会把格式错误的业务输入转换为浏览器原生的转换异常，并掩盖原本的调用错误。

**在作用域 Context 中禁止直接方法。** 该方案被拒绝，因为会话作用域 UI 可以合法地以显式目标 identity 调用直接 API；限制该调用会人为增加一条所有权边界。

## Consequences

共享同一 JavaScript 方法名的生成 Remote 重载现在按严格位置输入形态而不是仅按 Context identity 选择变体。浏览器调用方会收到无效尾随值的正常描述符校验，合法的取消信号仍会与贡献项生命周期合并。未来任何业务参数数量或编解码器可能重叠的 direct/scoped 方法对都需要回归测试。
