#!/data/data/com.termux/files/usr/bin/bash
# J.A.R.V.I.S. on Android — install once, then start/stop from Termux.
#
#   bash automation/termux_jarvis.sh install
#   bash automation/termux_jarvis.sh start
#   bash automation/termux_jarvis.sh stop
#   bash automation/termux_jarvis.sh status
#   bash automation/termux_jarvis.sh hand     # phone-hand doctor (Termux:API)
#
# The HUD opens in your browser; "Add to Home screen" gives you the PWA icon.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
PID_FILE="$ROOT/.jarvis-termux.pid"
PORT="${JARVIS_PORT:-7777}"

need_termux() {
  if [ ! -d /data/data/com.termux ]; then
    echo "This script is for Termux on Android." >&2
    exit 1
  fi
}

install_deps() {
  need_termux
  pkg update -y
  pkg install -y python termux-api coreutils
  if ! command -v tesseract >/dev/null 2>&1; then
    echo "Optional OCR: pkg install tesseract"
  fi
  echo
  echo "Jarvis dependencies ready."
  echo "Optional local brain (small, phone-friendly):"
  echo "  pkg install llama-cpp   # or build llama.cpp and pull Qwen3-1.7B Q4"
  echo "  JARVIS_QWEN_URL=http://127.0.0.1:8080/v1/chat/completions"
  echo
  echo "Phone hand: install the Termux:API app, then run"
  echo "  bash automation/termux_jarvis.sh hand"
}

start() {
  need_termux
  mkdir -p "$LOG_DIR"
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Jarvis is already running (pid $(cat "$PID_FILE"))."
  else
    cd "$ROOT"
    termux-wake-lock 2>/dev/null || true
    nohup python3 jarvis.py --no-browser --host 127.0.0.1 --port "$PORT" \
      >> "$LOG_DIR/termux.log" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 2
    echo "Jarvis started (pid $(cat "$PID_FILE")) on port $PORT."
  fi
  termux-open-url "http://127.0.0.1:$PORT" 2>/dev/null || \
    echo "Open http://127.0.0.1:$PORT in Chrome and use Add to Home screen."
}

stop() {
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  pkill -f "jarvis.py --no-browser" 2>/dev/null || true
  termux-wake-unlock 2>/dev/null || true
  echo "Jarvis stopped."
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "running · pid $(cat "$PID_FILE") · http://127.0.0.1:$PORT"
  else
    echo "stopped"
  fi
}

PHONE_BINARIES="termux-telephony-call termux-sms-send termux-notification termux-notification-list termux-toast termux-vibrate termux-torch termux-volume termux-battery-status termux-clipboard-get termux-clipboard-set termux-tts-speak termux-contact-list termux-location termux-camera-photo termux-open termux-open-url termux-wifi-connectioninfo"

hand() {
  need_termux
  local ok=0 total=0
  echo "PHONE HAND · Termux:API"
  for binary in $PHONE_BINARIES; do
    total=$((total + 1))
    if command -v "$binary" >/dev/null 2>&1; then
      ok=$((ok + 1))
    else
      echo "  missing: $binary"
    fi
  done
  echo "  $ok/$total commands present"
  if [ "$ok" -lt "$total" ]; then
    echo
    echo "Fix: pkg install termux-api"
    echo "Then install the Termux:API app (F-Droid / Play Store) and open it once."
  fi
  echo
  echo "Live probe (needs the Termux:API app installed):"
  if command -v termux-battery-status >/dev/null 2>&1; then
    termux-battery-status 2>&1 | head -c 240 || true
    echo
  fi
}

case "${1:-start}" in
  install) install_deps ;;
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  hand) hand ;;
  *)
    echo "Usage: $0 {install|start|stop|restart|status|hand}" >&2
    exit 2
    ;;
esac
