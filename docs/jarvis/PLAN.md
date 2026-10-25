# JARVIS — Implementation Plan (approval ke liye)

**Base:** `docs/jarvis/AUDIT-2026-10-25.md`
**Rule:** purani working cheez delete nahi hogi. Har phase chhota, reversible, tested.

Har phase ke 3 gates:

1. **Code** — minimal diff, existing modules ke andar.
2. **Test** — naya test ya existing test ka pass hona zaroori.
3. **Evidence** — actual command output (guess/claim nahi).

Status labels strictly: **WORKING** (test pass) · **PARTIAL** · **BLOCKED** · **NOT IMPLEMENTED**.

---

## Phase 0 — Audit (ye turn, aadha ho gaya)

| Task | Status |
|---|---|
| Repo code ka audit (74 files) | **DONE** — `docs/jarvis/AUDIT-2026-10-25.md` |
| Read-only device auditor | **DONE** — `tools/jarvis_audit.py`, tested |
| `/root/OpenJarvis` + `jarvis-start` + packages/models audit | **BLOCKED** — phone pe run karna hai |

**Aapko karna hai (5 minute):**

```bash
cd /root/OpenJarvis && git pull
python3 tools/jarvis_audit.py --project /root/OpenJarvis --project "$HOME/Nova" --out "$HOME/jarvis-audit"
```

`~/jarvis-audit/jarvis-audit-*.md` ka content bhej do. Uske bina main device-specific decisions (kaunsa model, kaunsa venv, dashboard port, Termux:API hai ya nahi) guess karunga — jo main nahi karna chahta.

---

## Phase 1 — Foundations (P0, ~1 din) — *approval chahiye*

| # | Change | File | Test |
|---|---|---|---|
| 1.1 | Executor contract unify (`run_task` signature-adaptive) | `tasks/verified_queue.py` | `test_verified_queue.py` green |
| 1.2 | `execute()` ka envelope: `raw=` / `unwrap()` helper + callers fix | `core/tool_registry.py`, `core/github_agent_runtime.py` | `test_approval.py`, `test_argument_validation.py` green |
| 1.3 | Test isolation (tmp state) + `conftest.py` | `tests/conftest.py` (naya) | test run ke baad `git status` clean |
| 1.4 | Repo hygiene: `.gitignore` (pyc, state, logs) + `git rm --cached` | `.gitignore` | `git ls-files \| grep pyc` → 0 |
| 1.5 | Boot script ka literal `\n` bug | `automation/install_termux_background.sh` | generated file pe `bash -n` + content check |
| 1.6 | `requirements-core.txt` + install verify | naya + `doctor` | fresh venv me `build_registry()` chale |

**Rollback:** har commit alag, `git revert` se wapas.

---

## Phase 2 — Config + diagnostics (P1, ~4 ghante)

- `core/settings.py` (naya): `config/nova.env` loader (stdlib, no python-dotenv), typed access, **secrets ko sirf env se**, values logs me kabhi nahi.
- `tools/jarvis_doctor.py` (naya): python version, packages, config validity, kill switch, task queue health, lanes health, ports, disk, memory db, LLM reachability. Exit codes: 0 ok, 1 warn, 2 fail.
- `jarvis-start` ko doctor + duplicate-process check + graceful shutdown ke saath rewrite karna (phone pe, aapki permission ke baad hi).

Acceptance: `python3 tools/jarvis_doctor.py` → saaf report; config badal ke `NOVA_MAX_PLAN_STEPS` effect dikhe.

---

## Phase 3 — Brain: Gemini + local fallback (P1, ~1 din)

Naya `core/providers/gemini.py`:
- `generate(messages, tools=None, timeout=…)` — REST `v1beta/models/{model}:generateContent`, retries with backoff (max 2), 429/5xx handling, `GEMINI_API_KEY` env se.
- `core/brain.py`: provider selection — Gemini → local fast lane → local deep lane; active provider status; timeouts; circuit breaker (3 fails → 60s cooldown).
- Conversation state: last N turns inject (Hinglish instruction: "user ki language me jawab do").

Acceptance tests (mocked, no real key in repo):
- `test_brain_fallback.py`: Gemini 500 → local lane chalega; dono fail → clear error, koi infinite retry nahi.
- `test_brain_status.py`: active provider report.
- Real-key smoke test aapke phone pe (key environment me, repo me kabhi nahi).

**Rule:** "local model WORKING" tab likhunga jab phone pe asli generation test pass hoga.

---

## Phase 4 — Memory (P2, ~1 din)

- `memory/store.py`: SQLite (`workspace/jarvis.db`), tables `memories(id, kind, text, tags, source, created, updated, confidence)`, FTS5 search (fallback LIKE).
- `memory/recall.py`: retrieval by keyword + recency + kind, token budget.
- CRUD + CLI: `python3 -m memory.cli list/search/add/forget`.
- Redaction: API key/password patterns reject; "untrusted web content" ko `kind=note` aur `confidence=low`.
- Corruption recovery: DB corrupt → rename to `.corrupt-<ts>` + fresh DB + log, koi crash nahi.
- Existing vendored `memory_tool.py` ka import path adapt (ya adapter).

