#!/data/data/com.termux/files/usr/bin/bash
# Jarvis background mode: phone lock ho jaye tab bhi sunta rahe.
#
# Usage:
#   bash ~/Nova/automation/jarvis_background.sh start    # background me chalu
#   bash ~/Nova/automation/jarvis_background.sh stop     # band
#   bash ~/Nova/automation/jarvis_background.sh status   # chal raha hai?
#   bash ~/Nova/automation/jarvis_background.sh boot     # phone restart pe auto-start
set -u
ROOT="$HOME/Nova"
PID_FILE="$ROOT/workspace/jarvis.pid"
LOG="$ROOT/workspace/logs/jarvis.log"
BOOT_SCRIPT="$HOME/.termux/boot/jarvis-boot.sh"

mkdir -p "$ROOT/workspace/logs"

running() {
  [ -f "$PID_FILE" ] || return 1
  pid="$(cat "$PID_FILE" 2>/dev/null)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

case "${1:-}" in
  start)
    if running; then
      echo "Jarvis already running (PID $(cat "$PID_FILE"))."
      exit 0
    fi
    # Wake lock: Android Jarvis ko sleep me na marne de.
    command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
    # Fast lane bhi chahiye hoga (agar off hai to start kar do silently).
    command -v curl >/dev/null 2>&1 && \
      curl -fsS --max-time 2 http://127.0.0.1:8081/v1/models >/dev/null 2>&1 || \
      bash "$ROOT/automation/start_fast_lane.sh" >/dev/null 2>&1 || true
    nohup python3 "$ROOT/jarvis.py" >>"$LOG" 2>&1 &
    echo $! > "$PID_FILE"
    command -v termux-notification >/dev/null 2>&1 && \
      termux-notification --title "Jarvis" --content "Background me chal raha hai Boss. Bolo!" \
        --ongoing --id jarvis_bg 2>/dev/null || true
    echo "Jarvis background me START (PID $(cat "$PID_FILE")). Log: $LOG"
    echo "Band karne ke liye: bash $0 stop"
    ;;
  stop)
    if running; then
      pid="$(cat "$PID_FILE")"
      kill "$pid" 2>/dev/null || true
      rm -f "$PID_FILE"
      command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock
      command -v termux-notification-remove >/dev/null 2>&1 && \
        termux-notification-remove jarvis_bg 2>/dev/null || true
      echo "Jarvis band ho gaya."
    else
      echo "Jarvis chal hi nahi raha."
      rm -f "$PID_FILE"
    fi
    ;;
  status)
    if running; then
      echo "Jarvis RUNNING (PID $(cat "$PID_FILE"))."
      tail -n 5 "$LOG" 2>/dev/null || true
    else
      echo "Jarvis OFFLINE."
    fi
    ;;
  boot)
    mkdir -p "$HOME/.termux/boot"
    cat > "$BOOT_SCRIPT" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
bash "$HOME/Nova/automation/jarvis_background.sh" start
BOOT
    chmod +x "$BOOT_SCRIPT"
    echo "Boot autostart install ho gaya: $BOOT_SCRIPT"
    echo "Note: 'Termux:Boot' app install karo aur ek baar kholo, tabhi restart ke baad chalega."
    ;;
  *)
    echo "Usage: bash $0 {start|stop|status|boot}"
    exit 2
    ;;
esac
