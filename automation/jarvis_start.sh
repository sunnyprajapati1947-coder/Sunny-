#!/data/data/com.termux/files/usr/bin/bash
# jarvis-start — one command: lane check + Jarvis launch.
# Install: bash ~/Nova/automation/setup_termux.sh (is ko PATH me daal deta hai)
set -u
ROOT="${NOVA_ROOT:-$HOME/Nova}"

if [ ! -d "$ROOT" ]; then
  echo "Nova repo nahi mila: $ROOT"
  echo "Pehle: git clone -b arena/648528ed-sunny https://github.com/sunnyprajapati1947-coder/Sunny-.git Nova"
  exit 1
fi

# Fast lane chalu hai? Nahi to start kar (READY ka wait karta hai).
if command -v curl >/dev/null 2>&1; then
  if ! curl -fsS --max-time 2 http://127.0.0.1:8081/v1/models >/dev/null 2>&1; then
    echo "Local model lane OFF hai — start kar raha hu (2-3 min lag sakte hain)..."
    bash "$ROOT/automation/start_fast_lane.sh" || echo "WARNING: lane start nahi hua - Jarvis tool-mode me chalega."
  fi
fi

exec python3 "$ROOT/jarvis.py" "$@"
