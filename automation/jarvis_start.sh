#!/usr/bin/env bash
# JARVIS launcher for Termux + Debian (proot) — no systemd, no docker, no root.
#
#   bash automation/jarvis_start.sh              # foreground dashboard
#   bash automation/jarvis_start.sh --bg         # background + pidfile
#   bash automation/jarvis_start.sh stop         # stop the background one
#   bash automation/jarvis_start.sh status       # is it alive?
#   bash automation/jarvis_start.sh doctor       # self diagnostics
#
# Options: --lan (bind 0.0.0.0 so the phone browser can reach it),
#          --port N, --host H
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-python3}"
JARVIS_HOME="${JARVIS_HOME:-$HOME/.openjarvis}"
LOG_DIR="$JARVIS_HOME/logs"
PIDFILE="$JARVIS_HOME/jarvis.pid"
LOG="$LOG_DIR/server.log"
PORT="${JARVIS_PORT:-8787}"
HOST="${JARVIS_HOST:-127.0.0.1}"

COMMAND="serve"
BG=0

while [ $# -gt 0 ]; do
  case "$1" in
    serve|start) COMMAND="serve" ;;
    doctor|stop|status|logs) COMMAND="$1" ;;
    --bg|--background) BG=1 ;;
    --lan) HOST="0.0.0.0" ;;
    --port) shift; PORT="${1:-8787}" ;;
    --host) shift; HOST="${1:-127.0.0.1}" ;;
    -h|--help)
      sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

mkdir -p "$LOG_DIR" || { echo "cannot create $LOG_DIR" >&2; exit 1; }

port_open() {
  "$PYTHON" - "$HOST" "$PORT" <<'PY' 2>/dev/null
import socket, sys
host, port = sys.argv[1], int(sys.argv[2])
if host == "0.0.0.0":
    host = "127.0.0.1"
try:
    with socket.create_connection((host, port), timeout=0.4):
        raise SystemExit(0)
except OSError:
    raise SystemExit(1)
PY
}

running_pid() {
  [ -f "$PIDFILE" ] || return 1
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && { echo "$pid"; return 0; }
  return 1
}

public_url() {
  display_host="$HOST"
  if [ "$HOST" = "0.0.0.0" ]; then
    display_host="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [ -n "$display_host" ] || display_host="<phone-ip>"
  fi
  token="$(cat "$JARVIS_HOME/dashboard.token" 2>/dev/null || true)"
  echo "http://$display_host:$PORT/${token:+?token=$token}"
}

case "$COMMAND" in
  doctor)
    cd "$ROOT" || exit 1
    exec "$PYTHON" run_jarvis.py doctor
    ;;

  status)
    if pid="$(running_pid)"; then
      echo "JARVIS running (pid $pid) on $HOST:$PORT"
      echo "open: $(public_url)"
      exit 0
    fi
    if port_open; then
      echo "port $PORT is in use but no pidfile — maybe another process"
      exit 1
    fi
    echo "JARVIS is not running"
    exit 1
    ;;

  stop)
    if pid="$(running_pid)"; then
      kill "$pid" 2>/dev/null
      for _ in $(seq 1 30); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
      kill -9 "$pid" 2>/dev/null || true
      rm -f "$PIDFILE"
      echo "stopped (pid $pid)"
      exit 0
    fi
    echo "nothing to stop"
    exit 0
    ;;

  logs)
    exec tail -n 60 -f "$LOG"
    ;;

  serve)
    cd "$ROOT" || exit 1
    if port_open; then
      echo "port $PORT already has a listener — use 'status' or another --port" >&2
      exit 1
    fi
    export JARVIS_HOME
    ARGS=(run_jarvis.py serve --host "$HOST" --port "$PORT")
    if [ "$BG" -eq 1 ]; then
      nohup "$PYTHON" -u "${ARGS[@]}" >>"$LOG" 2>&1 &
      pid=$!
      echo "$pid" >"$PIDFILE"
      for _ in $(seq 1 60); do
        port_open && break
        kill -0 "$pid" 2>/dev/null || { echo "server died, see $LOG" >&2; exit 1; }
        sleep 0.25
      done
      if port_open; then
        echo "JARVIS started (pid $pid)"
        echo "open: $(public_url)"
        echo "log : $LOG"
        exit 0
      fi
      echo "server did not answer on port $PORT, see $LOG" >&2
      exit 1
    fi
    echo "starting JARVIS on $HOST:$PORT (Ctrl+C to stop)"
    exec "$PYTHON" -u "${ARGS[@]}"
    ;;
esac
