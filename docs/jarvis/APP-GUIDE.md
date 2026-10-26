# JARVIS 1.0 — the local-only phone app

One Android app. No terminal, no Termux, no server on your PC, no API key and no cloud
model. The assistant, its brain, the memory database, the library, the task engine and
the video studio all live inside the phone.

- **Install page (QR + one tap):** <https://jarvis-pocket-red.vercel.app/install.html>
- **Web version (same UI, PWA):** <https://jarvis-pocket-red.vercel.app/>
- **APK releases:** <https://github.com/sunnyprajapati1947-coder/Sunny-/releases>

> The long original guide [`README-APP.md`](README-APP.md) is still in Hinglish and
> covers the Python/Termux side. This file is the English guide for the Android app.
> The app itself is fully English.

---

## 1. Install (2 minutes)

1. Open the install page on the phone and tap **Download APK** (Android 8+).
2. Allow your browser or Files app under **Install unknown apps**.
3. Open **JARVIS**. The setup wizard appears on first launch:
   notifications → update permission → on-device brain → permissions/YouTube.
4. Open **Settings → Local brain → Download** once (~490 MB on Wi-Fi).
5. Done. The app announces **"Jarvis ready hai boss"** when it is ready, and chat works
   in airplane mode from then on.

If Android says *App not installed* and you had 0.1.0 / 0.3.0 / 0.3.2, uninstall the
old app **once** — those builds used an older signing key. From 0.3.3 onward updates
install in place.

## 2. One brain, and it is on the phone

JARVIS 1.0 has exactly one brain: **Qwen3.5 (text build)** running inside the app through
Transformers.js + ONNX Runtime Web. The engine and the WebAssembly runtime are bundled in
the APK, so nothing is fetched from a CDN.

| Piece | What it is |
|---|---|
| Model | `onnx-community/Qwen3.5-0.8B-Text-ONNX` |
| WebGPU phones | `model_q4f16` (~467 MB) |
| CPU-only phones | `model_q4` (~544 MB) |
| Memory | ~1.4 GB free RAM while loaded |
| Speed | roughly 2–6 words/second on a phone CPU, faster with WebGPU |

The model manager does the download itself, so every failure is legible:

- **Download** streams each file straight into the phone cache with progress, speed and ETA.
- **Mirror fallback**: official host first, then the mirror you paste (for example
  `hf-mirror.com`), then an attachment-style URL.
- **Diagnose** shows the HTTP status and latency of every source, plus cache/WebGPU/storage
  state, so a blocked network is obvious instead of a mystery toast.
- **Verify files** hashes every model file (SHA-256 from the Hugging Face listing) on the phone.
- **Import from storage** installs the model with no internet at all: copy
  `config.json`, `generation_config.json`, `tokenizer.json`, `tokenizer_config.json` and the
  `onnx/model_q4*.onnx` + `.onnx_data` pair from a computer, then pick those files.
- **Delete downloads** removes only the model entries from the cache.

An older setting that pointed at a cloud provider is migrated to local when read, and the
cloud code path is gone from the shipped UI: no key field, no provider picker.

Honest limits of the on-device model:

- 0.8B parameters. Good at everyday questions, short code and summaries; it is not a
  data-centre model and it says so when it does not know.
- About **1.4 GB of free RAM**; close heavy apps first.
- Roughly **2–6 words/second on the CPU**, faster where WebGPU is available.
- A 10 GB model cannot run inside a phone WebView. Bigger models belong to `llama.cpp`
  on a computer, which is the Python side of this repository.

## 3. Chat, voice, memory

- Text chat with streaming answers, markdown, copy/share/speak on every reply.
- Voice input: the installed app prefers the **on-device recogniser** and asks for the
  microphone permission the first time. Spoken answers use the phone's TTS engine.
- Memory lives in **SQLite** on the phone (memories, notes, tool history), with a
  localStorage fallback in the browser. The memory guard refuses anything that looks like
  a password, token or private key.
- Documents: paste text or import a `.txt`/`.md`/`.json`/`.csv` file on the **Dashboard**.
  It is split into passages and ranked with BM25 on the phone — no embeddings service.
- Commands that touch the phone are routed deterministically: *battery*, *storage*,
  *open <app>*, *save note …*, *remind me to … in 10 minutes*, *search my documents for …*.
  They work before the model is installed, and they never invent success.

## 4. Verified phone tools

Every action is a single, declared tool with validated arguments. Sensitive ones ask first.

| Tool | Verified how |
|---|---|
| `device_stats` | read from ActivityManager, StatFs and the battery broadcast |
| `list_apps` | read from PackageManager |
| `open_app` | intent accepted — Android does **not** let an app confirm the other app reached the screen, so this is reported **unverified** |
| `write_note` | the file is written and read back with the same SHA-256 |
| `add_calendar_event` | the event is written and then read back from the provider |
| `set_reminder` | the clock app was opened — **unverified**, because the alarm lives in that app |
| `media_control` | media key sent, then `AudioManager.isMusicActive()` is read |
| `notify`, `share_text`, `open_url` | dispatched — **unverified** by design |
| `search_knowledge` | local BM25 scores |
| `remember` | written to SQLite (after the secret guard) |

