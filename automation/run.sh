#!/usr/bin/env bash
set -euo pipefail
mkdir -p workspace/output workspace/logs
printf '%s\n' "Nova automation pipeline" "TOPIC=${TOPIC:-}" "MODE=${MODE:-prepare}" "PRIVACY=${PRIVACY:-private}" "UPLOAD=${UPLOAD:-false}" | tee workspace/logs/pipeline.txt
if [ "${MODE:-prepare}" != "auto" ] && [ -z "${TOPIC:-}" ]; then echo "TOPIC is required unless MODE=auto" | tee -a workspace/logs/pipeline.txt; exit 2; fi
case "${MODE:-prepare}" in
  prepare) python3 -c 'from core.automation_tools import create_project; import os; print(create_project(os.environ["TOPIC"]))' ;;
  auto) python3 -c 'from core.automation_tools import autonomous_run; import os; print(autonomous_run(os.getenv("ASPECT", "9:16"), int(os.getenv("DURATION_SECONDS", "30"))))' ;;
  render) python3 -c 'from core.automation_tools import run_pipeline; import os; print(run_pipeline(os.environ["TOPIC"]))' ;;
  publish) echo "Publish remains approval-gated; preparing only." | tee -a workspace/logs/pipeline.txt; python3 -c 'from core.automation_tools import run_pipeline; import os; print(run_pipeline(os.environ["TOPIC"]))' ;;
  *) echo "Unknown MODE: ${MODE}" | tee -a workspace/logs/pipeline.txt; exit 2 ;;
esac
