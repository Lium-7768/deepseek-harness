# Agent Note: Mobile Gateway SSE projection

Status: implemented

[English](2026-08-19-mobile-gateway-sse-projection.md) | 中文

## Problem

原生移动客户端需要在不修改 DSH runtime 的前提下映射活跃的桌面和 Web 对话。独立刷新周期会延迟工作状态的可见性；当 durable history 的 HTTP 读取与新建立的事件流并发时，客户端也缺少 history 读取与实时事件之间可证明的交接点。

## Decision

`@deepseek-ai/dsh-mobile-gateway` 继续作为 DSH host 与 mux 下行流之上的外置 loopback 投影。它不修改 DSH Agent Loop、会话持久化、Web UI、插件或 wire 协议。`GET /v1/events` 是唯一的移动端长连接传输，并继续全局发布版本化 host 帧。会话 mux 帧只会通过显式的已配对设备订阅发送。

客户端使用 `POST /v1/sessions/:sessionId/subscriptions` 以及最后已应用的 durable `seq` 建立会话订阅。Gateway 创建一个即时的、连接拥有的租约，其中包含请求水位线、切换事件 ID、激活令牌和有界事件缓冲。租约建立期间不读取 DSH history，因此正在执行的 turn 不会阻塞激活。响应只包含 Gateway 拥有的队列、作业和待处理交互快照；durable history 始终通过权威的 DSH HTTP 读取获得。

客户端将 Gateway 快照写入现有 TanStack Query 缓存，以 `POST /v1/subscriptions/:subscriptionId/activate` 激活租约，随后使 durable history 与会话事件失效。在交接期间，Gateway 缓冲切换事件 ID 之后的 mux 帧。激活会验证令牌和水位线，只重放 `seq` 大于已应用水位线的 durable 事件，并将租约改为实时投递。缓冲区满时租约被标记为需要重新同步，而不会静默丢失事件。

`MobileSyncBridge` 保持现有的单一认证 SSE 连接，也不改变任何可视组件。收到 `gateway/ready` 后，它读取 `POST /v1/sessions/running`；该接口只返回运行中会话 ID，避免读取完整工作区和 history 投影。它为这些 ID 以及之后的运行中 `host/session-status` 帧建立租约。重连会清除本地租约记录并重复该恢复路径。

## Recovery semantics

durable 事实源仍是 DSH 会话 history 及其 `seq` 游标。移动客户端在激活租约后读取 history，之后只接收较新的 durable 事件。队列、作业和待处理交互是 Gateway 拥有的快照，采用替换而非本地重建。若租约激活报告缓冲已过期或失败，桥接层会使相同会话的查询族失效，使既有 HTTP 读取器收敛到桌面权威状态。

Gateway 会在上游关闭后重连 DSH mux 与 host 流。它只在存在移动 SSE 客户端时维持 host 流。Gateway 关闭时会中止上游流、清除租约和重试状态，并关闭下游客户端。

## Alternatives considered

**继续使用独立轮询。** 轮询保留了可见延迟，也可能把来自不同桌面时刻的相关状态组合在一起，且无法为活跃 turn 定义 history 到事件的交接。

**在创建订阅前读取完整 history。** 活跃 turn 中的 history 读取会延迟原生客户端的租约激活。即时租约加激活后 history 读取保留了 DSH 的 durable 所有权，也不会阻塞实时投递。

**创建持久化的移动 Session Store。** 独立移动数据库会复制桌面会话所有权，并在 DSH 外引入冲突解决；客户端只保留 TanStack Query 缓存。

**以 Codex App Server 替换 DSH。** Codex App Server 拥有 Codex 的 thread、turn、工具和持久化，无法在不替换当前 runtime 的情况下投影 DSH 会话。其订阅与恢复语义只用于指导本外置适配器，不作为运行时依赖。

**直接向原生客户端公开桌面 mux 协议。** 这会让移动端耦合桌面内部 wire 格式，并暴露配对设备 API 之外的字段。Gateway 保持受限的版本化信封。

## Verification

Gateway 集成覆盖验证订阅水位线过滤、切换缓冲、激活重放、会话过滤、认证 host 发现、history、交互、队列、工作区、消息和图片。移动 API 覆盖验证认证后的运行会话发现、订阅创建和激活。移动端 TypeScript 编译通过。

已封装的桌面壳与已配对 iOS 模拟器运行真实 DSH 任务，任务流式输出 150 条中文编号句子。桌面仍在处理时，原生对话已显示部分输出和 `Deep diving...`；任务结束后已显示完整 150 条内容。本决策未修改任何移动页面组件。

## Consequences

桌面与 Web 保持 DSH 权威源，移动端则获得可靠的外置映射，无需新增 Agent Loop 或 DSH 源码分叉。租约缓冲有意保持有限；溢出后必须通过 HTTP 重新同步。本地 loopback Gateway 不提供跨网络 relay、TLS 终止、推送通知或多主机协调；这些能力需要单独部署经过认证的 relay。
