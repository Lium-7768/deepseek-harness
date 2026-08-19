# Agent Note: Mobile Gateway SSE projection

Status: implemented

[English](2026-08-19-mobile-gateway-sse-projection.md) | 中文

## Problem

原生移动客户端此前通过多个独立的 2.5 秒查询刷新桌面会话事件、队列状态与待处理交互。不同查询的轮询周期会延迟桌面变更的可见性，也可能短暂地将队列、交互列表与会话状态渲染为来自不同桌面时刻的数据。Gateway 重启后也需要客户端具备明确的恢复路径。

## Decision

Mobile Gateway 提供经过认证的 `GET /v1/events` Server-Sent Events 流。它将现有桌面 DSH mux 与 host 下行流规整为版本化移动事件信封，包含临时 Gateway 事件 ID、事件类型、载荷、可选会话 ID、可选 durable 会话序号，以及用于完整状态帧的快照标记。

Gateway 仍然是薄投影。它从 DSH 转发会话 durable 事件、主机的会话/工作区状态、队列快照和交互帧。它仅保留现有的待处理交互与队列快照，以服务其狭窄 HTTP API；不拥有会话数据库、回放日志、Agent Loop 或面向客户端的业务状态。

React Native 根组件挂载一个 `MobileSyncBridge`。应用处于活动状态时，它使用已配对设备凭据打开一条认证 SSE 连接，仅在一个小型状态库中记录传输存活状态，并更新现有 TanStack Query 缓存。应用进入后台或非活动状态时连接关闭，并以有界退避重连。每次收到 `gateway/ready` 基线后，它会使 durable history 与 transient 快照失效，从而让移动缓存从桌面权威源重新加载。

会话事件在 `session-events` 缓存中按 durable 序号去重。队列帧会替换队列缓存，因为它们是主机拥有的完整快照。交互与工作区帧仅使相应查询族失效。会话、交互、队列与权限页面因此移除了高频轮询，同时保留初次 HTTP 读取和手动重试行为。

## Recovery semantics

认证成功后，移动 Gateway 客户端会立即收到 `gateway/ready` 基线。移动应用随后重新获取会话 history、events、interactions、queues 和活动会话列表。durable history 继续使用桌面 `seq` 游标和分页 API；transient 的队列与交互状态重新从桌面快照加载，而不在本地重建。

Gateway 会在上游关闭后重连 DSH mux 与 host 流。仅在存在移动 SSE 客户端时保持 host 流重连。Gateway 关闭时会中止上游流、清除重试计时器并关闭下游 SSE 客户端。

## Alternatives considered

**继续使用独立轮询。** 这一方案的传输简单，但会保留可见延迟、冗余请求和相关查询之间的短暂不一致；因此不再适用于活跃会话同步。

**创建独立且持久化的移动 Session Store。** 它可以在本地回放事件，但会复制桌面状态所有权，并在 DSH 之外创建冲突与恢复逻辑。由于桌面/Web 仍是唯一权威源，该方案被拒绝。

**直接向原生客户端公开桌面 mux 协议。** 这会使应用耦合桌面内部 wire 格式，并暴露移动渲染不需要的字段。最终选择 Gateway 特定的版本化信封。

**使用 WebSocket。** 当前不需要双向流式传输，因为移动变更仍通过认证 HTTP 路由发送。SSE 可以保持新增实时通道足够狭窄，并符合原生客户端的生命周期模型。

## Verification

Gateway 集成测试验证未认证客户端会被拒绝，认证客户端会通过 `/v1/events` 接收 ready 基线、durable mux 会话事件与 host session-status 帧。现有集成覆盖继续验证消息、history、交互、队列、工作区和图片内容。移动端与 Gateway 的 TypeScript 程序均在严格设置下编译。

## Consequences

活跃原生页面通过一条认证事件连接更新，而不再依赖多条高频轮询。初次读取和恢复仍基于 HTTP，因此中断流会在重连后收敛到桌面状态。Gateway 事件 ID 有意保持临时性；durable 连续性仍由桌面会话 `seq` 值和 history 分页承担。Goal、Plan、Jobs、Subagent、配对、Token 轮换和跨网络传输仍属于后续独立阶段。
