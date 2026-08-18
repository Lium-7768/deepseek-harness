# Agent Note：原生移动端交互反馈与写入锁

Status: implemented

[English](2026-08-17-native-mobile-interaction-feedback.md) | 中文

## 问题

原生移动端有多项操作没有明确表达状态：多行输入框的 Return 可能被误解为发送，发送和停止期间缺少忙碌反馈，权限状态可能过期，模式、模型和待处理操作控件可能在写入完成前继续接收修改。查询失败和剪贴板失败也缺少局部恢复或可访问反馈。

## 决策

Composer 通过 `submitBehavior="newline"` 和 `returnKeyType="default"` 保留 Return 换行；发送只通过明确按钮触发。发送和停止控件使用 44px 命中区，暴露 busy accessibility state，并在请求期间显示 ActivityIndicator。会话运行时停止按钮保持为主操作，只有取消请求期间才禁用。

权限选项在状态查询 pending、stale、错误、会话忙碌或提交期间保持锁定。状态查询按周期并在窗口获得焦点时刷新。设置页选择完全访问时要求 destructive 确认。模式和模型写入在每个页面使用一个 mutation lock，模型写入失败时恢复之前选择。

问题选项使用 radio 或 checkbox 语义，并提供 selected 与 disabled 状态。响应提交期间锁定回答输入。设置、会话、模式、模型和权限查询错误都提供页面内重试。忘记连接会捕获安全存储失败。复制操作继续只显示图标；剪贴板失败时更新可访问标签并播报简短重试提示，不打开 Alert。

## 考虑过的替代方案

**把多行输入的 Return 作为主要发送手势。** 不予采纳，因为 React Native 不保证 iOS 上 multiline TextInput 触发 `onSubmitEditing`，且 Return 必须保留为换行操作。

**在另一个请求 pending 时隐藏停止操作。** 不予采纳，因为会话运行时必须保留可见取消入口；只有取消请求本身进行期间才禁用它。

**允许选择写入并发执行。** 不予采纳，因为快速重复点击可能写入相互竞争的会话选择，并触发重复返回导航。

**剪贴板失败使用 Alert。** 不予采纳，因为复制是频繁的阅读操作，对可恢复错误使用模态提示不成比例。

## 后果

移动端拥有明确的请求反馈和重试路径，同时不改变根 Drawer、导航层级、header 或视觉 token 定义。最终权限和选择校验仍由网关负责。

## 验证

focused mobile Vitest 覆盖 composer action policy、权限 freshness lock、选择 mutation lock 和问题选项语义。验证范围包括 mobile TypeScript、focused Vitest、Expo JavaScript export 和 `git diff --check`；不包含原生 iOS build。
