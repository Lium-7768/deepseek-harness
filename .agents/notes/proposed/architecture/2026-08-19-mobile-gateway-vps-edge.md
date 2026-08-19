# Agent Note: Mobile Gateway VPS HTTPS edge

Status: proposed

English | [中文](2026-08-19-mobile-gateway-vps-edge.zh.md)

## Problem

The native client can pair and synchronize with a desktop-owned Mobile Gateway, but a loopback listener cannot be reached from a phone outside the desktop's local network. Directly binding the Gateway, the desktop Web GUI, or the DSH runtime to a LAN or public interface would expose local desktop capabilities that the mobile mapping must not provide.

## Proposal

A future VPS hosts one HTTPS reverse proxy for `mobile.<domain>`. The proxy accepts only Cloudflare-proxied requests with Full (strict) origin TLS and per-hostname Authenticated Origin Pull mutual TLS. Its only upstream is a VPS loopback port created by a dedicated desktop-to-VPS SSH reverse tunnel. The desktop Mobile Gateway remains bound to `127.0.0.1:61297`; the desktop Web GUI and DSH runtime are never proxy targets.

The desktop starts the tunnel with a dedicated unprivileged VPS account, a dedicated SSH key, strict host-key verification, and `ExitOnForwardFailure`. The reverse forwarding address is explicitly `127.0.0.1:<remote-port>`, so it is unavailable on the VPS public interface. The VPS SSH account permits only this remote forwarding and no shell, TTY, X11, or public forwarding behavior.

The desktop environment sets `DSH_MOBILE_GATEWAY_PUBLIC_URL` to the HTTPS hostname only after the VPS edge is verified. New pairing QR payloads then use that public URL while preserving the five-minute one-time secret exchange from [Mobile one-time QR pairing](../../implemented/architecture/2026-08-19-mobile-one-time-qr-pairing.md). Existing mobile credentials retain their former gateway URL and require fresh pairing after the hostname changes.

The repository contains non-executing Caddy, SSH-tunnel, environment, and launchd templates under [`scripts/mobile-gateway-edge/`](../../../../scripts/mobile-gateway-edge/README.md). The current local Mac has no Caddy service, TLS certificate, launch daemon, port forwarding, or proxy installed by this work. Deployment remains blocked until the user supplies a real VPS and Cloudflare-managed domain.

## Alternatives considered

**Bind the Mobile Gateway directly to a LAN or public interface.** This would avoid a VPS but makes a desktop-local HTTP service directly reachable and forces TLS, firewall, and network-address handling into the Electron application. It is rejected because the Gateway's existing loopback-only invariant is the safer product boundary.

**Use Cloudflare Quick Tunnel from the desktop.** It would create a temporary hostname without a VPS, but Cloudflare documents that Quick Tunnels do not support Server-Sent Events. It is rejected because the mobile client relies on authenticated SSE for low-latency synchronization.

**Use a private Tailscale HTTPS service.** It keeps the upstream loopback-only and avoids a public hostname, but it requires a second mobile application and a shared tailnet. It remains a viable private deployment option, but the user selected a VPS and Cloudflare hostname path for the future deployment.

**Use a Cloudflare managed tunnel directly on the desktop.** It eliminates the VPS reverse tunnel but adds a Cloudflare connector and hosted tunnel credentials to the desktop. The VPS design retains a user-controlled relay and one independently managed edge host.

## Acceptance criteria

The future deployment presents only `https://mobile.<domain>` to the native client. Caddy proxies only the VPS loopback tunnel port, and no route reaches the desktop Web GUI or DSH runtime. Cloudflare Full (strict), per-hostname AOP, firewall rules, and a direct-origin probe reject a non-Cloudflare HTTPS request. An authenticated mobile `/v1/events` connection receives the Gateway ready frame and heartbeat through the edge, then reconnects after a desktop or tunnel interruption.

## Risks

The VPS, Cloudflare certificate material, and SSH key become security-sensitive operational dependencies. Misconfigured AOP, firewall, certificate names, DNS proxying, or tunnel forwarding can prevent pairing or disconnect SSE. A gateway hostname update requires existing phones to re-pair. Until a real VPS and domain are available, the templates provide no cross-network connectivity and must not be represented as a deployed service.
