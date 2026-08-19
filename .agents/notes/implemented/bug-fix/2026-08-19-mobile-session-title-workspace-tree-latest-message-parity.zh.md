# Agent Note: 原生移动端会话标题、工作区树与最新消息对齐

Status: implemented

[English](2026-08-19-mobile-session-title-workspace-tree-latest-message-parity.md) | 中文

## Problem

原生会话页使用固定的“会话”标题，而桌面/Web 对话页会显示当前选中会话的真实标题。抽屉在构建工作区分组之前先按全局最近更新时间截断会话，导致虽然存在于桌面 `workspace.list` 中的工作区或成员可能在手机上消失。原始桌面 `session.list` 摘要不包含最终投影标题或 `sessionListMetadata.blank`，移动端曾以首条用户消息回退标题，因而可能复制已有标题的工作区成员并把空白临时会话显示为普通行。事件桥还曾仅向 `/v1/events` 发送设备凭据的 token 部分，而 Gateway 要求 `deviceId.accessToken`；正常提示 POST 可以到达桌面端，但 SSE 会以 401 失败，手机无法接收 Agent 执行过程。

## Decision

已配对原生客户端在抽屉、工作区入口、会话页和重命名流程中统一通过 `['session-list', gatewayUrl, deviceId]` React Query 缓存读取会话元数据。会话顶部从该缓存按当前 `sessionId` 解析标题，并采用与抽屉行相同的“新会话”回退。Gateway 从 `session.history.projections.values` 补全其受限的会话列表投影：只使用桌面的 `title` 投影以及工作区树所需的 `sessionListMetadata.blank` 可见性元数据。现有 Gateway 事件会在桌面会话和工作区变更后使此缓存失效，因此桌面端仍是唯一事实源。

`mobileAuthorization()` 构造所有已认证移动 Gateway 路由共用的设备绑定 Bearer 值。`MobileApi` 和 `MobileSyncBridge` 都使用它，因此 `/v1/events` 与提示请求一样接收 `Bearer deviceId.accessToken`。提示提交成功后，会话页立即将事件缓存标为运行中，并使持久历史、增量事件、队列与作业快照失效；SSE 仍是新持久事件和瞬态状态的低延迟来源，而这些权威读取用于收敛提交边界。

`sessionRows()` 先使用完整的未归档会话集合和桌面投影的 `workspaces[].sessionIds` 顺序，再渲染分组。每个桌面工作区节点都会保留；每个工作区成员会先被计入归属，再判定是否可见，归档和子 Agent 行会隐藏，空白行仅在它是当前选中会话时显示。因此，只有可见且实际不属于任何工作区的会话才会显示在“未分组”中，并按最近更新时间排序。抽屉按每个已展开工作区分别应用桌面浏览器的五条会话溢出规则；展开一个分组不会隐藏或重新归属其他分组的会话。

会话 `FlatList` 使用会话级的最新消息策略。切换路由或从轨迹返回对话页时，历史数据和列表布局到达后会请求一次无动画的末尾定位。后续内容尺寸变化只会在用户仍处于最新消息附近时继续跟随到底部。用户向上滚动会清除初始定位状态，实时帧不会抢占历史阅读位置。

## Verification

移动端和 Gateway 严格 TypeScript 程序通过。Gateway 集成测试验证已认证的版本化 SSE 与会话列表历史投影；定向 Vitest 覆盖共享设备凭据、桌面工作区成员顺序、隐藏空白和子 Agent 行的归属计入、每工作区溢出、标题回退、首次定位、靠近底部跟随以及用户离开底部后的不自动滚动行为。已配对的 iPhone 17 Pro 模拟器在 SSE 认证修复后收到 HTTP 200，原生提示提交后实时会话计数从 7 轮/31 步变为 8 轮/46 步，且没有新的 Gateway 401。Android Debug 组装和流式安装通过，但 Android 16 AVD 再次在应用 UI 可评估前进入 System UI ANR；Android 视觉断言仍需健康 AVD 或物理设备补做。

## Alternatives considered

**保留全局前五条会话预览。** 未采用，因为全局按最近更新时间截断会改变桌面工作区树：原本可见的工作区可能变为空或消失，展开操作也不再具有稳定的分组语义。

**新增移动工作区 Store 或为 Gateway 扩展第二个分组端点。** 未采用，因为 `/v1/sessions/list` 已经组合桌面 `session.list` 和 `workspace.list` 投影。新增第二个事实源会增加同步行为，却不能解决渲染缺陷。

**使用反向列表或对实时消息始终强制滚动。** 未采用，因为这会改变现有原生消息布局，并让有意阅读历史的用户无法稳定停留。所选 `FlatList` 策略保留现有阅读方向，同时区分首次进入和用户主动上滑。

## Consequences

移动抽屉现在采用与桌面/Web 浏览器相同的工作区成员模型和分组内溢出语义，同时保留原生手势、安全区域和 `FlatList` 体验。移动 Gateway 投影刻意限制在桌面拥有的标题和空白元数据；它不引入第二个会话 Store，也不开放桌面专属控制。本次实现刻意不复刻桌面拖拽排序或本地持久化排序偏好；它们需要独立的移动控制界面，不属于当前一致性缺陷。iOS 已完成标题/工作区树回归，并确认已认证的实时状态更新可以到达；由于当前 Android 16 AVD 的 System UI 进程不稳定，Android 仍需要健康 AVD 或物理设备补做。
