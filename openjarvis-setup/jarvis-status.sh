#!/bin/bash
# ============================================================
# OpenJarvis daily status check (Debian proot, key KABHI print nahi hoti)
# ============================================================
# Ek command me sab health: local model server, Gemini key, doctor,
# memory, aur quick model-switch commands ka reminder.
# Usage:
#   bash jarvis-status.sh
# ============================================================
set -u

ENV_FILE="${OPENJARVIS_HOME:-/root/.openjarvis}/gemini.env"
VENV_PY="/root/OpenJarvis/.venv/bin/python"
VENV_JARVIS="/root/OpenJarvis/.venv/bin/jarvis"
LOCAL_URL="http://127.0.0.1:8081"

ok()   { printf '[PASS] %s\n' "$*"; }
bad()  { printf '[FAIL] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }

echo "===== OpenJarvis Status ($(date '+%Y-%m-%d %H:%M')) ====="

# 1. Local llama.cpp model server
echo
echo "-- Local model server ($LOCAL_URL)"
if curl -sS -m 3 "$LOCAL_URL/v1/models" >/tmp/oj_models.json 2>/dev/null; then
  ok "llama.cpp server alive"
  # model names only
  grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' /tmp/oj_models.json | sed 's/.*"id"[^"]*"/   model: /;s/"//' | head -5
else
  bad "llama.cpp server nahi mila — Termux side me 'llama-server' check karo"
fi

# 2. Gemini key (hidden)
echo
echo "-- Gemini key"
if [ -f "$ENV_FILE" ]; then
  if ( set -a; . "$ENV_FILE" 2>/dev/null; set +a; [ -n "${GEMINI_API_KEY:-}" ] ); then
    ok "GEMINI_API_KEY load ho rahi hai (value hidden)"
  else
    bad "gemini.env me key valid nahi — bash gemini-fix.sh chalao"
  fi
else
  warn "gemini.env nahi mila — bash gemini-fix.sh chalao"
fi

# 3. Rust extension (memory backend ke liye zaroori)
echo
echo "-- Rust extension (memory backend)"
"$VENV_PY" -c "from openjarvis._rust_bridge import RUST_AVAILABLE; import sys; sys.exit(0 if RUST_AVAILABLE else 1)" 2>/dev/null \
  && ok "openjarvis_rust installed" \
  || bad "openjarvis_rust missing — memory backend kaam nahi karega"

# 4. jarvis doctor summary (sirf last line + failures)
echo
echo "-- jarvis doctor"
if [ -x "$VENV_JARVIS" ]; then
  DOC_OUT="$("$VENV_JARVIS" doctor 2>/dev/null | grep -E "passed|failures" | tail -1)"
  [ -n "$DOC_OUT" ] && echo "   $DOC_OUT"
  ok "doctor ran"
else
  bad "$VENV_JARVIS nahi mila"
fi

# 5. Memory stats
echo
echo "-- Memory"
MEM_OUT="$("$VENV_JARVIS" memory stats 2>/dev/null | head -8)"
if [ -n "$MEM_OUT" ]; then
  echo "$MEM_OUT" | sed 's/^/   /'
else
  warn "memory stats unavailable (Rust extension check upar dekho)"
fi

# 6. Quick commands reminder
echo
echo "-- Quick commands"
cat <<'EOF'
   Local chat   : jarvis ask -m qwen3.5:2b "Hello"
   Gemini chat  : jarvis ask -e cloud -m gemini-3-flash "Hello"
   Tool test    : jarvis ask -e cloud -m gemini-3-flash -a orchestrator --tools calculator "Calculate 137 * 42"
   Memory list  : jarvis memory list
   Full doctor  : jarvis doctor
EOF
