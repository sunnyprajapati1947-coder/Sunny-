# Shared helpers for Nova shell scripts. Source this file; do not execute it.
# Never deletes user files. Never touches ~/NovaAI or other projects.

NOVA_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export NOVA_HOME="${NOVA_HOME:-$HOME/.nova-phone}"
export PYTHONPATH="$NOVA_PROJECT_DIR${PYTHONPATH:+:$PYTHONPATH}"
NOVA_PY="${NOVA_PYTHON:-python3}"

nova_say() { printf '%s\n' "$*"; }
nova_warn() { printf 'WARN: %s\n' "$*" >&2; }
nova_die() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

nova_is_termux() {
  case "${PREFIX:-}" in *com.termux*) return 0 ;; esac
  [ -d /data/data/com.termux ]
}

# Print a value from the effective Nova config (e.g. llm.base_url).
nova_cfg() {
  "$NOVA_PY" - "$1" <<'PY' 2>/dev/null
import sys
from nova.config import load_config
cfg = load_config()
node = cfg
for part in sys.argv[1].split("."):
    node = getattr(node, part)
print(node)
PY
}

nova_pid_alive() {
  local pid_file="$1"
  [ -f "$pid_file" ] || return 1
  local pid
  pid="$(cat "$pid_file" 2>/dev/null)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# Returns 0 if an OpenAI-compatible server answers at the given base URL.
nova_llm_ready() {
  "$NOVA_PY" - "$1" <<'PY' 2>/dev/null
import sys, urllib.request
try:
    with urllib.request.urlopen(sys.argv[1].rstrip("/") + "/models", timeout=3) as r:
        sys.exit(0 if r.status == 200 else 1)
except Exception:
    sys.exit(1)
PY
}
