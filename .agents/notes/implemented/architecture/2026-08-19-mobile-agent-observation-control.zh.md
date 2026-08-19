# Agent Note: 移动端 Agent 观察与受限控制

Status: implemented

中文 | [English](2026-08-19-mobile-agent-observation-control.md)

## Problem

原生客户端已经能够渲染持久化会话并响应通用审批，但没有展示桌面 Web 应用当前的 Goal、计划审阅呈现、后台作业或直接子 Agent 目录。因此，手机用户可能看不到桌面在会话上方和旁侧呈现的执行上下文，尽管桌面运行时仍是所有 Agent 状态的唯一所有者。

## Decision

Mobile Gateway 继续作为既有 DSH API 之上的窄 loopback 适配器。Goal 状态不会通过新 API 获取，也不会存入移动状态库：原生会话页从既有会话历史投影读取 `goal` 值。它只渲染 active、paused 和 blocked Goal，遵循桌面 GoalBar 的可见性规则，并携带投影得到的 `{ id, revision }` 比较并交换引用，只转发桌面已有的 `goal.edit`、`goal.pause`、`goal.resume` 和 `goal.clear` 修改操作。

Gateway 在内存中保留权威瞬态 `session/jobs` mux 快照，并通过已认证的 `POST /v1/sessions/:sessionId/jobs` 路由只读暴露。原生客户端呈现与 Web 对等的作业元数据——类型、标签、详情或状态以及活动状态——但不会凭空新增 Web 作业列表未提供的停止操作。

直接子会话通过既有 `subagent.list` RPC 列出，通过 `subagent.history` 读取，并在原生子会话路由中打开。可继续子会话只能经由其父会话权限使用 `subagent.prompt` 接收移动端内容，并可接收 `subagent.interrupt`；一次性子会话保持只读。中断确认保留桌面 API 语义：它确认取消请求被接纳，而不代表子会话已立即静止。

原生交互页面只有在待处理批次为一个单选问题、`intent.kind` 等于 `plan-review`、包含 Markdown `detail`、包含声明的批准标签且至多还有一个其他选项时，才识别其为计划审阅。它呈现与桌面对等的批准、拒绝和讨论操作。讨论只对这个已收窄形式转发既有的取消交互响应；通用问题保留完整表单渲染并要求结构化回答。

## Synchronization and authorization

所有新路由都要求既有配对设备凭据。它们只通过 Gateway 已验证的 loopback 客户端调用桌面 DSH API；Gateway 不暴露任意 RPC 选择器、桌面 Web 路由、文件、凭据、Shell 访问或移动 Agent Loop。

既有认证 SSE 流把 `session/jobs` 快照直接写入 React Query，并在持久化 `goal/*` 事件后使历史失效，从桌面权威源重新加载投影。Gateway 就绪时会与既有会话缓存一起使作业和子 Agent 查询失效。不会引入高频轮询或执行状态的持久化移动副本。

## Alternatives considered

**构建移动专用 Agent 状态库。** 第二套状态库必须处理与桌面运行时的排序、恢复和所有权冲突。历史投影、mux 快照、既有 DSH RPC 方法和现有 SSE 桥已经提供所需的桌面权威数据路径。

**暴露通用 DSH RPC 转发端点。** 这会让已配对手机触达文件系统、凭据、插件或主机操作等桌面专属能力。显式 Gateway 路径将移动表面限制在本阶段选择的同等 Goal、计划审阅、作业和子 Agent 能力。

**将每个待处理问题都视为计划审阅。** 紧凑的批准/拒绝卡片不能表达多问题、多选或多于二选项的请求。结构收窄保留通用问题可用的每一种答案，并将取消语义限制在桌面定义的计划审阅意图。

**让一次性子 Agent 可写。** 一次性子会话没有验证人工消息交付所需的直接父会话续接契约。保持其只读可以维护桌面执行所有权，并避免假装历史子会话可以恢复。

## Verification

Mobile Gateway 集成套件覆盖已认证的作业投影、Goal CAS 暂停校验和转发、子 Agent 列表/历史/消息/中断转发、一次性子 Agent 中断拒绝，以及仅在结构验证后允许计划审阅讨论取消。移动 API 测试覆盖所有版本化 Goal、作业和子 Agent 路径及请求体。Gateway 与原生应用的严格 TypeScript 检查通过，Gateway 包也已成功构建。

iPhone 17 Pro iOS 26.0 模拟器 Debug 构建在重新安装当前应用包后，通过配置的 8090 Metro 端点启动。模拟器中的已连接工作区视图加载成功，没有 JavaScript 或原生启动异常。此烟雾运行可用的桌面会话不包含活动 Goal、作业或子 Agent，因此填充真实数据后的视觉确认仍需要未来一次实时 Agent 执行。

## Consequences

已配对手机现在能够观察桌面用于 Goal、作业、计划审阅和直接子会话的执行上下文，并可通过桌面权限执行同样受限的 Goal 与可继续子会话动作。这扩展了 Mobile Gateway allowlist 和原生路由，但刻意不添加移动端工作流创作、任意作业取消、子会话创建、桌面主机控制、独立 Agent 执行，或取代桌面持久化会话模型。
