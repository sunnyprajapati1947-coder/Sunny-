#!/usr/bin/env bash
# Restart the personal Jarvis browser page if its Python process crashes.
# Restarts only this app's own command. It never installs, downloads or runs anything else.
#   Run in Termux:  bash automation/jarvis_web_keepalive.sh
# Env (optional): JARVIS_PORT (8787), MAX_RESTARTS (0 = unlimited), BACKOFF_START (2), BACKOFF_MAX (60)
# Note: every restart creates a NEW token, so open the newest link printed in the terminal.
set -u
cd "$(dirname "$0")/.." || exit 1
CMD="${JARVIS_CMD:-python3 jarvis_personal.py --web --port ${JARVIS_PORT:-8787}}"
MAX_RESTARTS="${MAX_RESTARTS:-0}"
START_DELAY="${BACKOFF_START:-2}"
MAX_DELAY="${BACKOFF_MAX:-60}"
HEALTHY_SECONDS=60
delay="$START_DELAY"
restarts=0
stop=0

on_interrupt() { stop=1; }
trap on_interrupt INT TERM
if command -v termux-wake-lock >/dev/null 2>&1; then termux-wake-lock || true; fi
cleanup() { if command -v termux-wake-unlock >/dev/null 2>&1; then termux-wake-unlock || true; fi; }
trap cleanup EXIT

while true; do
  started=$(date +%s)
  bash -c "$CMD"
  code=$?
  if [ "$stop" -eq 1 ] || [ "$code" -eq 0 ]; then
    echo "Jarvis web stopped (code $code)."
    exit 0
  fi
  if [ "$code" -eq 2 ]; then
    # Configuration problem (for example port busy). Retrying cannot fix it, so stop and say why.
    echo "Jarvis web did not start (code 2). Fix the message above, then run this again."
    echo "If port $(printf '%s' "${JARVIS_PORT:-8787}") is busy, an old Jarvis page may still run: stop it in its Termux session (Ctrl+C), or use another port: JARVIS_PORT=8788 bash automation/jarvis_web_keepalive.sh"
    exit 2
  fi
  runtime=$(( $(date +%s) - started ))
  if [ "$runtime" -ge "$HEALTHY_SECONDS" ]; then delay="$START_DELAY"; fi
  if [ "$MAX_RESTARTS" -gt 0 ] && [ "$restarts" -ge "$MAX_RESTARTS" ]; then
    echo "Stopping: reached MAX_RESTARTS=$MAX_RESTARTS (last exit code $code)."
    exit 0
  fi
  restarts=$((restarts + 1))
  echo "Jarvis web crashed (code $code). Restart #$restarts in ${delay}s. Use the new link after restart."
  sleep "$delay"
  if [ "$stop" -eq 1 ]; then exit 0; fi
  delay=$(( delay * 2 > MAX_DELAY ? MAX_DELAY : delay * 2 ))
done
