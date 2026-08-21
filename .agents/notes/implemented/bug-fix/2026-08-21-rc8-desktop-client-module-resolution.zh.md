# Agent Note: RC.8 桌面客户端模块解析

Status: implemented

[English](2026-08-21-rc8-desktop-client-module-resolution.md) | 中文

## Problem

RC.8 的客户端装配移除了原有的 `@deepseek-ai/dsh-client-web-react` 聚合包，改为挂载单独的 API remote contribution。桌面 Web shell 只能从冻结的静态模块表解析客户端 bundle external。遗漏 remote contract 会使打包后的桌面端停在启动页；而把模块命名空间作为 `./remote` 入口的值时，得到的是 `default`，而不是 contribution 的 `descriptors` 数组，导致 `@deepseek-ai/dsh-api-remotes` 无法挂载。与此同时，RC.8 中桌面事件 mux 与 host 端点改用 WebSocket，而 Mobile Gateway loopback client 仍尝试通过 SSE 订阅。

## Decision

`packages/client/web/src/platform.ts` 将 commands、goal、dynamic Cordis、file-reference、host-plugin-inventory、message-feedback 与 session-reference remote specifier 声明为平台模块。`packages/client/web/src/seed.ts` 静态导入它们的默认导出，并把每一个 specifier 映射为对应的 contribution 对象。Web shell manifest 将这些 owner package 列为构建依赖，打包桌面运行时包含 Web application、React 和 React DOM，使暂存的运行时能够解析同一套客户端装配。

`DshLoopbackClient` 为两个桌面事件通道建立经过认证的 WebSocket 订阅，并保留 Mobile Gateway 已有的、经过认证的移动端 SSE 投影。Gateway 保持设备安全边界，不向手机暴露桌面 Web GUI 或原始事件端点。

桌面打包在 Web 静态 bundle 重建后使用当前客户端产物重新执行。这样静态链接的 JavaScript、输出的 UI CSS 与复制到 Electron 运行时的冻结模块表保持一致。

## Verification

更新模块表及其默认 remote import 后，Web frontend 生产构建通过。打包后的桌面应用启动本地 Web runtime 与 Mobile Gateway 时没有客户端控制台错误。`node --test packages/mobile/gateway/tests/*.mjs` 的 15 项测试全部通过，其中包含 mux 与 host WebSocket 回归覆盖。`vitest run apps/mobile/tests/` 的 70 项移动端测试全部通过，`tsc --noEmit -p apps/mobile/tsconfig.json` 通过。清理 Metro 缓存并重启后，iPhone 17 Pro 模拟器重新连接到重建的桌面 Gateway 移动 SSE 流。

## Alternatives considered

**保留已移除的 Web React 聚合包。** 未采用，因为 RC.8 发布的是独立 remote contract。重新引入废弃聚合包会掩盖已挂载 remote namespace 的真实归属，并偏离上游 package export。

**从 profile 动态解析 remote contract。** 未采用，因为客户端 bundle 需要共享 singleton external。冻结的 Web table 是支持的静态装配路径；它使遗漏 remote 成为构建期可见的声明不一致，而不是依赖 profile 的桌面启动行为。

**继续使用 SSE 读取桌面事件输入。** 未采用，因为 RC.8 的桌面 mux 与 host transport 是 WebSocket。Gateway 仅将经过认证、面向移动端的投影转换为 SSE，从而在不复制桌面协议的前提下保留既有原生重连接口。

## Consequences

未来任何由 `@deepseek-ai/dsh-api-remotes` 挂载的 API remote，都需要在 Web 静态模块表中补齐 package dependency、platform word 和默认 contribution entry。浏览器端 package 更新后，需要重新生成静态链接客户端产物和 Web frontend，再进行 Electron 打包。移动端消费者继续接收已有的、带版本且经过认证的 SSE 流，而 Gateway 跟随上游桌面 WebSocket transport。
