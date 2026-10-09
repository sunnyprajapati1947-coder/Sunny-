# OpenJarvis + Gemini — Setup Status Report

**Date:** 2026-10-09
**Scope (Task 20):** Phase 1 existing setup verify + Phase 2 Gemini integration complete + ek chhota official tool-use test. Naya framework nahi banaya; sirf OpenJarvis ke built-in components use hue.

---

## 0. Environment note (important, honest)

| Environment | Kya hua |
|---|---|
| **Arena sandbox** (Linux, Python 3.11, internet sirf github/pypi tak) | OpenJarvis ko *actually* install karke doctor, tools, orchestrator tests chalaye — real outputs neeche hain |
| **Tera phone** (OPPO A5 Pro, Termux + Debian proot, Python 3.13.5) | Direct mere paas nahi hai. Wahan ke liye exact copy-paste scripts diye hain: `gemini-fix.sh` aur `gemini-test.sh`. Live Gemini inference sandbox me **network-blocked** hai (Google API hosts allowed nahi), isliye woh tests phone par hi honge → status "NOT TESTED (phone)" |

---

## 1. Root cause — `gemini-2.5-flash` par 404 kyun aaya

- Google ke lifecycle table me **`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite` 20 October 2026 ko retire ho rahe hain** — unka replacement `gemini-3.8-flash` / `gemini-3.5-flash` / `gemini-3.1-flash-lite` hai ([source](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions)). Tera 404 isi ka symptom hai (model access hata diya gaya / hat raha hai).
- Current Gemini 3 family (Gemini Developer API): `gemini-3-flash` **GA/Active** ([source](https://www.gradually.ai/en/gemini-models/)), `gemini-3-flash-preview`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite` (stable, cheap), `gemini-3.5-flash`, `gemini-3.5-flash-lite` ([ai.google.dev models](https://ai.google.dev/gemini-api/docs/models), [Firebase model names](https://firebase.google.com/docs/ai-logic/models)).
- `gemini-3-pro` **discontinued** hai — use mat karo ([source](https://www.gradually.ai/en/gemini-models/)).
- **OpenJarvis catalog** (`engine/cloud.py` `_GOOGLE_MODELS`) me listed IDs: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3-pro`, `gemini-3-flash`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite-preview`, `gemini-3-flash-preview`.
- Koi bhi *custom* model ID (e.g. `gemini-3.5-flash`, `gemini-3.1-flash-lite`) bhi chal sakta hai — `resolve_model_id_for_engine()` non-mlx engines ke liye ID ko unchanged pass karta hai.

**Recommendation:** primary **`gemini-3-flash`**, fallback `gemini-3.1-flash-lite` (free-tier friendly, stable).

---

## 2. Gemini integration — kya fix kiya

1. **Key loading:** OpenJarvis koi `gemini.env` file *automatically* nahi padhta. Key `GEMINI_API_KEY` (ya `GOOGLE_API_KEY`) **environment variable** me honi chahiye, aur `google-genai` package installed hona chahiye (`inference-google` extra). Tera `/root/.openjarvis/gemini.env` tabhi kaam karega jab launcher (`/root/start-jarvis.sh`) use `source` kare — `gemini-fix.sh` Step 3 ye block add karta hai.
2. **Quoting-error repair:** `gemini-fix.sh` file ki `bash -n` syntax check karta hai, corrupted file ka structure bina value dikhaye print karta hai (`=<redacted>`), aur hidden terminal input se file ko safely rewrite karta hai (`chmod 600`). Config edit **tomlkit** se hota hai (na ki fragile sed), aur har file ka timestamped backup banta hai.
3. **config.toml (safe defaults, local-first):** `[engine] default="llamacpp"` (tera existing local setup — untouched), `[engine.llamacpp] host="http://127.0.0.1:8081"` (tera existing llama.cpp server), `[engine.cloud]` (key env se padhta hai — config me key kabhi store nahi hoti), `tools.enabled` me `calculator` etc., `security.profile="personal"`.
4. **Cloud engine key:** OpenJarvis me Google ka engine key **`cloud`** hai (`jarvis ask -e cloud -m gemini-3-flash ...`).

---

## 3. Test results (acceptance format — Section 19)

| # | Test | Kahan | Status | Real output / reason |
|---|---|---|---|---|
| 1 | OpenJarvis install (venv + `google-genai` 2.29.0 + editable install) | sandbox | **PASS** | `Successfully installed OpenJarvis-0.0.1.dev20+unknown.g764cfc17a ... google-genai-2.29.0` |
| 2 | `jarvis doctor` (key ke bina) | sandbox | **PASS** | `4 passed, 25 warnings, 0 failures` (warnings = optional features, failures 0) |
| 3 | `jarvis doctor` (`GEMINI_API_KEY` set hone par) | sandbox | **PASS** | `8 passed, 22 warnings, 0 failures`; `Engine: cloud → Reachable`; `Models: cloud → gemini-2.5-pro, gemini-2.5-flash, gemini-3-pro, gemini-3-flash, ...` |
| 4 | Calculator tool: `137 × 42` | sandbox | **PASS** | `5754.0` (official `ToolExecutor` + `CalculatorTool`) |
| 5 | File task: `file_write` → `file_read` verify | sandbox | **PASS** | wrote `NOVA-TASK-OK 5754`, read-back verified |
| 6 | Official tool tests (calculator, file_write, file_read) | sandbox | **PASS** | `63 passed in 0.26s` |
| 7 | Official orchestrator + agent executor tests (`test_query_orchestrator.py`, `agents/test_executor.py`) | sandbox | **PASS** | `24 passed in 0.34s` |
| 8 | Gemini SDK wiring (env key se `genai.Client()` + CloudEngine) | sandbox | **PASS** | `cloud engine google client created: PASS` (key print nahi hui) |
| 9 | `gemini-3-flash` OpenJarvis catalog me | sandbox | **PASS** | `_GOOGLE_MODELS` me present |
| 10 | **Live Gemini inference** | sandbox | **FAIL — network-blocked** | `httpx.ConnectError: TLS/SSL connection has been closed (EOF)` — sandbox allowlist me Google hosts nahi hain. Yeh test phone par `gemini-test.sh` se hoga. |
| 11 | Web search (keyless You.com engine) | sandbox | **FAIL — network-blocked** | You.com → DuckDuckGo → Mojeek sab TLS EOF. Engine chain theek kaam kar rahi thi. Phone par pehle PASS ho chuka tha. |
| 12 | Gemini key presence + model availability + inference | **phone** | **NOT TESTED** | `bash gemini-fix.sh` phir `bash gemini-test.sh` |
| 13 | OpenJarvis chat: Gemini se `PONG` | **phone** | **NOT TESTED** | `gemini-test.sh` Step D |
| 14 | Orchestrator tool-use via Gemini (`137 × 42 = 5754`) | **phone** | **NOT TESTED** | `gemini-test.sh` Step E |
| 15 | Local llama.cpp + `qwen3.5:2b` OpenJarvis se | **phone** | **NOT TESTED (is session me)** | Pehle PASS tha; `jarvis ask -m qwen3.5:2b "Hello"` se re-verify |

---

## 4. Phone par exactly kya karna hai (copy-paste)

`openjarvis-setup/` folder ko phone par rakh lo (git clone ya manual copy), phir **Debian proot ke andar**:

```bash
cd /root          # jahan openjarvis-setup folder rakha ho
bash openjarvis-setup/gemini-fix.sh
bash openjarvis-setup/gemini-test.sh
```

- `gemini-fix.sh` key sirf **hidden input** se maangega (chat me kabhi paste mat karo). Har changed file ka backup `*.bak-<timestamp>` banega.
- `gemini-test.sh` ke Step B me har candidate ka `PASS`/`FAIL` + **error class** (`MODEL_UNAVAILABLE` / `QUOTA_OR_RATE_LIMIT` / `AUTH_PROBLEM` / `NETWORK`) milega — usi se next action decide hoga.
- Expected (agar key + network sahi hain):
  - Step B: `[PASS] gemini-3-flash -> 'PONG'`
  - Step D: `PONG`
  - Step E: final answer `5754`

---

## 5. Agar koi test FAIL ho to diagnosis map

| Error class | Matlab | Action |
|---|---|---|
| `AUTH_PROBLEM` | Key invalid / project me API off | AI Studio → API key check, Generative Language API enable |
| `MODEL_UNAVAILABLE` | Wo model tumhare key/project par nahi | Agla candidate try karo (script already karta hai) |
| `QUOTA_OR_RATE_LIMIT` | Free quota khatam / rate limit | Thodi der baad retry; paid plan optional hai, mandatory nahi |
| `NETWORK` | Internet / DNS / proxy issue | Wi-Fi check, `curl -sS https://generativelanguage.googleapis.com` se connectivity dekho |

---

## 6. Next phases (roadmap ke mutabiq, abhi start nahi)

- **Phase 3:** web fetch, shell/code execution, multi-step orchestrator test — phone par `gemini-test.sh` ke baad.
- **Phase 4:** memory/persistence (`jarvis memory`, sessions) inspect + restart-recovery test.
- **Phase 5:** `jarvis-start` daily workflow, model switching (local `qwen3.5:2b` ↔ `gemini-3-flash`), logs.
- **Phase 6 (optional):** voice (`jarvis chat --voice`), Termux:API, self-update (`jarvis self-update`).

**Rule 12 reminder:** existing Nova project (`Sunny-` repo) untouched — sirf ye `openjarvis-setup/` add hua hai.
