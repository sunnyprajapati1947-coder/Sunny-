#!/usr/bin/env bash
# ============================================================
# FF MAX UNIVERSE — one-time Termux setup
# Installs python (required) + git/termux-api (optional),
# then makes the helper scripts executable.
#
# Run from the repo root:  bash termux/setup-termux.sh
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

say() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

if [ ! -d /data/data/com.termux/files/usr ]; then
  say "Note: Termux install path not detected — continuing anyway (works on any Linux too)."
fi

if ! have pkg && ! have apt; then
  say "No 'pkg' or 'apt' found. Install python3 manually, then run:"
  say "  bash termux/serve.sh"
  exit 1
fi

say "==> Updating package lists"
if have pkg; then
  yes | pkg update -y >/dev/null 2>&1 || true
  say "==> Installing python, git, termux-api (optional pieces may skip)"
  pkg install -y python git >/dev/null 2>&1 || say "    python/git install had warnings — check 'pkg install python'"
  pkg install -y termux-api >/dev/null 2>&1 || say "    termux-api optional — skipped (wake-lock features need it)"
else
  say "==> apt detected: installing python3"
  sudo apt-get update -qq >/dev/null 2>&1 || true
  sudo apt-get install -y python3 >/dev/null 2>&1 || say "    python3 install warning — verify manually"
fi

say "==> Making scripts executable"
chmod +x "$SCRIPT_DIR/serve.sh" "$SCRIPT_DIR/setup-termux.sh" 2>/dev/null || true

say ""
say "==> Checks"
have python3 && say "    python3  : $(python3 --version 2>&1)" || say "    python3  : MISSING (pkg install python)"
have git     && say "    git      : $(git --version 2>&1 | head -1)" || say "    git      : not installed (optional)"
have termux-wake-lock && say "    wake-lock: available" || say "    wake-lock: optional, install termux-api + Termux:API app"

say ""
say "Done. Start the site:"
say "  bash termux/serve.sh            # foreground"
say "  bash termux/serve.sh --bg       # background"
say "  bash termux/serve.sh status"
say "  bash termux/serve.sh stop"
