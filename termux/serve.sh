#!/usr/bin/env bash
# ============================================================
# FF MAX UNIVERSE — Termux local web server
# Serves ./freefiremax on your phone + your Wi-Fi LAN.
#
# Usage:
#   bash termux/serve.sh                # foreground, port 8080
#   bash termux/serve.sh --port 9000    # custom port
#   bash termux/serve.sh --bg           # run in background
#   bash termux/serve.sh status         # is it running?
#   bash termux/serve.sh stop           # stop background server
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SITE_DIR="$ROOT/freefiremax"
PIDFILE="${TMPDIR:-/tmp}/ffmax-server.pid"
LOGFILE="${TMPDIR:-/tmp}/ffmax-server.log"

PORT="${FFMAX_PORT:-8080}"
BACKGROUND=0
ACTION="start"

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-8080}"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    --bg|--background) BACKGROUND=1; shift ;;
    status|stop|start) ACTION="$1"; shift ;;
    -h|--help)
      sed -n '3,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
die()  { printf 'Error: %s\n' "$*" >&2; exit 1; }

# ---------- dependency checks ----------
command -v python3 >/dev/null 2>&1 || die "python3 missing. Run: pkg install python"
[ -d "$SITE_DIR" ] || die "Site folder not found: $SITE_DIR"

# ---------- helpers ----------
running_pid() {
  [ -f "$PIDFILE" ] || return 1
  local pid; pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null && { echo "$pid"; return 0; }
  return 1
}

port_busy() {
  # /dev/tcp works in bash; probe localhost on the requested port
  (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1 && { exec 3>&- 2>/dev/null; return 0; }
  return 1
}

lan_ip() {
  local ip=""
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 addr show 2>/dev/null | awk '/inet / && $2 !~ /^127\./ {sub(/\/.*/,"",$2); print $2; exit}')"
  fi
  if [ -z "$ip" ] && command -v ifconfig >/dev/null 2>&1; then
    ip="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')"
  fi
  printf '%s' "${ip:-}"
}

print_urls() {
  local port="$1" ip; ip="$(lan_ip)"
  say ""
  say "  ┌───────────────────────────────────────────────"
  say "  │  FF MAX UNIVERSE is live"
  say "  ├───────────────────────────────────────────────"
  say "  │  This device : http://localhost:${port}"
  [ -n "$ip" ] && say "  │  Wi-Fi / LAN : http://${ip}:${port}"
  say "  │  Folder      : freefiremax/"
  [ "$BACKGROUND" = "1" ] && say "  │  Log         : $LOGFILE"
  say "  └───────────────────────────────────────────────"
  say ""
  say "  Stop: bash termux/serve.sh stop"
  say "  Note: same Wi-Fi pe kisi bhi phone/laptop se LAN URL khul jayega."
  say ""
}

# ---------- actions ----------
case "$ACTION" in
  status)
    if pid="$(running_pid)"; then
      say "Running (PID $pid). Log: $LOGFILE"
      exit 0
    fi
    say "Not running."
    exit 1
    ;;
  stop)
    if pid="$(running_pid)"; then
      kill "$pid" 2>/dev/null
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
      rm -f "$PIDFILE"
      say "Server stopped (PID $pid)."
    else
      rm -f "$PIDFILE"
      say "Nothing to stop."
    fi
    command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock 2>/dev/null
    exit 0
    ;;
esac

# ---------- start ----------
if pid="$(running_pid)"; then
  say "Already running (PID $pid)."
  print_urls "$PORT"
  exit 0
fi

# find a free port (try 10 in a row)
original_port="$PORT"
for _ in $(seq 1 10); do
  if ! port_busy "$PORT"; then break; fi
  say "Port $PORT busy, trying $((PORT + 1))…"
  PORT=$((PORT + 1))
done
port_busy "$PORT" && die "No free port found near $original_port."
[ "$PORT" != "$original_port" ] && say "Using free port $PORT instead of $original_port."

# keep the CPU awake on Android so the server survives a locked screen
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock 2>/dev/null

SERVER_CMD=(python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$SITE_DIR")

if [ "$BACKGROUND" = "1" ]; then
  nohup "${SERVER_CMD[@]}" >>"$LOGFILE" 2>&1 &
  echo $! >"$PIDFILE"
  sleep 1
  if ! running_pid >/dev/null; then
    say "--- log ---"; tail -n 20 "$LOGFILE" 2>/dev/null
    die "Server failed to start."
  fi
  print_urls "$PORT"
  exit 0
fi

# foreground: cleanup pid/wakelock on exit
cleanup() {
  rm -f "$PIDFILE"
  command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock 2>/dev/null
  say ""
  say "Server stopped."
}
trap cleanup EXIT INT TERM
echo $$ >"$PIDFILE"
print_urls "$PORT"
say "Press Ctrl+C to stop."
say ""
exec "${SERVER_CMD[@]}"
