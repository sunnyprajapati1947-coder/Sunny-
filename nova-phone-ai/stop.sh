#!/usr/bin/env bash
# Stops the Nova daemon. Stops llama-server ONLY if Nova started it (run/llama.pid).
# An externally started llama.cpp server (your existing one) is left running.
set -uo pipefail
cd "$(dirname "$0")"
. scripts/common.sh

stop_pid() {  # $1 = pid file, $2 = label
  local file="$1" label="$2"
  if ! nova_pid_alive "$file"; then
    nova_say "$label: not running"
    rm -f "$file"
    return 0
  fi
  local pid; pid="$(cat "$file")"
  kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 1 15); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null
    nova_warn "$label did not exit on SIGTERM; sent SIGKILL"
  fi
  rm -f "$file"
  nova_say "$label stopped (pid $pid)"
}

stop_pid "$NOVA_HOME/run/daemon.pid" "daemon"
stop_pid "$NOVA_HOME/run/llama.pid" "llama-server (started by Nova)"
if nova_is_termux && command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-unlock >/dev/null 2>&1 || true
fi
nova_say "done. Unfinished tasks stay saved and resume on next start."
