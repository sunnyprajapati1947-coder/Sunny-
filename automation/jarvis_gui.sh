#!/data/data/com.termux/files/usr/bin/bash
# jarvis-gui — Iron Man wala HUD dashboard browser me kholo.
set -u
ROOT="${NOVA_ROOT:-$HOME/Nova}"
exec python3 "$ROOT/core/dashboard.py" "$@"
