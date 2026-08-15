# Agent Note：一套本地 DSH 运行时上的原生桌面端与移动端

Status: proposed

[English](2026-08-15-native-desktop-mobile-clients.md) | 中文

## 问题

Web GUI 是本地 DSH 运行时唯一的产品客户端。它权威地呈现会话、消息、工具调用、问题、审批、工作流、设置与工作区状态，但不提供原生桌面生命周期或原生移动体验。直接将 Web GUI 暴露到互联网不适合原生移动客户端：它的浏览器信任检查保护浏览器调用方，且明确不是认证或设备授权协议。

产品需要一个拥有本地运行时生命周期的桌面应用，以及一个具备原生页面的 iOS/Android 应用。两个客户端必须保持 Web GUI 的产品语义，且不能创建第二个 Agent 运行时、会话存储、工具执行器或云端会话服务。

## 提案

新增两个产品客户端和一个本地适配器。

桌面客户端是 Electron 应用。它的主进程启动并停止打包的 Node 运行时与仅监听回环地址的 `dsh web`，等待服务就绪，在 `BrowserWindow` 中渲染现有 Web GUI，并拥有单实例、托盘和可选本地 Mobile Gateway 的生命周期。Electron 渲染进程不得获得任意文件系统、Shell 或进程 IPC 能力。

移动客户端是 Expo 托管的 React Native 应用。它提供 Web GUI 中适合移动端的原生页面：工作区与会话浏览、会话历史、提示词提交、运行中任务状态、工具摘要和详情、问题、审批、允许的产物及连接设置。它不嵌入 Web GUI 或 WebView。

Mobile Gateway 是仅绑定回环地址的本地桌面进程或贡献。它将选择的现有 DSH API 和事件适配为小型、带版本的移动 API。反向隧道只能转发该 Mobile Gateway 的 hostname，不能转发原始 Web GUI 或通用 `/api` 接口。Gateway 执行一次性、经桌面确认的设备配对；每个请求检查设备绑定的短时凭据；记录设备撤销；只转发被移动 API 明确允许的操作。它不执行 Agent、不保留会话日志云端副本、不暴露模型凭据、不代理任意 URL，也不授予文件系统访问权限。

Web GUI 仍是产品参考。每项 Web GUI 功能都记录一种移动姿态：`adopt`、`adapt for mobile`、`desktop only` 或 `deferred`。每项采用或移动化改造的功能都拥有 Web 参考流程、移动页面、Gateway API 条目和等价性测试场景。移动布局和手势可以不同；会话、工具、审批、错误和权限语义不能不同。

## 移动 API 所有权

Gateway 拥有带版本的移动请求和事件 envelope。它映射到当前 DSH API 方法和事件投影，不向手机暴露 DSH RPC 方法名。第一版允许会话列表与历史、会话创建、提示词提交、任务取消、问题、审批、工具摘要和允许的产物元数据。它排除主机路径选择/打开、凭据、不受限制的设置修改、任意工具参数、原始终端流、环境数据和通用工作区遍历。

每个移动响应或事件都包含移动端 `contractVersion` 与其适配的 DSH 版本。Gateway contract 测试使用与 Web 客户端相同的 DSH fixture，证明允许操作的会话、任务、问题、审批和工具状态等价。

## 设备访问

桌面用户从桌面应用发起配对。手机扫描短时、一次性的配对码，生成或注册设备身份；手机在操作系统安全存储中保存设备凭据。桌面用户确认配对后，Gateway 才允许请求。桌面应用可以立即撤销设备；被撤销的设备不能刷新凭据或调用 Gateway。

反向隧道仅是传输手段。浏览器 Cookie 和嵌入式服务凭据不是移动 API 授权方式。面向自动化服务器工作负载的凭据不得随移动应用安装包分发。

## 功能映射

| Web 功能域 | 移动姿态 | 初始原生处理 |
| --- | --- | --- |
| 工作区选择器、侧栏、会话树 | adapt for mobile | 工作区选择器与会话列表页面。 |
| 会话轨迹和输入框 | adopt | 会话页、原生输入、发送和取消。 |
| 工具行与工具详情 | adapt for mobile | 可展开摘要卡与详情页。 |
| 问题、计划审阅与风险确认 | adopt | 原生弹层或全屏回应流程。 |
| 工作流运行面板 | adapt for mobile | 先提供只读活动卡。 |
| 子智能体、技能、附件、产物 | adapt for mobile | 核心会话流程后逐步新增原生视图。 |
| 模型和插件设置 | deferred 或 limited | 在明确允许修改前只读展示连接/模型信息。 |
| 目录选择器、打开本地路径、凭据 | desktop only | 说明该操作需要桌面应用。 |

## 后果

该提案保留一套 DSH 运行时和一份持久会话历史，同时增加两个需要维护的客户端代码库和一个安全敏感的 Gateway。原生客户端获得一等的桌面与移动交互，但项目必须在上游 Web 产品变化时维护 Web→移动功能映射与 contract 测试。

桌面应用可增量交付，因为它渲染现有 Web GUI。移动应用不能作为通用 HTTP 包装器交付：设备配对、Gateway 授权、事件投影与选定的 API 子集都是产品设计的一部分，需要集成测试。

## 考虑过的替代方案

**PWA 或 WebView 包装器。** 拒绝，因为目标移动体验是具备原生导航和交互的应用，而不是通过应用图标展示的浏览器页面。

**通过公网隧道暴露现有 Web GUI 或 `/api`。** 拒绝，因为现有浏览器信任检查不是设备认证系统，且原始 API 包含不适合手机的桌面本地能力。

**运行云端 DSH 运行时并同步会话。** 拒绝，因为它复制 Agent 运行时与持久状态，扩大安全和运维范围；当桌面电脑仍是执行主机时没有必要。

**创建无关的移动后端。** 拒绝，因为它会重复 DSH 业务策略，而不是适配现有运行时行为。

## 验收标准

- 桌面应用仅在回环地址启动本地 DSH Web GUI，在 Electron 中渲染它，并在有序退出时停止自己拥有的子进程。
- 移动应用不包含 WebView，且对每项允许操作使用原生页面。
- Gateway 仅接受已配对、未撤销的设备，并拒绝原始 DSH 路由、主机能力、凭据和移动 API 之外的请求。
- 对每项允许的移动操作，手机和 Web GUI 观察到等价的会话、任务、工具、问题和审批状态。
- 功能映射为移动发布考虑的每项 Web 功能域记录一种移动姿态和一个验证场景。
- 配置反向隧道时，它只到达 Gateway 的回环监听器，不暴露 DSH Web GUI 或通用 `/api` 监听器。

## 风险

复制过多 Web API 的 Gateway 会变成未经审计的远程控制面。API allowlist 与设备检查必须作为安全行为审查，不能视为 UI 便利功能。

上游 Web GUI 或 API Proxy 的改动可能改变移动语义。功能映射和基于 fixture 的 contract 测试必须在移动发布前识别此类偏移。

设备配对、凭据轮换和撤销引入了现有 Web GUI 不拥有的状态。第一版必须将该状态保留在桌面应用本地，避免发明云端账号系统。

## Related

- [GUI layering and RPC protocol](../../implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)
- [Browser API trust boundary](../../implemented/architecture/2026-07-28-api-browser-trust-boundary.md)
- [Unary API Remote migration](2026-08-10-unary-apiproxy-remote-migration.md)
- [Current Web application entry](../../../../apps/web/src/main.ts)
- [Current API RPC map](../../../../packages/host/apiproxy/src/api/rpc-map.ts)
