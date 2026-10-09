# Test report — Nova Phone AI 0.1.0

Status key: **PASS** verified by running it · **FAIL** ran and did not work · **NOT TESTED** not run in this
environment (reason given).

## Test environment used for this report

- Build sandbox: Linux x86_64 (Debian 12), Python 3.11.2. **Not** the phone.
- llama.cpp: built from the upstream master tarball (`llama-server` 0.6.0-dev), run with a **tiny random-weight**
  GGUF made by `tests/llama_smoke/make_tiny_gguf.py`. It checks protocol behaviour, not answer quality.
- Your phone (OPPO CPH2695, Termux, Debian proot, Python 3.13.5, Qwen3.5-0.8B) was **not available**, so
  everything that needs the device is NOT TESTED.
- Command: `python3 -m unittest discover -s tests -t .` with `NOVA_LLAMA_SERVER_BIN` and `NOVA_TINY_GGUF` set →
  **89 tests, OK, 0 skipped** (last run).

## Results by feature

| Area | Feature | Status | Evidence |
|---|---|---|---|
| Local model | llama-server reachable, `/v1/models` answers | PASS | live doctor against real llama-server |
| Local model | chat request accepted and answer parsed (real HTTP) | PASS | `llm_chat` live check; `RealLlamaServerTests` |
| Local model | context-overflow error reported as "prompt too large" | PASS | live 400 from llama-server; unit test |
| Local model | offline server reported clearly, no crash | PASS | `test_model_offline_gives_clear_error`, CLI test |
| Local model | answer quality of Qwen3.5-0.8B on the phone | NOT TESTED | needs the phone and your GGUF |
| Agent | rules lane (time, battery, files, memory, search, tests), Hinglish phrases | PASS | `test_rules_*`, CLI tests |
| Agent | model tool loop (tool call → TOOL_RESULT → final) over real HTTP | PASS | `test_end_to_end_with_real_http_model` |
| Agent | invalid JSON from model is bounded, then fails honestly | PASS | `test_format_errors_are_bounded`; live with random model |
| Agent | tool-calling quality of your real model | NOT TESTED | the random test model cannot emit valid JSON |
| Tools | write/read/edit with read-back verification and backups | PASS | `test_write_read_edit_roundtrip_is_verified` |
| Tools | path traversal, symlink escape, sensitive files, core/config writes | PASS | `test_security`, `test_tools` |
| Tools | run approved Python and unit tests | PASS | `test_confirm_tools_run_when_approved`, `test_run_tests_*` |
| Tools | unapproved code execution denied | PASS | `test_confirm_tools_denied_without_approval` |
| Shell | no shell interpretation (`;` is literal) | PASS | `test_shell_metacharacters_are_not_interpreted` |
| Shell | destructive/secret commands blocked | PASS | `test_destructive_commands_blocked` |
| GitHub | read-only `gh repo view` on your repo | PASS | live via `github_cli` tool (`isPrivate: false` returned) |
| GitHub | `gh auth token` blocked; `gh repo delete` requires approval | PASS | live denial output |
| GitHub | write operations (push, PR, create) | NOT TESTED | intentionally not run |
| Web | keyless search and page reading, backends and parsing | PASS | mock Wikipedia and SearXNG servers; local HTTP page read |
| Web | private/loopback URL refusal | PASS | `test_private_and_loopback_urls_refused_by_default` |
| Web | live Wikipedia search and reading | FAIL (this sandbox) | TLS to Wikipedia closed by the sandbox network; doctor now reports WARN honestly. Re-check on your phone with `./doctor.sh`. |
| Termux:API | graceful NOT AVAILABLE when commands are missing | PASS | `test_termux_tools_report_not_available_when_missing`, `nova listen`/`speak` runs |
| Termux:API | battery, notification, TTS, clipboard on the device | NOT TESTED | needs the Termux:API app and the phone |
| Voice | microphone input (`nova listen`, `/listen`) | NOT TESTED | needs the phone microphone |
| Voice | spoken output (`voice_tts`) | NOT TESTED | needs the phone TTS engine |
| Memory | preferences, projects, history budget, redaction | PASS | `test_memory`, `test_security` |
| Memory | persistence across reopen; DB integrity check | PASS | `test_integrity_and_persistence_across_reopen`, doctor `database` |
| Tasks | multi-step plan with per-step verification → COMPLETED | PASS | `test_multi_step_task_completes_with_verified_steps`; CLI `--steps --run` |
| Tasks | bounded step retries → FAILED with reason, retry on request | PASS | `test_failed_step_retries_are_bounded_*`, `test_failed_task_can_be_retried_explicitly` |
| Tasks | crash / Ctrl-C mid-task → resume without re-running done steps | PASS | `test_crash_mid_task_then_resume_skips_completed_steps` |
| Tasks | step left running by dead process is retried | PASS | `test_running_step_left_by_dead_process_is_retried` |
| Tasks | model offline → INTERRUPTED and resumable | PASS | `test_model_offline_leaves_task_resumable` |
| Daemon | resume loop, heartbeat, survives exceptions, PID cleanup | PASS | `test_daemon_*` |
| Daemon | start/stop of a real background process | PASS | `test_start_uses_existing_llm_server_and_stop_keeps_it` |
| Background on Android | survival of Termux background process and battery optimisation | NOT TESTED | needs the phone |
| Doctor | every check reports PASS/FAIL/WARN/NOT TESTED with hints; no secret printed | PASS | `test_doctor_*`; live run |
| Install | `install-termux.sh` idempotent; keeps your edits; creates 600 secrets file | PASS | `test_install_is_idempotent_and_preserves_user_edits` (temp HOME) |
| Install | run on a real Termux / Debian proot install | NOT TESTED | needs the phone |
| Launcher | `nova` command via symlink | PASS | `test_launcher_works_through_symlink` |
| start/stop | Nova starts real llama-server when asked and stops only what it started | PASS | `RealLlamaServerTests` (real binary) |
| start/stop | your existing server is used and never stopped | PASS | `test_start_uses_existing_llm_server_and_stop_keeps_it` |
| Online fallback | disabled by default; used only when local fails; key sent only as Bearer | PASS | `test_online_lane_not_used_unless_enabled_and_keyed`, `test_fallback_to_online_*` (mock server) |
| Online fallback | live provider call with a real key | NOT TESTED | no key supplied; provider hosts are not in this sandbox's allow-list |
| Secrets | key values never printed by config/doctor | PASS | `test_tools_and_config_hide_secrets`, `test_doctor_never_prints_secret_values` |
| Update | check against trusted remote | PASS (refusal path) | live: refused cleanly because the branch is not yet on GitHub; re-check after push |
| Update | fast-forward apply after candidate tests, backup, rollback | PASS | `test_good_update_applies_with_backup_and_rolls_back` (real git repos) |
| Update | failing candidate leaves installation unchanged | PASS | `test_candidate_that_fails_tests_never_touches_install` |
| Update | untrusted remote, dirty tree, non-fast-forward refused | PASS | `test_untrusted_remote_is_refused`, `test_local_changes_block_update`, `test_apply_requires_explicit_confirmation` |
| Python version | Python 3.11.2 | PASS | this sandbox |
| Python version | Python 3.13 | NOT TESTED locally | 3.13 could not be downloaded in the sandbox. A GitHub Actions matrix (3.11, 3.13) is configured in `.github/workflows/nova-phone-ai-tests.yml`; see the CI result. |
| Existing projects | `~/NovaAI` and `/root/OpenJarvis` preserved | PASS by design | no code path writes outside Nova's own folders; `/root/OpenJarvis` was not readable in this sandbox |

## Known issues and limits

- Small local models may not follow the JSON protocol well. Nova then fails the step with a clear message rather than inventing results.
- Keyless web search depends on Wikipedia's API and internet access; it is rate-limited and not a full web search.
- Pre-existing `Sunny-` repo tests (outside `nova-phone-ai/`) show 9 errors in this sandbox because `requests` is not installed. These are unrelated and were not changed.
- The GitHub repository `sunnyprajapati1947-coder/Sunny-` is currently **public**.