The rule: **`ok` is only true when the phone actually did the thing**, and a second field
says whether the result is `verified` or merely dispatched. Android restrictions are
reported, never simulated.

## 5. Dashboard

`Settings → Dashboard` (route `#/dash`) shows, live:

- on-device brain state and file count;
- RAM, storage, battery, cores, Android version (installed app only);
- permission state with **Allow** buttons for microphone, calendar and notifications;
- the local knowledge base (index a document, search it);
- recent tool calls with their verification status;
- cache/storage diagnostics and privacy switches (clear memories, clear documents).

## 6. Library (offline)

1,899 skills, agents, commands and guides curated from 23 open-source repositories.
Search, read, bookmark, and save a whole pack for offline reading. Content belongs to
its original authors and keeps its own license (MIT / Apache-2.0 …).

## 7. Tasks

Say or type what you want done. JARVIS plans the steps, runs them one by one, retries
failures, and resumes pending work when the app is opened again. Progress is visible
in **Tasks**, with pause / resume / cancel / retry and a foreground-service
notification while work is running.

## 8. Video studio

`Settings → Video studio` (or ask: *"make a video about …"*):

- prompt → AI script → animated text scenes → **WebM saved automatically** to
  `Movies/JARVIS` in the phone gallery;
- vertical, square or landscape;
- share sheet for YouTube / Instagram / X, and a caption box;
- honest limit: this is a scripted, animated video, **not real AI footage**. Real
  footage (Veo, Runway, …) is a separate paid API — it is not included.

## 9. Connections

- **YouTube Data API key** (optional): test the key, search videos/channels in-app.
- **Share sheet**: the safest route to post — the content comes from JARVIS, you tap
  the app you want, and it posts there. JARVIS never gets your Google password.
- **Device card**: permissions, notifications, updates, storage.

## 10. Updates

The app checks GitHub releases at start. When a newer `jarvis-v*` build exists it shows
a banner, downloads the APK and opens the installer. The APK is signed with a stable CI
key (kept in the Actions cache and refreshed weekly), so updates install over the old
app.

## 11. Privacy and security

- API keys and settings stay on the phone (`localStorage`), never in this repository.
- No analytics, no hidden uploads, no third-party SDKs.
- Cloud requests go straight from the phone to the provider you configured.
- The Python server (optional) keeps its token in `~/.openjarvis/dashboard.token`.

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| `App not installed` | uninstall the older build once (signing key changed before 0.3.3) |
| Local brain fails to download | connect to Wi-Fi; the model comes from Hugging Face. Retry — the download resumes |
| “The phone ran out of memory” | close other apps, or use the CPU path (automatic) |
| Answers are slow | expected on CPU; WebGPU phones are faster. The cloud key is faster |
| Voice input missing | the WebView has no speech service — use a key + chat, or the browser version |
| Update banner does nothing | allow “install unknown apps” for JARVIS in Android settings |

## 13. Still open (honest backlog)

- Real AI footage (a paid model) is not wired; the studio writes the script and renders
  animated scenes locally, saved to the gallery.
- Automatic posting to YouTube/Instagram is not done — sharing is manual by design.
- A 4B/8B on-device model needs a native `llama.cpp` build, not a WebView.
- The on-device 0.8B model has not been benchmarked on the OPPO CPH2695 yet; the
  tokens/second figure is the expected range, not a measured result.
- The in-app coding editor is not built yet. What exists is honest: the video studio,
  notes and the knowledge base, not a code IDE.
- Background survival still depends on OPPO battery settings (allow auto-start and
  "no restrictions" for JARVIS). The foreground service is real; the OEM is the variable.
- `open_app`, reminders, notifications, sharing and links cannot be confirmed by Android.
  They are always labelled unverified; that is a platform limit, not a bug.

## 14. Developer notes

- Web app source: [`apps/jarvis-pocket`](../../apps/jarvis-pocket) (plain static files,
  no bundler).
- Android wrapper: [`apps/jarvis-app`](../../apps/jarvis-app) (Capacitor).
- Python/Termux app: [`jarvis`](../../jarvis) — see [`README-APP.md`](README-APP.md).
- Tests: `python3 -m unittest tests.test_jarvis_app` (83) and
  `npm --prefix tools/pocket-smoke test` (37 UI checks, including the engine wiring and
  an English-only guardrail).
- Web deploy: the app is static, so `build.sh` (repo root) copies
  `apps/jarvis-pocket` into `dist/`. The Vercel project `jarvis-pocket` builds with
  `bash build.sh` and output `dist`; a deployment is created with `build.sh` and a
  `yarn.lock` in its file list (the API rejects raw JSON file contents, and without a
  lockfile Vercel treats the upload as a static site and skips the build).
- The on-device engine is vendored: `transformers.web.min.js.gz` (decompressed at
  runtime), `ort.bundle.min.mjs`, `ort-wasm-simd-threaded.jsep.{mjs,wasm}`.
