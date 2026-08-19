# Mobile Gateway HTTPS Edge

English | [中文](README.zh.md)

This directory contains deployment templates for publishing only the paired-device Mobile Gateway through a future VPS and Cloudflare hostname. The templates are **not installed, launched, or loaded by the desktop application**. They do not make the local computer a public server, and they do not proxy the desktop Web GUI or the DSH runtime.

## Topology

The desktop application keeps `MobileGateway` on `127.0.0.1:61297`. A dedicated SSH account on the VPS receives a reverse tunnel whose remote listener is also loopback-only. Caddy on the VPS is the only process that reaches that remote listener. Cloudflare proxies the single `mobile.<domain>` hostname to Caddy over Full (strict) TLS and presents an Authenticated Origin Pull client certificate; Caddy requires that certificate before proxying a request.

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

The QR payload contains `https://mobile.<domain>`, a five-minute single-use pairing secret, and no durable device credential. Existing phones that were paired to a LAN URL retain that address in secure storage and must pair again after the public hostname is enabled.

## Files

| File | Role | Execution status |
| --- | --- | --- |
| `Caddyfile.vps` | VPS-only Caddy site for Cloudflare mTLS and low-latency SSE proxying | Template only |
| `dsh-mobile-gateway-tunnel.sh` | Desktop-side SSH reverse tunnel process with strict host-key and port checks | Template only |
| `tunnel.env.example` | Non-secret environment-variable example for the tunnel process | Copy outside the repository |
| `com.deepseek.dsh-mobile-edge.plist` | macOS launchd template that restarts the desktop-side tunnel | Template only |

## Production prerequisites

Use a VPS with a public IPv4 or IPv6 address, an SSH service, and a Cloudflare-managed domain. Create one dedicated unprivileged account for the tunnel. Its SSH daemon rules must permit only remote forwarding and keep the published forwarding address on VPS loopback. A suitable `sshd_config` restriction is conceptually equivalent to `AllowTcpForwarding remote`, `GatewayPorts no`, `PermitTTY no`, `X11Forwarding no`, and `PermitListen 127.0.0.1:161297` for that account.

Create `mobile.<domain>` as a proxied Cloudflare DNS record pointing to the VPS. Issue a Cloudflare Origin CA certificate for this hostname, install its key and certificate in `/etc/dsh-mobile-edge/certs/`, and use Cloudflare **Full (strict)** mode. Configure per-hostname Authenticated Origin Pulls with a certificate exclusive to the Cloudflare zone, then install the corresponding client-CA PEM as `/etc/dsh-mobile-edge/certs/cloudflare-aop-ca.pem`. Cloudflare documents that Full (strict) requires a valid matching origin certificate and that per-hostname AOP uses mutual TLS to reject direct origin requests.[1] [2]

> Do not use a Cloudflare Quick Tunnel for this gateway. Cloudflare documents that Quick Tunnels do not support Server-Sent Events, while the Mobile Gateway uses authenticated SSE for real-time synchronization.[3]

## VPS configuration

Set these non-secret service variables on the VPS before running Caddy:

```text
MOBILE_EDGE_HOST=mobile.example.com
MOBILE_EDGE_UPSTREAM_PORT=161297
```

Copy `Caddyfile.vps` and the three certificate files to the paths referenced by that file. Start Caddy through the VPS service manager after validating the configuration. The Caddy configuration proxies only `127.0.0.1:161297`, adds `Cache-Control: no-store`, and uses `flush_interval -1` so the SSE route remains low latency. Caddy documents that event-stream responses are flushed immediately and that negative flush intervals disable response buffering.[4]

The VPS firewall permits SSH only from the administrator's management network and permits TCP 443 for the Cloudflare origin connection. It must not permit TCP 161297. Authenticated Origin Pull validation rejects HTTPS requests that bypass Cloudflare, but firewall policy remains necessary to minimize the origin's reachable network paths.[2]

## Desktop configuration

Copy `tunnel.env.example` to `~/.config/dsh-mobile-edge/tunnel.env`, replace the placeholders, and set the file mode so only the local user can read it. Generate a dedicated SSH key for this tunnel; do not reuse a personal administrator key. Record the VPS host key in the user's `known_hosts` file before enabling the launchd template.

Launch the desktop application with these environment variables in its user launch context:

```text
DSH_MOBILE_GATEWAY_PORT=61297
DSH_MOBILE_GATEWAY_PUBLIC_URL=https://mobile.example.com
```

The first variable pins the already loopback-only Mobile Gateway to the tunnel target. The second variable changes newly generated pairing QR payloads and the desktop control-window connection record to the HTTPS hostname. It does not change the local listener or expose the desktop Web GUI.

Replace `__REPOSITORY_ROOT__` and `__HOME__` in `com.deepseek.dsh-mobile-edge.plist`, install the file in the current user's LaunchAgents directory, then enable it with the user launch daemon. The template starts only the SSH command; it does not start a local proxy, Caddy, Docker, or a Cloudflare connector.

## Verification and rollback

After the VPS and desktop tunnel are running, test `https://mobile.example.com/v1/health` through Cloudflare and confirm that a direct request to the VPS origin is rejected by the firewall or AOP. Generate a fresh desktop pairing QR code, pair the mobile client, and verify an authenticated `/v1/events` connection receives the ready frame and 30-second heartbeat. Restart the desktop application, disconnect the tunnel briefly, and confirm the mobile client reconnects and converges through its existing SSE recovery logic.

To roll back, first remove the public hostname from the desktop environment, disable the user launch daemon, stop Caddy on the VPS, and revoke the dedicated SSH key. Revoke paired devices from the desktop control window if the VPS or tunnel key may have been exposed. The original loopback listener stays available to the desktop application throughout this rollback.

## Local-machine constraint

This repository currently carries only these templates. No Caddy package, TLS certificate, launch daemon, port forwarding rule, or reverse proxy is installed or started on the local Mac. The local machine is not treated as a public VPS until the user explicitly authorizes a deployment with a real VPS and domain.

## References

[1] [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)

[2] [Cloudflare per-hostname Authenticated Origin Pulls](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/set-up/per-hostname/)

[3] [Cloudflare Tunnel setup and Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/setup/)

[4] [Caddy reverse proxy streaming](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
