# Agent Note: Mobile Gateway VPS HTTPS 边缘入口

Status: proposed

[English](2026-08-19-mobile-gateway-vps-edge.md) | 中文

## Problem

原生客户端可以与桌面拥有的 Mobile Gateway 配对和同步，但 loopback 监听器无法被桌面本地网络之外的手机访问。将 Gateway、桌面 Web GUI 或 DSH 运行时直接绑定到 LAN 或公网接口，会暴露移动映射不应提供的本地桌面能力。

## Proposal

未来 VPS 为 `mobile.<domain>` 承载一个 HTTPS 反向代理。该代理仅接受具有 Full (strict) 源站 TLS 与按主机名 Authenticated Origin Pull mutual TLS 的 Cloudflare 代理请求。其唯一上游是专用桌面到 VPS SSH 反向隧道创建的 VPS loopback 端口。桌面 Mobile Gateway 继续绑定 `127.0.0.1:61297`；桌面 Web GUI 和 DSH 运行时永远不是代理目标。

桌面使用专用非特权 VPS 账号、专用 SSH 密钥、严格主机密钥校验和 `ExitOnForwardFailure` 启动隧道。反向转发地址明确为 `127.0.0.1:<remote-port>`，因此无法从 VPS 公网接口访问。VPS SSH 账号只允许这一远程转发，不允许 shell、TTY、X11 或公开转发行为。

仅在 VPS 边缘入口通过验证后，桌面环境才将 `DSH_MOBILE_GATEWAY_PUBLIC_URL` 设为 HTTPS 主机名。新配对二维码载荷随后使用该公开 URL，同时保持 [Mobile one-time QR pairing](../../implemented/architecture/2026-08-19-mobile-one-time-qr-pairing.md) 中五分钟单次秘密兑换。已有移动凭据会保留原有网关 URL，并在主机名变更后需要重新配对。

仓库在 [`scripts/mobile-gateway-edge/`](../../../../scripts/mobile-gateway-edge/README.md) 下保存不执行的 Caddy、SSH 隧道、环境变量和 launchd 模板。当前本地 Mac 未因本工作安装 Caddy 服务、TLS 证书、launch daemon、端口转发或代理。部署仍受限于用户提供真实 VPS 和 Cloudflare 托管域名。

## Alternatives considered

**将 Mobile Gateway 直接绑定到 LAN 或公网接口。** 这可以避免 VPS，但会让桌面本地 HTTP 服务直接可达，并迫使 Electron 应用承担 TLS、防火墙和网络地址处理。它被拒绝，因为 Gateway 现有的仅 loopback 监听不变量是更安全的产品边界。

**从桌面使用 Cloudflare Quick Tunnel。** 它无需 VPS 即可创建临时主机名，但 Cloudflare 文档说明 Quick Tunnel 不支持 Server-Sent Events。它被拒绝，因为移动客户端依赖认证 SSE 实现低延迟同步。

**使用私有 Tailscale HTTPS 服务。** 它保持上游仅 loopback，且不需要公开主机名，但需要安装第二个移动应用并共享 tailnet。它仍是可行的私有部署选项，但用户为未来部署选择了 VPS 和 Cloudflare 主机名路径。

**直接在桌面使用 Cloudflare 托管隧道。** 它移除了 VPS 反向隧道，但会将 Cloudflare connector 和托管隧道凭据加入桌面。VPS 设计保留用户可控的中继和一台独立管理的边缘主机。

## Acceptance criteria

未来部署只向原生客户端呈现 `https://mobile.<domain>`。Caddy 只代理 VPS loopback 隧道端口，且没有路由能到达桌面 Web GUI 或 DSH 运行时。Cloudflare Full (strict)、按主机名 AOP、防火墙规则和直接源站探测会拒绝非 Cloudflare HTTPS 请求。认证后的移动 `/v1/events` 连接通过边缘入口接收 Gateway ready 帧与心跳，并在桌面或隧道中断后重新连接。

## Risks

VPS、Cloudflare 证书材料和 SSH 密钥会成为安全敏感的运维依赖。错误配置 AOP、防火墙、证书名称、DNS 代理或隧道转发可能阻止配对或断开 SSE。网关主机名更新要求已有手机重新配对。在真实 VPS 和域名可用前，这些模板不提供跨网络连接，也不得被表述为已部署服务。
