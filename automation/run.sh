#!/usr/bin/env bash
set -euo pipefail

mkdir -p workspace/output workspace/logs

printf '%s\n' "SunnyAI pipeline entrypoint" "TOPIC=${TOPIC:-}" "MODE=${MODE:-prepare}" "PRIVACY=${PRIVACY:-private}" "UPLOAD=${UPLOAD:-false}" | tee workspace/logs/pipeline.txt

# Put the real generation/render/upload commands here as the pipeline is connected.
# Secrets must come from GitHub Actions Secrets, never from committed files.

echo "Pipeline entrypoint completed." | tee -a workspace/logs/pipeline.txt
