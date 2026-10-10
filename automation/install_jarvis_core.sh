#!/usr/bin/env bash
# Install only the pinned OpenJarvis CLI into the prepared Linux virtualenv.
# Default: print commands. --apply: explicitly install base dependencies.
set -euo pipefail

REVISION="764cfc17a23cd6e7ea5fd90bc51e5eef465c8464"
SOURCE="git+https://github.com/open-jarvis/OpenJarvis.git@$REVISION"
BINARY_PACKAGES="numpy,pandas,pyarrow,pydantic-core,jiter,primp"

print_commands() {
  printf '%s\n' \
    '# Run INSIDE Ubuntu with /opt/jarvis-venv activated:' \
    'python -m pip install --upgrade pip' \
    "python -m pip install --only-binary=$BINARY_PACKAGES \"$SOURCE\"" \
    'python -m pip check' \
    'jarvis --version' \
    'jarvis --help' \
    '# Base CLI only. No model, browser, video, skill, or trading configuration.' \
    '# Do not run bare jarvis/init/host until the inference backend is chosen.'
}

case "${1:---commands}" in
  --commands|--help|-h)
    print_commands
    exit 0
    ;;
  --apply)
    if [[ "$#" -ne 1 ]]; then
      echo 'Usage: bash install_jarvis_core.sh [--commands|--apply]' >&2
      exit 2
    fi
    ;;
  *)
    echo 'Usage: bash install_jarvis_core.sh [--commands|--apply]' >&2
    exit 2
    ;;
esac

# Refuse native Termux Python, a global interpreter, or a different project venv.
python - <<'CHECK'
import sys
from pathlib import Path
if not (
    sys.platform == "linux"
    and sys.version_info[:2] == (3, 12)
    and sys.prefix != sys.base_prefix
    and Path(sys.prefix).resolve() == Path("/opt/jarvis-venv").resolve()
):
    raise SystemExit("Stop: activate /opt/jarvis-venv inside Ubuntu/Python 3.12 first. No installation attempted.")
CHECK

command -v git >/dev/null 2>&1 || {
  echo 'Git is missing in Ubuntu; install it with apt install git.' >&2
  exit 1
}

python -m pip install --upgrade pip
GIT_LFS_SKIP_SMUDGE=1 python -m pip install --only-binary="$BINARY_PACKAGES" "$SOURCE"
python -m pip check
python - <<CHECK
import json
from importlib.metadata import distribution
installed = distribution("OpenJarvis")
provenance = json.loads(installed.read_text("direct_url.json") or "{}")
commit = provenance.get("vcs_info", {}).get("commit_id")
if commit != "$REVISION":
    raise SystemExit("Installed source revision does not match the reviewed commit. Do not configure a model yet.")
print("Verified OpenJarvis source commit:", commit)
CHECK
jarvis --version
jarvis --help
printf '\n%s\n' \
  'Base CLI installed. This is not a completed personal assistant or ten-source integration.' \
  'No inference engine, model weights, API credentials, GPU service, browser, skill, or financial execution was configured.' \
  'Next: choose and test one local or cloud chat backend.'
