#!/usr/bin/env bash
# Read-only Jarvis environment inspection. Changes nothing, starts nothing,
# prints no secret values (API keys are reported as length only).
# Run once in native Termux and once inside the Ubuntu proot, then paste the output.
#   bash automation/jarvis_inspect.sh
# Optional: JARVIS_OPENJARVIS_DIR=/path/to/OpenJarvis  JARVIS_VENV=/opt/jarvis-venv

set -u

section() { printf '\n== %s ==\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
run() { timeout "${T:-8}" "$@" 2>&1 | head -n "${LINES_MAX:-6}"; }

OPENJARVIS_DIR="${JARVIS_OPENJARVIS_DIR:-}"
VENV="${JARVIS_VENV:-/opt/jarvis-venv}"
REPO="${JARVIS_REPO:-$HOME/Jarvis/jarvis-github}"

section "where"
echo "date: $(date '+%F %T %Z')"
echo "user: $(id -un 2>/dev/null) home: $HOME"
echo "prefix: ${PREFIX:-none} (Termux if it contains com.termux)"
if [ -f /etc/os-release ]; then
  grep -E '^(PRETTY_NAME)=' /etc/os-release
fi
echo "arch: $(uname -m) kernel: $(uname -r)"
if have getprop; then
  echo "android: $(getprop ro.build.version.release 2>/dev/null) model: $(getprop ro.product.model 2>/dev/null)"
fi

section "resources"
if [ -r /proc/meminfo ]; then
  awk '/^(MemTotal|MemAvailable|SwapTotal):/ {printf "%s %.2f GiB\n", $1, $2/1048576}' /proc/meminfo
fi
df -h "$HOME" 2>/dev/null | tail -n 1 | awk '{print "storage free in home: " $4 " of " $2}'
nproc 2>/dev/null | awk '{print "cpu cores: " $1}'

section "python"
for p in python3 python3.12 python3.13 python3.14; do
  if have "$p"; then echo "$p: $("$p" -V 2>&1)"; fi
done
if [ -x "$VENV/bin/python" ]; then
  echo "venv $VENV: $("$VENV/bin/python" -V 2>&1)"
  if [ -x "$VENV/bin/jarvis" ]; then
    echo "jarvis --version: $(run "$VENV/bin/jarvis" --version | head -n 1)"
    echo "pip check:"; run "$VENV/bin/pip" check
  else
    echo "jarvis CLI: not found in $VENV"
  fi
else
  echo "venv $VENV: not found (expected inside Ubuntu proot)"
fi

section "repositories (git status only)"
for dir in "$REPO" "$OPENJARVIS_DIR" "/root/OpenJarvis"; do
  [ -n "$dir" ] && [ -d "$dir/.git" ] || continue
  echo "repo: $dir"
  echo "  head: $(git -C "$dir" log --oneline -1 2>/dev/null)"
  echo "  branch: $(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  dirty=$(git -C "$dir" status --short 2>/dev/null | wc -l)
  echo "  uncommitted files: $dirty"
done

section "local brains"
if have curl; then
  for port in 8080 8081; do
    body=$(timeout 5 curl -sS "http://127.0.0.1:$port/health" 2>&1 | head -c 200)
    echo "port $port /health: ${body:-no answer}"
  done
else
  echo "curl not installed; health checks skipped"
fi
if have llama-server; then
  echo "llama-server: $(llama-server --version 2>&1 | head -n 1)"
else
  echo "llama-server: not found in this environment"
fi
for d in "$HOME/models" "$HOME/Jarvis/models"; do
  [ -d "$d" ] || continue
  echo "models in $d:"
  find "$d" -maxdepth 1 -name '*.gguf' -printf '  %f %s bytes\n' 2>/dev/null | head -n 10
done

section "Jarvis state (counts only)"
state="$REPO/tasks/state.json"
if [ -f "$state" ] && have python3; then
  python3 - "$state" <<'PY' 2>&1 | head -n 6
import json, sys, collections
data = json.load(open(sys.argv[1]))
counts = collections.Counter(str(v.get("status", "?")) for v in data.values() if isinstance(v, dict))
print("tasks:", sum(counts.values()), dict(counts))
PY
else
  echo "tasks/state.json: not found or python3 missing"
fi
for log in "$REPO/logs" "$HOME/Jarvis/logs"; do
  [ -d "$log" ] || continue
  echo "log dir: $log"
  ls -1 "$log" 2>/dev/null | head -n 10 | sed 's/^/  /'
done

section "secrets (presence and length only)"
for name in GEMINI_API_KEY GOOGLE_API_KEY; do
  eval "value=\${$name:-}"
  echo "$name: ${#value} characters (0 means not set in this shell)"
done

section "done"
echo "Paste this whole output to the assistant. No secret values are included."