Acceptance: `test_memory_crud.py`, `test_memory_recovery.py`, `test_memory_no_secrets.py`.

---

## Phase 5 — Task engine lifecycle (P2, ~1 din)

- Statuses: `PENDING → RUNNING → VERIFYING → DONE | FAILED | BLOCKED | CANCELLED | PAUSED`.
- Dependencies (`depends_on`), max retries, per-step checkpoint, crash sweep (startup pe RUNNING → PAUSED with reason).
- CLI: `jarvis tasks list/show/pause/resume/cancel/requeue`.
- Same JSON file (backward compatible), migration function.

Acceptance: `test_task_lifecycle.py` (restart simulate), `test_task_crash_recovery.py`, `test_task_dependencies.py`.

---

## Phase 6 — Dashboard (P2, ~1 din)

- `server/dashboard.py`: stdlib `http.server` (koi naya framework nahi), bind `127.0.0.1` default.
- Auth: random bearer token `workspace/dashboard.token` (chmod 600), `/health` bina token (sirf `{ok:true}`), baaki sab token ke saath.
- Endpoints: `/api/status`, `/api/tasks`, `/api/memory`, `/api/logs`, `/api/approvals`, `/api/providers`.
- UI: single HTML file (mobile-first, dark), poll 3s; approvals ke liye approve/reject buttons.
- Public internet pe **kabhi** expose nahi (default localhost, Tailscale optional — docs me warn).

Acceptance: `test_dashboard_auth.py` (no token → 401), `test_dashboard_status.py`.

---

## Phase 7 — Tools: coding + research (P3, ~2 din)

- Register: `fs_read`, `fs_write` (project root ke andar only), `python_exec` (sandboxed tmp dir, timeout, no network default), `git_status/diff/commit` (no push, no force, no branch delete), `web_search` (existing) + `web_cite`.
- Har tool pe risk level: `low / medium / high`; MEDIUM pe approval (policy se), HIGH pe double-confirm.
- Allowlist argv approach: `security/allowlist.py`.

Acceptance: `test_tool_risk_levels.py`, `test_fs_escape_blocked.py`, `test_git_no_force.py`, `test_python_timeout.py`.

---

## Phase 8 — Voice + UI (P3, ~1 din)

- Termux API pehle: `termux-tts-speak` (out), `termux-speech-to-text` (in) — agar installed.
- Fallback: `nova_chat.py` me text; dashboard me browser `SpeechRecognition`/`speechSynthesis` (jaise `apps/jarvis-pocket` me hai — wahi code reuse).
- Wake word: **default off**, sirf documented manual mode.

Acceptance: `test_voice_tools_registered.py` (mocked binaries), device pe manual check.

---

## Phase 9 — Modules (P4)

| Module | Scope | Gate |
|---|---|---|
| CBSE Class 10 | `modules/cbse/` — notes, step-by-step solutions, quizzes; "official syllabus quote nahi" rule | content sources documented |
| Trading (TradingAgents) | `modules/market/` — **read-only** data + paper portfolio; koi broker key nahi, koi real order nahi | isolated venv/adapter |
| YouTube | existing prepare/queue tools ko formalize; upload approval-gated | OAuth scopes documented |

---

## Phase 10 — Acceptance run

`tools/acceptance.py` — 15 checks (aapke spec #19 se), output ek table:

```
[WORKING]  hindi multi-turn       2-turn scripted test
[WORKING]  memory persistence     restart ke baad recall
[WORKING]  provider fallback      mocked 500 → local
[BLOCKED]  local generation       llama-server nahi mila
...
```

Koi feature WORKING tab hi mark hoga jab uska test pass ho.

---

## Non-negotiables (jo main follow karunga)

1. Purana working code **delete/replace nahi** — adapter ya thin wrapper.
2. Koi bhi change se pehle `git` checkpoint / tar backup.
3. Real secrets kabhi repo/log/chat me nahi — sirf environment.
4. `rm -rf`, force-push, branch delete, public expose, real-money trade — **kabhi** automatic nahi.
5. Jo verify nahi hua, use WORKING nahi likhunga.

---

## Approval chahiye (aapke reply me itna likh dijiye)

| # | Cheez | Default |
|---|---|---|
| A | Phase 1 (bug fixes + hygiene) shuru karun? | **haan** expected |
| B | Phase 2–3 (config + doctor + Gemini) karun? | haan |
| C | Phase 4–6 (memory + tasks + dashboard) karun? | haan |
| D | Phase 7+ (coding tools, voice, modules) abhi ya baad me? | baad me |
| E | `jarvis-start` ko main rewrite karun (phone pe aap apply karoge) ya sirf naya version doon? | naya version + instructions |
| F | API key kis provider ki hai (Gemini? OpenRouter?) | Gemini assume |

Aur haan — **Phase 0 ka audit MD bhejna zaroori hai**, warna device-specific choices guess ban jayengi.
