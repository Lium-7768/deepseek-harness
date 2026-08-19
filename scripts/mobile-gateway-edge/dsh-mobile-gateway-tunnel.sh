#!/bin/sh
set -eu

config_path="${DSH_MOBILE_EDGE_TUNNEL_ENV:-$HOME/.config/dsh-mobile-edge/tunnel.env}"
if [ ! -r "$config_path" ]; then
  printf '%s\n' "dsh-mobile-edge: missing tunnel configuration at $config_path" >&2
  exit 64
fi

# shellcheck disable=SC1090
. "$config_path"

require_value() {
  value="$1"
  name="$2"
  if [ -z "$value" ]; then
    printf '%s\n' "dsh-mobile-edge: $name is required" >&2
    exit 64
  fi
}

require_port() {
  value="$1"
  name="$2"
  case "$value" in
    ''|*[!0-9]*) printf '%s\n' "dsh-mobile-edge: $name must be a TCP port" >&2; exit 64 ;;
  esac
  if [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then
    printf '%s\n' "dsh-mobile-edge: $name must be between 1 and 65535" >&2
    exit 64
  fi
}

require_value "${DSH_MOBILE_EDGE_VPS_HOST:-}" DSH_MOBILE_EDGE_VPS_HOST
require_value "${DSH_MOBILE_EDGE_VPS_USER:-}" DSH_MOBILE_EDGE_VPS_USER
require_value "${DSH_MOBILE_EDGE_SSH_KEY:-}" DSH_MOBILE_EDGE_SSH_KEY
require_port "${DSH_MOBILE_EDGE_REMOTE_PORT:-}" DSH_MOBILE_EDGE_REMOTE_PORT
require_port "${DSH_MOBILE_GATEWAY_PORT:-}" DSH_MOBILE_GATEWAY_PORT

case "$DSH_MOBILE_EDGE_VPS_HOST" in
  -*|*[!A-Za-z0-9.-]*)
    printf '%s\n' 'dsh-mobile-edge: DSH_MOBILE_EDGE_VPS_HOST must be a host name or IP address' >&2
    exit 64
    ;;
esac

if [ ! -r "$DSH_MOBILE_EDGE_SSH_KEY" ]; then
  printf '%s\n' "dsh-mobile-edge: SSH key is unreadable: $DSH_MOBILE_EDGE_SSH_KEY" >&2
  exit 66
fi

exec /usr/bin/ssh \
  -N \
  -i "$DSH_MOBILE_EDGE_SSH_KEY" \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o IdentitiesOnly=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o StrictHostKeyChecking=yes \
  -R "127.0.0.1:${DSH_MOBILE_EDGE_REMOTE_PORT}:127.0.0.1:${DSH_MOBILE_GATEWAY_PORT}" \
  "${DSH_MOBILE_EDGE_VPS_USER}@${DSH_MOBILE_EDGE_VPS_HOST}"
