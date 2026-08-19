# Mobile Gateway HTTPS 边缘入口

[English](README.md) | 中文

本目录提供通过未来 VPS 与 Cloudflare 域名仅发布已配对设备移动网关的部署模板。模板**不会由桌面应用安装、启动或加载**。它们不会把本机变成公网服务器，也不会代理桌面 Web GUI 或 DSH 运行时。

## 拓扑

桌面应用继续将 `MobileGateway` 保持在 `127.0.0.1:61297`。VPS 上的专用 SSH 账号接收一条远程监听同样只绑定 loopback 的反向隧道。VPS Caddy 是唯一能访问这个远程监听的进程。Cloudflare 将唯一的 `mobile.<domain>` 主机名代理到 Caddy，使用 Full (strict) TLS 并出示 Authenticated Origin Pull 客户端证书；Caddy 在代理请求前要求该证书。

```text
DeepSeek Harness desktop
  127.0.0.1:61297 Mobile Gateway
      │ outbound SSH reverse tunnel
      ▼
VPS 127.0.0.1:161297
  Caddy HTTPS reverse proxy
      │ Cloudflare Full (strict) + per-hostname AOP mTLS
      ▼
https://mobile.<domain>
      │ bearer device credential on every ordinary Gateway route
      ▼
DeepSeek Harness mobile client
```

二维码载荷包含 `https://mobile.<domain>`、一个有效期五分钟且仅限一次使用的配对秘密，不包含长期设备凭据。已配对到局域网 URL 的手机会在安全存储中保留该地址，启用公开主机名后必须重新配对。

## 文件

| 文件 | 作用 | 执行状态 |
| --- | --- | --- |
| `Caddyfile.vps` | 用于 Cloudflare mTLS 与低延迟 SSE 代理的 VPS 专用 Caddy 站点 | 仅模板 |
| `dsh-mobile-gateway-tunnel.sh` | 带有严格主机密钥和端口检查的桌面端 SSH 反向隧道进程 | 仅模板 |
| `tunnel.env.example` | 隧道进程的非秘密环境变量示例 | 复制到仓库外部 |
| `com.deepseek.dsh-mobile-edge.plist` | 重启桌面端隧道的 macOS launchd 模板 | 仅模板 |

## 生产前置条件

使用带公网 IPv4 或 IPv6 地址、SSH 服务和 Cloudflare 托管域名的 VPS。为隧道创建一个专用非特权账号。该账号的 SSH 守护进程规则只允许远程转发，并将发布的转发地址保持在 VPS loopback。合适的 `sshd_config` 限制在语义上等同于针对该账号设置 `AllowTcpForwarding remote`、`GatewayPorts no`、`PermitTTY no`、`X11Forwarding no` 和 `PermitListen 127.0.0.1:161297`。

将 `mobile.<domain>` 创建为指向 VPS 的 Cloudflare 代理 DNS 记录。为该主机名签发 Cloudflare Origin CA 证书，将其密钥和证书安装到 `/etc/dsh-mobile-edge/certs/`，并使用 Cloudflare **Full (strict)** 模式。为该主机名配置使用 Cloudflare zone 专属证书的 Authenticated Origin Pulls，然后将相应的客户端 CA PEM 安装为 `/etc/dsh-mobile-edge/certs/cloudflare-aop-ca.pem`。Cloudflare 文档说明 Full (strict) 需要有效且匹配的源站证书，按主机名的 AOP 以 mutual TLS 拒绝直接来源站的请求。[1] [2]

> 不要为此网关使用 Cloudflare Quick Tunnel。Cloudflare 文档说明 Quick Tunnel 不支持 Server-Sent Events，而移动网关使用认证 SSE 实现实时同步。[3]

## VPS 配置

运行 Caddy 前，在 VPS 设置以下非秘密服务变量：

```text
MOBILE_EDGE_HOST=mobile.example.com
MOBILE_EDGE_UPSTREAM_PORT=161297
```

复制 `Caddyfile.vps` 和三个证书文件到该文件引用的路径。验证配置后，通过 VPS 服务管理器启动 Caddy。该 Caddy 配置只代理 `127.0.0.1:161297`，添加 `Cache-Control: no-store`，并使用 `flush_interval -1` 保持 SSE 路由低延迟。Caddy 文档说明 event-stream 响应会立即刷新，而负的刷新间隔会禁用响应缓冲。[4]

VPS 防火墙只允许来自管理员管理网络的 SSH，并允许 Cloudflare 源站连接所需的 TCP 443。它不得允许 TCP 161297。Authenticated Origin Pull 验证会拒绝绕过 Cloudflare 的 HTTPS 请求，但防火墙策略仍然是最小化源站可达网络路径的必要条件。[2]

## 桌面配置

将 `tunnel.env.example` 复制为 `~/.config/dsh-mobile-edge/tunnel.env`，替换占位符，并设置文件权限以便只有本地用户可读取。为此隧道生成专用 SSH 密钥；不要复用个人管理员密钥。启用 launchd 模板前，将 VPS 主机密钥记录到用户的 `known_hosts` 文件。

在用户启动上下文中使用以下环境变量启动桌面应用：

```text
DSH_MOBILE_GATEWAY_PORT=61297
DSH_MOBILE_GATEWAY_PUBLIC_URL=https://mobile.example.com
```

第一个变量将已经仅监听 loopback 的 Mobile Gateway 固定到隧道目标。第二个变量将新生成的配对二维码载荷和桌面控制窗口连接记录改为 HTTPS 主机名。它不会改变本地监听器，也不会开放桌面 Web GUI。

替换 `com.deepseek.dsh-mobile-edge.plist` 中的 `__REPOSITORY_ROOT__` 和 `__HOME__`，将文件安装到当前用户的 LaunchAgents 目录，然后通过用户 launch daemon 启用。该模板只启动 SSH 命令；不会启动本地代理、Caddy、Docker 或 Cloudflare connector。

## 验证与回滚

VPS 与桌面隧道运行后，经 Cloudflare 测试 `https://mobile.example.com/v1/health`，并确认对 VPS 源站的直接请求被防火墙或 AOP 拒绝。生成新的桌面配对二维码，配对移动客户端，并验证认证后的 `/v1/events` 连接收到 ready 帧和 30 秒心跳。重启桌面应用，短暂中断隧道，并确认移动客户端通过既有 SSE 恢复逻辑重新连接并收敛。

要回滚，先从桌面环境移除公开主机名，禁用用户 launch daemon，停止 VPS Caddy，并撤销专用 SSH 密钥。如果 VPS 或隧道密钥可能已经泄露，请从桌面控制窗口撤销已配对设备。原始 loopback 监听在整个回滚过程中始终可供桌面应用使用。

## 本机约束

仓库目前仅包含这些模板。本地 Mac 上没有安装或启动 Caddy 软件包、TLS 证书、launch daemon、端口转发规则或反向代理。在用户明确授权使用真实 VPS 与域名部署前，本机不会被视为公网 VPS。

## References

[1] [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)

[2] [Cloudflare per-hostname Authenticated Origin Pulls](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/set-up/per-hostname/)

[3] [Cloudflare Tunnel setup and Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/setup/)

[4] [Caddy reverse proxy streaming](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
