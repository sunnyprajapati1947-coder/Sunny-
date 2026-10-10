#!/usr/bin/env bash
# Prepare a rootless Ubuntu/Python environment, NOT upstream AI runtimes.
# Default mode prints commands only. Installation requires explicit --apply.
set -euo pipefail

print_commands() {
  cat <<'COMMANDS'
# Run these in the normal Termux shell, one at a time:
pkg install proot-distro
mkdir -p "$HOME/Jarvis"
proot-distro install --name jarvis-linux ubuntu:24.04
proot-distro login --bind "$HOME/Jarvis:/root/Jarvis" jarvis-linux

# Then, INSIDE Ubuntu:
apt update
apt install -y python3 python3-venv python3-pip git curl ca-certificates
python3 --version
python3 -m venv /opt/jarvis-venv
. /opt/jarvis-venv/bin/activate
python --version

# This does not install models or integrate any of the ten repositories.
# Re-entry later: use the same login command, then activate the venv.
# If the named container or venv already exists, do not reset/delete it.
COMMANDS
}

case "${1:---commands}" in
  --commands|--help|-h)
    print_commands
    exit 0
    ;;
  --apply)
    if [[ "$#" -ne 1 ]]; then
      echo "Usage: bash prepare_jarvis_linux.sh [--commands|--apply]" >&2
      exit 2
    fi
    ;;
  *)
    echo "Usage: bash prepare_jarvis_linux.sh [--commands|--apply]" >&2
    exit 2
    ;;
esac

if [[ -n "${PD_CONTAINER:-}" || "${PREFIX:-}" != *com.termux*/files/usr ]]; then
  echo "Run --apply in the normal Termux shell, not inside Ubuntu/Debian or a desktop sandbox." >&2
  exit 1
fi
if ! command -v pkg >/dev/null 2>&1; then
  echo "Termux pkg command is unavailable; no installation attempted." >&2
  exit 1
fi

# Standard Termux package only; no curl-to-shell or third-party setup scripts.
pkg install -y proot-distro
mkdir -p "$HOME/Jarvis"

if proot-distro login jarvis-linux -- /bin/true >/dev/null 2>&1; then
  echo "Reusing existing jarvis-linux container; verifying Ubuntu version before changes."
else
  # The installer refuses an existing conflicting destination; never reset it.
  proot-distro install --name jarvis-linux ubuntu:24.04
fi

proot-distro login --bind "$HOME/Jarvis:/root/Jarvis" jarvis-linux -- /bin/bash -s <<'LINUX'
set -euo pipefail
. /etc/os-release
if [[ "$ID" != "ubuntu" || "$VERSION_ID" != "24.04" ]]; then
  echo "Expected Ubuntu 24.04. Existing container was not modified; choose a separate container." >&2
  exit 1
fi

apt update
DEBIAN_FRONTEND=noninteractive apt install -y python3 python3-venv python3-pip git curl ca-certificates
python3 -c 'import sys; assert sys.version_info[:2] == (3, 12), "Expected Python 3.12; do not change native Termux Python"'

# Venv stays in the Linux filesystem, not Android shared storage.
if [[ -e /opt/jarvis-venv ]]; then
  if [[ ! -x /opt/jarvis-venv/bin/python ]]; then
    echo "Existing /opt/jarvis-venv is incomplete; nothing was overwritten. Inspect it manually." >&2
    exit 1
  fi
else
  python3 -m venv /opt/jarvis-venv
fi
/opt/jarvis-venv/bin/python -c 'import sys; assert sys.version_info[:2] == (3, 12), "Existing venv is not Python 3.12; no overwrite attempted"'
/opt/jarvis-venv/bin/python --version
printf '\n%s\n' \
  'Ubuntu/Python environment prepared only.' \
  'No upstream runtime, model, GPU service, skill, browser connection, or trading action was installed or enabled.' \
  'Activate inside Ubuntu with: . /opt/jarvis-venv/bin/activate' \
  'Native Termux Python and existing Jarvis files were preserved.'
LINUX
