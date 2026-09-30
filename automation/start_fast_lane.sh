#!/data/data/com.termux/files/usr/bin/bash
set -u

ROOT="$HOME/Nova"
LLAMA_SERVER="${NOVA_LLAMA_SERVER:-$HOME/llama.cpp/build-fast/bin/llama-server}"
FAST_PORT="${NOVA_FAST_QWEN_PORT:-8081}"
FAST_HF="${NOVA_FAST_QWEN_HF:-Qwen/Qwen3-0.6B-GGUF:Q4_K_M}"
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
    echo "Nova fast lane already running (PID $pid)"
    exit 0
  fi
  rm -f "$PIDFILE"
fi

nohup "$LLAMA_SERVER" \
  --host 127.0.0.1 \
  --port "$FAST_PORT" \
  -hf "$FAST_HF" \
  -c 2048 \
  -t 6 \
  -tb 6 \
  --parallel 1 \
  --reasoning off \
  >>"$LOG" 2>&1 &

echo $! > "$PIDFILE"
echo "Nova fast lane starting on 127.0.0.1:$FAST_PORT"

# Give llama-server a short startup window and fail loudly if the API never becomes ready.
for _ in $(seq 1 30); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$FAST_PORT/v1/models" >/dev/null 2>&1; then
    echo "Nova fast lane READY on 127.0.0.1:$FAST_PORT"
    exit 0
  fi
  sleep 1
done

echo "Nova fast lane FAILED health check; see $LOG" >&2
exit 1
