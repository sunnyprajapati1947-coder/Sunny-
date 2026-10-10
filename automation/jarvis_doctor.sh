#!/data/data/com.termux/files/usr/bin/bash
# jarvis-doctor — poore Jarvis setup ki health check.
# Har cheez check karta hai aur PASS/FAIL + fix hint dikhata hai.
set -u
ROOT="${NOVA_ROOT:-$HOME/Nova}"
PASS=0; FAIL=0

ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad()  { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }
info() { echo "  [INFO] $1"; }

echo "== JARVIS DOCTOR =="
echo "Repo: $ROOT"
echo

echo "1) Repo aur files"
[ -f "$ROOT/jarvis.py" ] && ok "jarvis.py" || bad "jarvis.py missing - git pull karo"
[ -f "$ROOT/core/jarvis_brain.py" ] && ok "core modules" || bad "core modules missing"
[ -d "$ROOT/skills" ] && ok "skill packs" || bad "skills/ missing"
echo

echo "2) Python environment"
command -v python3 >/dev/null 2>&1 && ok "python3 ($(python3 --version 2>&1))" || bad "python3 install karo (pkg install python)"
python3 -c "import requests" 2>/dev/null && ok "requests" || bad "requests missing (pip install requests)"
echo

echo "3) Termux:API (voice + phone control)"
for cmd in termux-tts-speak termux-speech-to-text termux-battery-status termux-torch termux-clipboard-get; do
  command -v "$cmd" >/dev/null 2>&1 && ok "$cmd" || bad "$cmd missing (pkg install termux-api + Termux:API app)"
done
[ -x /system/bin/am ] && ok "/system/bin/am (app open)" || info "/system/bin/am check nahi hua (Termux ke bahar?)"
echo

echo "4) Local model lane"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 3 http://127.0.0.1:8081/v1/models >/dev/null 2>&1; then
    model=$(curl -fsS --max-time 3 http://127.0.0.1:8081/v1/models 2>/dev/null | head -c 200)
    ok "fast lane READY (8081)"
  else
    bad "fast lane (8081) OFF"
    [ -f "$HOME/models/Qwen3-1.7B-Q4_K_M.gguf" ] && info "1.7B model file hai - bash ~/Nova/automation/start_fast_lane.sh"
    [ -f "$HOME/models/Qwen3-0.6B-Q4_K_M.gguf" ] && info "0.6B model file hai - bash ~/Nova/automation/start_fast_lane.sh"
    if ls "$HOME"/models/*.gguf >/dev/null 2>&1; then :; else
      bad "koi model file nahi - bash ~/Nova/automation/download_model.sh 1.7b"
    fi
  fi
else
  info "curl nahi mila - lane check skip"
fi
echo

echo "5) Test suite (offline)"
if command -v python3 >/dev/null 2>&1 && [ -d "$ROOT/tests" ]; then
  (cd "$ROOT" && python3 -m unittest discover -s tests -q >/dev/null 2>&1) \
    && ok "unit tests sab pass" \
    || bad "kuch tests fail - cd $ROOT && python3 -m unittest discover -s tests"
fi
echo

echo "== RESULT: $PASS pass, $FAIL fail =="
[ "$FAIL" -eq 0 ] && echo "Sab theek hai Boss. jarvis-start se shuru karo." || {
  echo "Jo FAIL hain unke hints upar hain. Fix karke dobara:"
  echo "  bash $0"
}
exit $FAIL
