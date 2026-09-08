# Agent Note: Mobile Gateway 迁移到统一 Remote 线路协议

Status: implemented

[English](2026-09-08-mobile-gateway-remote-wire-migration.md) | 中文

## Problem

api-gateway 取代了 Mobile Gateway 原来依赖的桌面下行接口：携带服务端推送 `server-request` 帧的 SSE 下行 `/api/events.mux` 与 `/api/events.host`，以及 `/api/<namespace>.<method>` 下的按方法 HTTP 端点都已移除。取而代之的统一 Remote 协议在 `POST /api` 提供一元 RPC，并把客户端打开的逻辑流复用在一条 `/api/remote.mux` WebSocket 上。平台分支合入 master 的 api-gateway 之后，网关的每一次上游调用都已失效，因此回环客户端和全部路由处理器必须迁移，否则网关将无法提供任何服务。

## Decision

`DshLoopbackClient` 改说统一线路协议。`call(endpoint, args)` 以回环 `host` 头发送 `{type: 'client-request', rpcId, method, payload: {args}}`——网关在回环信任栅栏上不需要浏览器认证 cookie——并解开 `server-response` 结果信封，把上游 `error` payload 映射为带类型的 `upstream-rejected` 失败。`open(endpoint, args, signal)` 连接一条 `/api/remote.mux` WebSocket，用网关生成的 `streamId` 发送 `open`/`cancel` 帧，持续产出 `item` 值，直到 `end`、`error` 帧或调用方中止。

网关的上游表面收缩为网关自有流加按会话 follow。三条流贯穿网关生命周期运行：转发 Host 事件（`$events`）、会话控制（`session/control`）和工作区 follow（`workspace/follow`）。每个活跃订阅按需惰性打开该会话的一条 `session/follow` 流，网关在没有任何订阅需要时释放它，因此按会话流始终以已配对设备的订阅数为上界。队列与任务快照从 mux 帧迁移到 `session/control` 的 baseline 与增量帧；会话标题与空白元数据从按会话的历史读取迁移到控制流投影。

路由处理器保持移动 HTTP 契约不变——所有 `/v1/...` 路径、响应信封、SSE 事件类型和 Bearer 设备认证都维持原样——并翻译为新的 Remote 方法：队列修改走 `session/updateQueue`，目标走携带 `agentId`/`ref` 作用域参数的 `goals/*`，子智能体走 `subagents/list`、`subagents/prompt` 和 `subagents/interruptByParent`，消息反馈走 `messageFeedback/*`；交互应答先由网关对照记忆中的 waterfall 请求校验应答设备的 payload，再通过 `$events/result` 提交。

## Alternatives considered

**在平台分支保留已废弃的下行协议。** 网关会与 master 的客户端分叉，保留死代码路径，并且在 master 的网关端点彻底消失时仍然断裂。

**把 Remote 协议直接暴露给原生客户端。** 这会让移动端耦合到桌面内部线路格式，并暴露已配对设备 API 之外的字段；受约束的 `/v1/...` 信封仍是移动契约。

**用一元 RPC 轮询替代持有流。** 轮询会重新引入订阅设计已经解决的可见延迟问题，并失去实时转发事件。

## Consequences

整个网关↔桌面表面由一个协议服务，移动侧契约不受影响，原生客户端无需改动。按会话的上游开销与活跃订阅数成正比，而不是与会话总数成正比。历史读取改为走 `session/follow` 快照，更早的窗口可选地用 `session/page` 续读，不再依赖专用历史端点。

## Verification

回环客户端套件针对一个说统一线路协议的 fixture 验证一元调用、错误映射、`$events/result` 应答、流 item 消费、error 帧和调用方中止取消。集成套件针对一个服务 `POST /api` 与 `/api/remote.mux` 的 fixture DSH 覆盖全部移动路由分组——配对、历史、生命周期分页、提示提交、队列与任务快照、SSE Host 事件、订阅重放、目标与子智能体控制、计划评审、搜索、附件、投影、运行态 baseline 以及结果上报失败——仓库 typecheck 与 lint 通过。
