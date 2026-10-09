#!/usr/bin/env bash
# Health checks with PASS / FAIL / WARN / NOT TESTED. Pass --offline to skip network and model calls.
cd "$(dirname "$0")"
. scripts/common.sh
exec "$NOVA_PY" -m nova doctor "$@"
