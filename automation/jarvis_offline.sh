#!/usr/bin/env bash
# Native Termux CPU engine. Default is read-only; installs/serving are explicit.
set -euo pipefail

MODEL_REPO='Qwen/Qwen3-1.7B-GGUF:Q8_0'
MODEL_FILE='Qwen3-1.7B-Q8_0.gguf'

print_commands() {
  cat <<'COMMANDS'
# If currently inside Ubuntu, exit back to normal Termux first.
pkg install llama-cpp
llama-server --version

# Explicit first-time model download (~about 2 GB (estimate) + overhead) and foreground server:
llama-server -hf Qwen/Qwen3-1.7B-GGUF:Q8_0 --hf-file Qwen3-1.7B-Q8_0.gguf --no-mmproj --host 127.0.0.1 --port 8080 --alias jarvis-local -c 2048 -t 4 -tb 4 -b 128 -ub 128 -n 256 --parallel 1 -ngl 0 --jinja --reasoning off --no-agent --cors-origins http://127.0.0.1:8080,http://localhost:8080

# Once this exact model is cached, append --offline to avoid network downloads.
# Keep the server terminal open; Ctrl+C stops it. Use a second Termux session for chat.
# A native phone browser may use http://127.0.0.1:8080 if packaged WebUI is available.
# No provider API key, GPU addon, cloud login, trading or phone-action tool is needed.
COMMANDS
}

MODE="${1:---commands}"
case "$MODE" in
  --commands|--help|-h) print_commands; exit 0 ;;
  --install|--serve|--offline-serve)
    if [[ "$#" -ne 1 ]]; then echo 'Usage: bash jarvis_offline.sh [--commands|--install|--serve|--offline-serve]' >&2; exit 2; fi
    ;;
  *) echo 'Usage: bash jarvis_offline.sh [--commands|--install|--serve|--offline-serve]' >&2; exit 2 ;;
esac

if [[ -n "${PD_CONTAINER:-}" || "${PREFIX:-}" != *com.termux*/files/usr ]]; then
  echo 'Run install/serve in normal native Termux, not Ubuntu/proot or a desktop sandbox. No action attempted.' >&2
  exit 1
fi

if [[ "$MODE" == '--install' ]]; then
  command -v pkg >/dev/null 2>&1 || { echo 'Termux pkg unavailable.' >&2; exit 1; }
  pkg install llama-cpp
  llama-server --version
  exit 0
fi
command -v llama-server >/dev/null 2>&1 || { echo 'Install native llama-cpp first.' >&2; exit 1; }

CMD=(llama-server -hf "$MODEL_REPO" --hf-file "$MODEL_FILE" --no-mmproj
  --host 127.0.0.1 --port 8080 --alias jarvis-local -c 2048 -t 4 -tb 4
  -b 128 -ub 128 -n 256 --parallel 1 -ngl 0 --jinja --reasoning off --no-agent
  --cors-origins http://127.0.0.1:8080,http://localhost:8080)
if [[ "$MODE" == '--offline-serve' ]]; then
  CMD+=(--offline)
  echo 'Cache-only inference. Missing weights cause an error; no model will be downloaded.'
else
  echo 'Explicit model download/server mode: roughly about 2 GB (estimate) plus overhead if not cached; data/battery are used.'
fi
# Foreground, no nohup/pid-file/daemon, no upstream shell installer or model execution as code.
exec "${CMD[@]}"
