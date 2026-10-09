#!/bin/bash
# ============================================================
# OpenJarvis + Gemini — live verification (key KABHI print nahi hoti)
# ============================================================
# Kya karta hai:
#   A. google-genai dependency check
#   B. Tumhari API key se visible model list (sirf names)
#   C. Candidate models par direct inference (pehla PASS = winner)
#   D. OpenJarvis chat test: jarvis ask -e cloud -m <winner>
#   E. Official orchestrator tool-use test: calculator 137 x 42 = 5754
# Usage (Debian proot ke andar):
#   bash gemini-test.sh
# ============================================================
set -u

OJ_HOME="${OPENJARVIS_HOME:-/root/.openjarvis}"
ENV_FILE="$OJ_HOME/gemini.env"
VENV_PY="/root/OpenJarvis/.venv/bin/python"
VENV_JARVIS="/root/OpenJarvis/.venv/bin/jarvis"
WINNER_FILE="/tmp/oj_gemini_winner.txt"

# ---------- Step 0: key load (hidden) ----------
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE" 2>/dev/null; set +a
fi
if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "[FAIL] GEMINI_API_KEY set nahi hai — pehle gemini-fix.sh chalao"
  exit 1
fi
echo "[PASS] GEMINI_API_KEY present (value hidden)"

if [ ! -x "$VENV_PY" ]; then
  echo "[FAIL] $VENV_PY nahi mila"
  exit 1
fi

# ---------- Step A/B/C: model list + candidates + inference ----------
"$VENV_PY" - <<'PYEOF'
import os, sys

try:
    from google import genai
except ImportError:
    print("[FAIL] google-genai missing — pip install google-genai in the OpenJarvis venv")
    sys.exit(1)

WINNER_FILE = "/tmp/oj_gemini_winner.txt"
# Order: stable + OpenJarvis-catalog me listed pehle; 2.5-flash last (retiring).
CANDIDATES = [
    "gemini-3-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
]

def classify(e: Exception) -> str:
    s = str(e)
    t = type(e).__name__
    if "404" in s or "NOT_FOUND" in s or "not found" in s.lower():
        return "MODEL_UNAVAILABLE"
    if "429" in s or "RESOURCE_EXHAUSTED" in s:
        return "QUOTA_OR_RATE_LIMIT"
    if "API_KEY" in s or "401" in s or "403" in s or "PERMISSION" in s:
        return "AUTH_PROBLEM"
    if "Connect" in t or "timeout" in s.lower() or "SSL" in s or "unreachable" in s.lower():
        return "NETWORK"
    return "OTHER"

client = genai.Client()  # GEMINI_API_KEY env se

print("\n== Step A: tumhari key se visible models (sirf names)")
listed = set()
try:
    ids = sorted(m.name for m in client.models.list())
    listed = set(ids)
    fam = [i for i in ids if i.startswith("gemini") or i.startswith("veo") or i.startswith("lyria")]
    print(f"[PASS] total {len(ids)} models visible, gemini-family {len(fam)}")
    for i in fam:
        print("   -", i)
except Exception as e:
    print(f"[FAIL] models.list -> {type(e).__name__}: {str(e)[:200]}")
    print("   class:", classify(e))

print("\n== Step B: direct inference per candidate (pehla PASS = winner)")
winner = None
for m in CANDIDATES:
    note = "" if (not listed or m in listed) else "  [!] tumhari list me nahi dikha"
    try:
        r = client.models.generate_content(model=m, contents="Reply with exactly: PONG")
        txt = (r.text or "").strip().replace("\n", " ")
        print(f"[PASS] {m}{note} -> {txt[:60]!r}")
        winner = m
        break
    except Exception as e:
        print(f"[FAIL] {m}{note} -> {classify(e)} | {type(e).__name__}: {str(e)[:160]}")

print("\n== Summary")
if winner:
    print(f"[PASS] USABLE_MODEL={winner}")
    with open(WINNER_FILE, "w") as f:
        f.write(winner)
else:
    print("[FAIL] USABLE_MODEL=NONE")
    print("   Checklist: key valid? | AI Studio me API enabled? | billing/quota | network")
    if os.path.exists(WINNER_FILE):
        os.remove(WINNER_FILE)
PYEOF

# ---------- Step D/E: OpenJarvis integration ----------
if [ -s "$WINNER_FILE" ]; then
  MODEL="$(cat "$WINNER_FILE")"

  echo
  echo "== Step D: OpenJarvis chat test (cloud engine + $MODEL)"
  "$VENV_JARVIS" ask -e cloud -m "$MODEL" "Reply with exactly: PONG" && \
    echo "[PASS] Step D — expected output me PONG hona chahiye (verify karo)" || \
    echo "[FAIL] Step D — upar wala actual error diagnose karo"

  echo
  echo "== Step E: official orchestrator tool-use test (calculator 137 x 42 = 5754)"
  "$VENV_JARVIS" ask -e cloud -m "$MODEL" -a orchestrator --tools calculator \
    "Calculate 137 * 42 using the calculator tool. Give the final number." && \
    echo "[PASS] Step E — expected final answer: 5754 (verify karo)" || \
    echo "[FAIL] Step E — upar wala actual error diagnose karo"
else
  echo
  echo "[NOT TESTED] Step D/E — kyunki Step B me koi model usable nahi mila"
fi

echo
echo "== Bonus: local lane health (existing llama.cpp setup)"
curl -sS -m 3 "http://127.0.0.1:8081/v1/models" >/dev/null 2>&1 && \
  echo "[PASS] llama.cpp server :8081 alive" || \
  echo "[WARN] llama.cpp server :8081 nahi mila (Termux side me llama-server check karo)"
