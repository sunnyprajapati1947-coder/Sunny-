#!/usr/bin/env bash
# Install / re-run safely on Termux (or Debian proot). Idempotent. Never overwrites your config,
# secrets, database or other projects. Downloads NO model. Installs only small packages when asked.
set -euo pipefail
cd "$(dirname "$0")"
. scripts/common.sh

nova_say "== Nova Phone AI installer =="
nova_say "project: $NOVA_PROJECT_DIR"
nova_say "data:    $NOVA_HOME"

if nova_is_termux; then
  nova_say "platform: Termux"
  if [ "${NOVA_SKIP_PKG:-0}" != "1" ] && command -v pkg >/dev/null 2>&1; then
    missing=()
    command -v python3 >/dev/null 2>&1 || missing+=(python)
    command -v git >/dev/null 2>&1 || missing+=(git)
    command -v termux-battery-status >/dev/null 2>&1 || missing+=(termux-api)
    if [ "${#missing[@]}" -gt 0 ]; then
      nova_say "installing small packages: ${missing[*]}"
      pkg install -y "${missing[@]}" || nova_warn "pkg install failed; install manually: pkg install ${missing[*]}"
    fi
  fi
else
  nova_say "platform: non-Termux Linux (Debian proot or other)"
fi

# 1. Python 3.11+ is required (stdlib only; no pip packages to download).
if ! "$NOVA_PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
  nova_die "Python 3.11+ required. Termux: pkg install python ; Debian: apt install python3"
fi
nova_say "python: $("$NOVA_PY" -V 2>&1)"
command -v git >/dev/null 2>&1 || nova_warn "git not found (needed only for updates): pkg install git"

# 2. Data folders (created only if missing).
mkdir -p "$NOVA_HOME/logs" "$NOVA_HOME/run" "$NOVA_HOME/backups" "$NOVA_HOME/workspace"
chmod 700 "$NOVA_HOME"

# 3. Config and secrets templates: copied only when absent.
if [ ! -f "$NOVA_HOME/nova.toml" ]; then
  cp config/nova.example.toml "$NOVA_HOME/nova.toml"
  nova_say "created $NOVA_HOME/nova.toml"
else
  nova_say "kept existing $NOVA_HOME/nova.toml"
fi
if [ ! -f "$NOVA_HOME/secrets.env" ]; then
  cp config/secrets.example.env "$NOVA_HOME/secrets.env"
  nova_say "created $NOVA_HOME/secrets.env (empty keys; add yours only if you want online fallback)"
else
  nova_say "kept existing $NOVA_HOME/secrets.env"
fi
chmod 600 "$NOVA_HOME/secrets.env"

# 4. Executables and a `nova` command (never overwrites a foreign file).
chmod +x bin/nova install-termux.sh start.sh stop.sh doctor.sh update.sh 2>/dev/null || true
if nova_is_termux && [ -n "${PREFIX:-}" ]; then BIN_DIR="$PREFIX/bin"; else BIN_DIR="$HOME/.local/bin"; fi
mkdir -p "$BIN_DIR"
if [ -e "$BIN_DIR/nova" ] && [ ! -L "$BIN_DIR/nova" ]; then
  nova_warn "$BIN_DIR/nova exists and is not ours; run $NOVA_PROJECT_DIR/bin/nova instead"
else
  ln -sfn "$NOVA_PROJECT_DIR/bin/nova" "$BIN_DIR/nova"
  nova_say "command installed: $BIN_DIR/nova"
fi

# 5. Initialise database and workspace, then verify.
"$NOVA_PY" -m nova init
nova_say ""
nova_say "== doctor (offline quick check) =="
"$NOVA_PY" -m nova doctor --offline || nova_warn "doctor reported FAIL items; see above"

nova_say ""
nova_say "Done. Next steps:"
nova_say "  1. Make sure your llama.cpp server is running on $(nova_cfg llm.base_url) (or run ./start.sh)."
nova_say "  2. Try:  ./doctor.sh   then   nova chat"
nova_say "  3. Optional online fallback: see README (secrets.env, chmod 600). Off by default."
nova_say "Your existing ~/NovaAI folder was not modified."
