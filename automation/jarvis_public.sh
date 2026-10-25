#!/usr/bin/env bash
# Put the JARVIS dashboard on the public internet — by your own tunnel, not by
# uploading your data anywhere.
#
#   bash automation/jarvis_public.sh              # auto-detect a tunnel tool
#   bash automation/jarvis_public.sh --tool cloudflared
#   bash automation/jarvis_public.sh --check      # show what is available
#
# Supported (first one installed wins):
#   cloudflared  quick tunnel -> https://<random>.trycloudflare.com   (free, no account)
#   tailscale    tailscale funnel 443 -> local dashboard              (needs tailnet + funnel)
#   ngrok        ngrok http 8787                                      (free account)
#
# The server stays on 127.0.0.1; only the tunnel is public. Every /api call still
# needs the bearer token, and repeated failures from one IP are blocked for 5 min.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${JARVIS_PORT:-8787}"
HOST="${JARVIS_HOST:-127.0.0.1}"
JARVIS_HOME="${JARVIS_HOME:-$HOME/.openjarvis}"
TOOL=""
CHECK_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --tool) shift; TOOL="${1:-}" ;;
    --port) shift; PORT="${1:-8787}" ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

have() { command -v "$1" >/dev/null 2>&1; }

find_tool() {
  if [ -n "$TOOL" ]; then
    have "$TOOL" && { echo "$TOOL"; return 0; }
    return 1
  fi
  for candidate in cloudflared tailscale ngrok; do
    if have "$candidate"; then echo "$candidate"; return 0; fi
  done
  return 1
}

token_url() {
  local token host_display
  token="$(cat "$JARVIS_HOME/dashboard.token" 2>/dev/null || true)"
  host_display="$HOST"
  [ "$host_display" = "0.0.0.0" ] && host_display="127.0.0.1"
  echo "http://$host_display:$PORT/${token:+?token=$token}"
}

install_hint() {
  cat <<'TXT'
Koi tunnel tool nahi mila. Ye ek chuno (Debian proot ke andar):

  # 1) cloudflared — free, account nahi chahiye (recommended)
  curl -L -o /usr/local/bin/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
  chmod +x /usr/local/bin/cloudflared

  # 2) tailscale — tailnet + funnel chahiye
  curl -fsSL https://tailscale.com/install.sh | sh
  tailscale up

  # 3) ngrok — free account + authtoken
  #    https://dashboard.ngrok.com/get-started/setup

Termux ke bina proot (direct Android) men cloudflared binary glibc maangta hai;
isliye proot Debian ke andar chalana aasan hai.
TXT
}

selected="$(find_tool)" || selected=""
if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "root : $ROOT"
  echo "home : $JARVIS_HOME"
  echo "bind : $HOST:$PORT"
  for candidate in cloudflared tailscale ngrok; do
    if have "$candidate"; then echo "found: $candidate ($(command -v "$candidate"))"; else echo "missing: $candidate"; fi
  done
  exit 0
fi

if [ -z "$selected" ]; then
  install_hint
  exit 1
fi

if ! have curl; then
  echo "curl chahiye health check ke liye: pkg install curl" >&2
  exit 1
fi

health="$(curl -fsS --max-time 4 "$(token_url)" 2>/dev/null | head -c 200 || true)"
if [ -z "$health" ]; then
  echo "JARVIS server $HOST:$PORT par jawab nahi de raha." >&2
  echo "Pehle: bash automation/jarvis_start.sh --bg" >&2
  exit 1
fi

# Tunnel se pehle token check — public URL par bina token kuch nahi khulega.
echo "local dashboard OK: http://$HOST:$PORT/"
echo "token file        : $JARVIS_HOME/dashboard.token"
echo
echo "Starting public tunnel with $selected …"
echo "Public URL milega (https://…); uske aage ?token=<dashboard.token> lagao."
echo "Ctrl+C se tunnel band, server chalta rahega."
echo

case "$selected" in
  cloudflared)
    exec cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate
    ;;
  tailscale)
    if tailscale funnel status >/dev/null 2>&1; then
      echo "Funnel already configured; use the existing https URL and add ?token=…"
      exec tailscale funnel --bg "$PORT"
    fi
    exec tailscale funnel "$PORT"
    ;;
  ngrok)
    exec ngrok http "$PORT"
    ;;
esac
