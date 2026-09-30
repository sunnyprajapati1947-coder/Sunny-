#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p "$HOME/.termux/boot" workspace/logs

cat > "$HOME/.termux/boot/nova-start.sh" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/Nova"
termux-wake-lock 2>/dev/null || true
bash automation/start_fast_lane.sh || true\nnohup python3 automation/nova_watchdog.py >> workspace/logs/watchdog.log 2>&1 &
BOOT
chmod +x "$HOME/.termux/boot/nova-start.sh"

echo "Nova background launcher installed with optional fast Qwen lane."
echo "For boot-after-restart, install the Termux:Boot add-on and open it once."
echo "For reliable lock-screen execution, disable Android battery optimization for Termux."
echo "Start now: termux-wake-lock && nohup python3 automation/nova_watchdog.py >> workspace/logs/watchdog.log 2>&1 &"
