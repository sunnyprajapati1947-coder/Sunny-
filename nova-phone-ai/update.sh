#!/usr/bin/env bash
# Safe update from a TRUSTED remote only (see update.trusted_remotes in nova.toml).
#   ./update.sh               -> check whether an update exists (no changes)
#   ./update.sh apply --yes   -> test candidate in isolation, back up, fast-forward apply
#   ./update.sh rollback      -> return to the commit before the last applied update
cd "$(dirname "$0")"
. scripts/common.sh
if [ "$#" -eq 0 ]; then set -- check; fi
exec "$NOVA_PY" -m nova update "$@"
