# Agent Note: Keep mobile session detail actions in the active conversation

Status: implemented

[English](2026-08-22-mobile-session-detail-return-and-latest-positioning.md) | 中文

## Problem

移动端模型选择页是会话路由的同级 Drawer 页面，而不是其嵌套子页面。因此，模型写入成功后的 `router.back()` 依赖偶然形成的导航历史，可能回到工作区编辑器而非当前会话。

`FlatList` 可能在异步 history 内容完成布局前发出首次滚动测量。若把该测量当作用户主动翻阅历史，就会取消待执行的初始滚动，使新打开的会话停留在最新可见消息之前。

## Decision

模型选择页的显式返回操作和成功执行 `session.selectModel` 后，都通过 `router.replace(sessionDetailReturnTarget(sessionId))` 返回。`sessionDetailReturnTarget()` 在存在会话标识时解析为 `/session/[sessionId]`，只有缺少会话标识时才使用 `/workspace`。

会话列表在 `initialLatestPositionPending` 为 true 时忽略 `onScroll` 的距离测量。`onContentSizeChange` 仍然拥有首次 `scrollToEnd({ animated: false })` 调用，并且只在请求该滚动后标记首次定位完成。之后的测量继续沿用既有的“接近最新内容时自动跟随”策略，因此用户主动查看旧历史时仍会显示返回最新消息控件，流式更新也不会覆盖该选择。

## Alternatives considered

**保留 `router.back()`。** 根 Drawer 把会话和模型路由登记为同级页面，因此 back 操作没有可以识别当前会话的不变性。保留该依赖会继续产生已报告的工作区／新对话回退。

**把所有会话详情页面重构为嵌套 Stack。** 专用 Stack 同样能让返回路径确定，但需要迁移 mode、permission、interactions、rename、subagent 和 Drawer 登记，影响范围更大。模型操作当前需要的是窄修复；该 helper 也与后续 Stack 迁移兼容。

**在每次内容更新时都滚动到底部。** 这会让新打开的会话看似始终处于最新状态，但会反复把正在查看旧历史的用户拉走。首次定位保护修复竞态，同时保留原有“仅在接近最新内容时跟随”的行为。

## Testing

`apps/mobile/tests/session-route-logic.spec.ts` 验证稳定后的会话详情操作会解析到当前会话路径，并且只在缺少会话标识时回退到工作区。

`apps/mobile/tests/session-scroll-logic.spec.ts` 验证首次定位完成前会忽略测量事件，同时保留对最新消息、主动查看历史和空会话的既有覆盖。

## Consequences

选择模型不再依赖 Drawer 的导航历史，进入或返回会话时会在普通滚动跟踪开始前请求定位到最新可见消息。

模型路由有意使用 replace，而非保留一条历史记录。用户会回到刚配置的会话，返回手势不会重新打开已经完成的选择页。其他详情路由维持现有导航行为，可在单独且范围更广的导航变更中迁移到嵌套 Stack。
