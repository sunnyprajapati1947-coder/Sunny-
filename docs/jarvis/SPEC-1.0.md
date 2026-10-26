# JARVIS 1.0 — local-only conformance

Status of every requirement in the 1.0 brief, checked against the code in this
repository. `Verified` means a test or a build proves it; `built` means the code
exists and runs but has not been exercised on the OPPO CPH2695 yet; `open` means
it is not done and is not claimed.

Last updated: 2026-10-26 (commit on `arena/faa5e686-sunny`).

## Mandatory constraints

| # | Requirement | Status | Where |
|---|---|---|---|
| 1 | No paid/free AI API, key, cloud LLM, remote inference or cloud embeddings | **built** | `assets/js/llm.js` has no network call at all; the provider table holds one local entry; a stored cloud config is rewritten to local on read. Tests: `test_no_cloud_ai_endpoint_is_shipped`, `test_llm_module_makes_no_network_call`, smoke `no cloud AI endpoint in the shipped code` |
| 2 | No Termux, shell or terminal dependency | **built** | nothing in `assets/js` spawns a process; the code studio runs JavaScript in a sandboxed iframe |
| 3 | All AI inference on-device | **built** | `local-brain.js` → Transformers.js + ONNX Runtime Web inside the WebView; engine and WASM runtime are bundled in `vendor/transformers/` |
| 4 | Internet only for permitted non-AI functions; offline model import | **built** | `model.js` is the only module that downloads (model files). `Model.importFiles` imports the same files from device storage with no network |
| 5 | Supported Android APIs and permissions only, no bypass | **verified in CI** | `AndroidManifest.xml` requests only platform permissions; `apksigner`/`aapt` verify every release |
| 6 | 10 GB budget with runtime measurement, configurable limits, low-memory recovery | **built** | `assets/js/mem.js`: `CAP_MB = 10240`, budget stored in `mem.budgetMb`, measured from `ActivityManager` (`availMem`, `totalMem`, `lowMemory`, `threshold`), guard before load, `recover()` on OOM. Tests: `test_memory_budget_caps_at_ten_gigabytes`, smoke `guard blocks a brain that does not fit the budget`, `memory recovery explains what happened` |

## Required capabilities

| Area | Status | Notes |
|---|---|---|
| Local LLM runtime (quantized, streaming, integrity, offline) | **built** | Qwen3.5 0.8B text build, `q4f16` (WebGPU) or `q4` (CPU), streamed token by token, SHA-256 verify on demand, files streamed straight into CacheStorage |
| Hindi / Hinglish / English chat | **built, not measured** | chat template handles all three; the reply-language setting is `auto` by default. Quality on a 0.8B model is the honest limit |
| Persistent memory (SQLite) | **built** | `JarvisDbPlugin` (SQLiteOpenHelper-free, plain `SQLiteDatabase`) with tables `kv`, `memory`, `docs`, `history`, `projects`, `files`; `db.js` falls back to localStorage in a browser |
| Local knowledge retrieval + document indexing | **built** | `kb.js`: chunking + BM25 over documents stored in SQLite; `search_documents` tool feeds the model |
| Offline STT and TTS | **partial** | STT goes through the platform recogniser with `EXTRA_PREFER_OFFLINE` and reports honestly when the phone has no offline model installed. TTS uses the system engine and reports how many installed voices need no network. Bundling Whisper/Piper is **open** |
| Native tools: apps, files, notes, reminders, notifications, calendar, sharing, media | **built** | `JarvisToolsPlugin` exposes 15 methods; `tools.js` wraps 15 tools with validation |
| Orchestrator with validated calls, permission checks, confirmation, real result capture, post-action verification | **built** | `tools.js`: schema validation, `confirm: true` for open/calendar/reminder/share/link, results carry `ok` + `verified` + `evidence`; chat only reports what the tool returned |
| In-app coding editor + project manager | **built** | `code.js`: projects and files in SQLite, editor, sandboxed preview (`sandbox="allow-scripts allow-modals"`). Execution is HTML/CSS/JS only — no shell, no native code |
| Premium dashboard: model status, resource monitor, task history, privacy controls, diagnostics | **built** | `dash.js`: brain, phone, memory budget, permissions, knowledge base, action log, diagnostics, privacy switches |
| Secure secret storage, local data management, prompt-injection defences, privacy-safe logging | **built** | `JarvisNativePlugin` secret store; memory guard refuses credentials; document text is labelled untrusted in the prompt; logs never include tokens |
| Tests: unit, integration, offline, memory-pressure, permission, release validation | **partial** | 92 Python tests + 60 jsdom checks (including memory-pressure and permission paths) and the CI signature/package verification. On-device instrumentation tests are **open** |

## Acceptance criteria

| Criterion | Status |
|---|---|
| Chat works in airplane mode after the model is installed | **built**, needs the one-time download; `Model.ensure` + `allowRemoteModels` fallback keep it local afterwards |
| No prompt leaves the device | **verified** by static tests (`fetch(` is absent from `llm.js`) |
| Never claim a tool succeeded without a verifiable result | **built**: every result is `ok` + `verified` + `evidence`; chat wording is `Done — verified.` / `Requested (not verifiable by Android).` / `Not done.` |
| Graceful recovery from memory pressure | **built**: guard before load, automatic unload on OOM, dashboard shows the measured numbers |
| Unsupported actions reported honestly | **built**: the router and tools never guess; missing bridge → explicit message |
| Existing features preserved unless documented | **built**: library, tasks, video studio, connections, memory, chat all still ship; the only removal is the cloud brain, which the brief forbids |
| Audit the architecture before adding another runtime | **done**: no second inference runtime was added in this phase |
| Phases: inference → tools → memory → voice → coding → UI → tests | followed in that order across commits |
| No mockups or placeholder handlers counted as done | maintained — anything not wired is listed as `open` above |

## Known limits (stated on purpose)

- The 0.8B model is small: short answers are good, long reasoning is not.
- Android cannot confirm that another app reached the foreground, so `open_app`,
  reminders, notifications, sharing and links stay `unverified` by design.
- `READ_CALENDAR`/`WRITE_CALENDAR` are requested at the moment the first calendar
  action runs, not at install.
- Background survival still depends on the OPPO battery settings for JARVIS.
