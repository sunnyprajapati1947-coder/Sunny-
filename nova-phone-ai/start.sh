#!/usr/bin/env bash
# Starts the Nova background daemon (resumes unfinished tasks). Starts llama-server ONLY when:
#   - the local model endpoint is not already answering, AND
#   - NOVA_START_LLAMA=1, AND llama-server + the model file are found.
# If you already run llama-server (e.g. on 127.0.0.1:8081), it is used and never restarted.
set -uo pipefail
cd "$(dirname "$0")"
. scripts/common.sh

mkdir -p "$NOVA_HOME/run" "$NOVA_HOME/logs"
"$NOVA_PY" -m nova init >/dev/null 2>&1 || nova_die "Nova is not initialised; run ./install-termux.sh"

if nova_pid_alive "$NOVA_HOME/run/daemon.pid"; then
  nova_say "daemon already running (pid $(cat "$NOVA_HOME/run/daemon.pid"))"
else
  rm -f "$NOVA_HOME/run/daemon.pid"
fi

LLM_URL="$(nova_cfg llm.base_url)"
MODEL_PATH="$(nova_cfg llm.model_path)"
MODEL_PATH="${MODEL_PATH/#\~/$HOME}"
if nova_llm_ready "$LLM_URL"; then
  nova_say "local model: READY at $LLM_URL (existing server used)"
elif [ "${NOVA_START_LLAMA:-0}" = "1" ]; then
  LLAMA_BIN="${NOVA_LLAMA_SERVER_BIN:-$(command -v llama-server 2>/dev/null || true)}"
  if [ -z "$LLAMA_BIN" ] || [ ! -x "$LLAMA_BIN" ]; then
    nova_warn "llama-server not found; set NOVA_LLAMA_SERVER_BIN=/path/to/llama-server"
  elif [ ! -f "$MODEL_PATH" ]; then
    nova_warn "model not found at $MODEL_PATH; nothing started"
  else
    PORT="$(printf '%s' "$LLM_URL" | sed -E 's#.*:([0-9]+)/?.*#\1#')"
    nohup "$LLAMA_BIN" -m "$MODEL_PATH" --host 127.0.0.1 --port "$PORT" -c 2048 -t 4 \
      >>"$NOVA_HOME/logs/llama-server.log" 2>&1 &
    echo $! > "$NOVA_HOME/run/llama.pid"
    for _ in $(seq 1 120); do
      nova_llm_ready "$LLM_URL" && break
      sleep 1
    done
    if nova_llm_ready "$LLM_URL"; then
      nova_say "local model: STARTED by Nova at $LLM_URL (pid $(cat "$NOVA_HOME/run/llama.pid"))"
    else
      nova_warn "llama-server did not become ready; see $NOVA_HOME/logs/llama-server.log"
    fi
  fi
else
  nova_warn "local model OFFLINE at $LLM_URL. Start your llama.cpp server, or set NOVA_START_LLAMA=1. Rules-based tools still work."
fi

if nova_is_termux && [ "${NOVA_WAKE_LOCK:-0}" = "1" ] && command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock && nova_say "wake lock on (release with stop.sh)"
fi

if ! nova_pid_alive "$NOVA_HOME/run/daemon.pid"; then
  nohup "$NOVA_PY" -m nova daemon >>"$NOVA_HOME/logs/daemon.out" 2>&1 &
  sleep 2
  if nova_pid_alive "$NOVA_HOME/run/daemon.pid" || kill -0 $! 2>/dev/null; then
    nova_say "daemon started (log: $NOVA_HOME/logs/daemon.out)"
  else
    nova_die "daemon failed to start; see $NOVA_HOME/logs/daemon.out"
  fi
fi
nova_say "Use: nova chat   |   status: nova status   |   health: ./doctor.sh"
