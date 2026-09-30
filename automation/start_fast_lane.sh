#!/data/data/com.termux/files/usr/bin/bash
set -u

ROOT="$HOME/Nova"
LLAMA_SERVER="${NOVA_LLAMA_SERVER:-}"
if [ -z "$LLAMA_SERVER" ]; then
  for candidate in "$HOME/llama.cpp/build-fast/bin/llama-server" "$HOME/llama.cpp/build/bin/llama-server"; do
    if [ -x "$candidate" ]; then LLAMA_SERVER="$candidate"; break; fi
  done
fi
FAST_PORT="${NOVA_FAST_QWEN_PORT:-8081}"
FAST_MODEL_PATH="${NOVA_FAST_QWEN_MODEL_PATH:-}"
if [ -z "$FAST_MODEL_PATH" ]; then
  for candidate in "$HOME/models/Qwen3-0.6B-Q4_K_M.gguf" "$HOME/models/qwen3-0.6b-q4_k_m.gguf" "$HOME/models/qwen3.5-4b-instruct-Q4_K_M.gguf" "$HOME/models/Qwen3.5-4B-Q4_0.gguf"; do
    if [ -f "$candidate" ]; then FAST_MODEL_PATH="$candidate"; break; fi
  done
fi
FAST_MODEL="${NOVA_FAST_QWEN_MODEL:-NovaLocal}"
LOG="$ROOT/workspace/logs/fast_lane.log"
PIDFILE="$ROOT/workspace/fast-lane.pid"

mkdir -p "$ROOT/workspace/logs"

if [ ! -x "$LLAMA_SERVER" ]; then
  echo "llama-server not found: $LLAMA_SERVER" >&2
  exit 1
fi

if [ -f "$PIDFILE" ]; then
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "Nova fast lane already running (PID $pid); waiting for API..."
    for _ in $(seq 1 90); do
      if curl -fsS --max-time 1 "http://127.0.0.1:$FAST_PORT/v1/models" >/dev/null 2>&1; then
        echo "Nova fast lane READY on 127.0.0.1:$FAST_PORT"
        exit 0
      fi
      sleep 1
    done
    echo "Nova fast lane process exists but API is not ready; see $LOG" >&2
    exit 1
  fi
  rm -f "$PIDFILE"
fi

CMD=( "$LLAMA_SERVER" --host 127.0.0.1 --port "$FAST_PORT" -c 2048 -t 6 -tb 6 --parallel 1 --reasoning off --alias "$FAST_MODEL" )
if [ -n "$FAST_MODEL_PATH" ] && [ -f "$FAST_MODEL_PATH" ]; then
  CMD+=( -m "$FAST_MODEL_PATH" )
  echo "Nova fast lane using local model: $FAST_MODEL_PATH"
else
  echo "Nova fast lane: no local model found; refusing network model download" >&2
  exit 1
fi
nohup "${CMD[@]}" >>"$LOG" 2>&1 &

echo $! > "$PIDFILE"
echo "Nova fast lane starting on 127.0.0.1:$FAST_PORT"

# Give llama-server a short startup window and fail loudly if the API never becomes ready.
for _ in $(seq 1 120); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$FAST_PORT/v1/models" >/dev/null 2>&1; then
    echo "Nova fast lane READY on 127.0.0.1:$FAST_PORT"
    exit 0
  fi
  sleep 1
done

echo "Nova fast lane FAILED health check; see $LOG" >&2
exit 1
