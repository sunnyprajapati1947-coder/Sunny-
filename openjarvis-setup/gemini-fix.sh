#!/bin/bash
# ============================================================
# OpenJarvis + Gemini — safe setup/repair (Debian proot, root)
# ============================================================
# Kya karta hai (key KABHI print nahi hoti):
#   1. /root/.openjarvis/gemini.env ki presence + shell syntax check
#   2. Broken file (quoting error) ko hidden input se repair
#   3. /root/start-jarvis.sh me key-source block add karta hai
#   4. config.toml verify/fix karta hai (backup ke saath, tomlkit se)
# Usage (Debian proot ke andar, /root/OpenJarvis wali machine par):
#   bash gemini-fix.sh
# ============================================================
set -u

OJ_HOME="${OPENJARVIS_HOME:-/root/.openjarvis}"
ENV_FILE="$OJ_HOME/gemini.env"
CONFIG_FILE="$OJ_HOME/config.toml"
LAUNCHER="/root/start-jarvis.sh"
VENV_PY="/root/OpenJarvis/.venv/bin/python"
VENV_JARVIS="/root/OpenJarvis/.venv/bin/jarvis"
STAMP="$(date +%Y%m%d-%H%M%S)"

log()  { printf '\n== %s\n' "$*"; }
ok()   { printf '   [PASS] %s\n' "$*"; }
bad()  { printf '   [FAIL] %s\n' "$*"; }
warn() { printf '   [WARN] %s\n' "$*"; }

backup() {
  if [ -f "$1" ]; then
    cp -p "$1" "$1.bak-$STAMP" && ok "backup bana: $1.bak-$STAMP"
  fi
}

# ---------- Step 0: paths ----------
log "Step 0: existing setup paths"
for p in "$VENV_PY" "$VENV_JARVIS"; do
  if [ -x "$p" ]; then ok "found $p"; else bad "missing $p — OpenJarvis path galat hai"; fi
done
mkdir -p "$OJ_HOME"

# ---------- Step 1: gemini.env check ----------
log "Step 1: gemini.env presence + syntax (value hidden)"
KEY_PRESENT=0
if [ ! -f "$ENV_FILE" ]; then
  warn "$ENV_FILE missing"
else
  ok "exists: $ENV_FILE ($(wc -c < "$ENV_FILE") bytes)"
  if bash -n "$ENV_FILE" 2>/tmp/gemini-env-syntax.err; then
    ok "shell syntax OK"
  else
    bad "shell syntax BROKEN (purani quoting error yahin ho sakti hai)"
    printf '   structure (values redacted):\n'
    sed 's/=.*/=<redacted>/' "$ENV_FILE" | head -5
  fi
  # source karke check — sirf yes/no, value nahi
  if ( set -a; . "$ENV_FILE" 2>/dev/null; set +a; [ -n "${GEMINI_API_KEY:-}" ] ); then
    KEY_PRESENT=1
    ok "GEMINI_API_KEY file se load ho rahi hai (value hidden)"
  else
    bad "file GEMINI_API_KEY provide nahi karti"
  fi
fi

# ---------- Step 2: repair via hidden input ----------
if [ "$KEY_PRESENT" -eq 0 ]; then
  log "Step 2: gemini.env repair (hidden input — chat me key mat bhejo)"
  printf '   Gemini API key paste karo (input invisible rahega, Enter = skip): '
  read -rs NEWKEY; echo
  NEWKEY="$(printf '%s' "$NEWKEY" | tr -d '[:space:]"'"'"'')"
  if [ -n "$NEWKEY" ]; then
    backup "$ENV_FILE"
    ( umask 077; printf "export GEMINI_API_KEY='%s'\n" "$NEWKEY" > "$ENV_FILE" )
    chmod 600 "$ENV_FILE"
    if ( set -a; . "$ENV_FILE" 2>/dev/null; set +a; [ -n "${GEMINI_API_KEY:-}" ] ); then
      ok "gemini.env rewrite + verify OK (permissions 600)"
    else
      bad "rewrite ke baad bhi key load nahi ho rahi — manually check karo"
    fi
    NEWKEY=""
  else
    warn "skip kiya — key abhi bhi missing"
  fi
fi

# ---------- Step 3: launcher sources gemini.env ----------
log "Step 3: launcher me key-source block"
if [ -f "$LAUNCHER" ]; then
  if grep -q "openjarvis gemini env" "$LAUNCHER"; then
    ok "sourcing block pehle se maujood"
  else
    backup "$LAUNCHER"
    cat >> "$LAUNCHER" <<'EOF'

# >>> openjarvis gemini env >>>
# Cloud keys ko bina print kiye load karta hai.
if [ -f /root/.openjarvis/gemini.env ]; then
  set -a
  . /root/.openjarvis/gemini.env
  set +a
fi
# <<< openjarvis gemini env <<<
EOF
    ok "appended: $LAUNCHER (gemini.env auto-source hoga)"
  fi
else
  warn "$LAUNCHER nahi mila — jarvis chalane se pehle manually: set -a; . $ENV_FILE; set +a"
fi

# ---------- Step 4: config.toml (tomlkit, no secrets) ----------
log "Step 4: config.toml verify/fix (backup ke saath)"
backup "$CONFIG_FILE"
"$VENV_PY" - "$CONFIG_FILE" <<'PYEOF'
import sys
try:
    import tomlkit
except ImportError:
    print("   [FAIL] tomlkit missing in venv"); sys.exit(1)

path = sys.argv[1]
try:
    with open(path) as f:
        doc = tomlkit.load(f)
except FileNotFoundError:
    doc = tomlkit.document()
except Exception as e:
    print(f"   [FAIL] config.toml PARSE error (quoting damage): {type(e).__name__}: {e}")
    print("   -> backup restore karo ya jarvis init --force se naya banao")
    sys.exit(1)

changed = False
eng = doc.setdefault("engine", tomlkit.table())
if eng.get("default") != "llamacpp":
    eng["default"] = "llamacpp"; changed = True

ll = eng.setdefault("llamacpp", tomlkit.table())
if ll.get("host") != "http://127.0.0.1:8081":
    ll["host"] = "http://127.0.0.1:8081"; changed = True

eng.setdefault("cloud", tomlkit.table())  # GEMINI_API_KEY env se padhta hai

tools = doc.setdefault("tools", tomlkit.table())
enabled = list(tools.get("enabled", []))
for t in ("calculator", "web_search", "file_read", "file_write", "code_interpreter", "shell_exec"):
    if t not in enabled:
        enabled.append(t); changed = True
tools["enabled"] = enabled

sec = doc.setdefault("security", tomlkit.table())
if sec.get("profile") != "personal":
    sec["profile"] = "personal"; changed = True

with open(path, "w") as f:
    tomlkit.dump(doc, f)

print("   [PASS] config.toml updated" if changed else "   [PASS] config.toml already correct")
print("   engine.default      =", doc["engine"]["default"])
print("   engine.llamacpp.host =", doc["engine"]["llamacpp"].get("host"))
print("   tools.enabled       =", list(doc["tools"]["enabled"]))
print("   security.profile    =", doc["security"].get("profile"))
print("   (config.toml me key store NAHI hoti — key env me rahti hai)")
PYEOF

# ---------- Done ----------
log "Done. Ab gemini-test.sh chalao (live Gemini verification)."
printf '   Tip: naya shell/session lo taaki launcher ka source block kaam kare.\n'
