---
description: "面向维护者的仅回环移动网关说明，用于将一个原生移动客户端与运行中的桌面 DeepSeek Harness 运行时配对。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mobile-gateway

[English](README.md) | 中文

## 概述

一个仅监听回环地址的适配器，用于连接一个桌面 DeepSeek Harness 运行时和已配对的原生移动客户端。`MobileGateway` 将选定的会话、工作区、历史、提示提交、任务、审批和交互操作投影为移动 API。它返回桌面端拥有的工作区成员关系和归档会话标识，使原生抽屉保持桌面会话树；它还投影用户可见历史，而不暴露内部智能体协议流量。

## 目录

- [使用本包](#use-this-package)
- [实时会话投影](#real-time-session-projection)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

运行 `pnpm --filter @deepseek-ai/dsh-mobile-gateway bundle` 会生成 `lib/index.mjs` 和 `lib/index.d.mts`。桌面打包流程将该构建后的包复制到桌面运行时；`scripts/mobile-gateway-runtime-payload/` 下的文件是归档快照，不是运行时入口。

<a id="real-time-session-projection"></a>
## 实时会话投影

`POST /v1/sessions/running` 只返回运行中桌面会话的 ID。已配对客户端通过 `POST /v1/sessions/:sessionId/subscriptions` 创建连接拥有的会话租约，再通过 `POST /v1/subscriptions/:subscriptionId/activate` 激活。租约创建会立即返回 durable 序号水位线、切换事件 ID、激活令牌和 Gateway 拥有的 transient 快照；它不会等待会话 history。

激活期间 Gateway 会验证水位线和令牌，重放缓冲中比水位线更新的 durable 事件，并切换为通过现有认证 `GET /v1/events` SSE 连接实时投递。durable history 仍通过 DSH HTTP 读取。有限缓冲溢出时，移动客户端必须重新读取权威 history，而不会接受静默的事件缺口。

<a id="model-experience"></a>
## 模型体验

### 提示转发与历史投影

#### 模型可见内容

`MobileGateway` 将允许的用户提示转发给现有桌面运行时；它不创建第二条提示、模型选择或提供方调用路径。

#### Token 影响

网关层无影响；token 统计和提示构建仍由桌面运行时拥有。

#### KV 缓存影响

网关层无影响；网关不会重排或重写模型上下文。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **网关限定于本地运行时** —— 它服务于启动它的桌面运行时，不提供云端会话复制或第二个智能体运行时。
- **移动 API 是允许列表** —— 任意文件系统访问、凭据、不受限制的设置修改和原始终端流等桌面本地能力不属于该适配器。
- **运行时载荷替换是受控的打包操作** —— 桌面分发必须使用新构建的 `lib/index.mjs`，而不能使用归档快照。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
