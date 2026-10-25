# JARVIS — the phone app, in English

One Android app. No terminal, no Termux, no server on your PC. The assistant, the
library, the task engine and the video studio all live inside the phone.

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
   notifications → update permission → AI brain → YouTube (all optional).
4. Done. The app announces **"Jarvis ready hai boss"** when it is ready.

If Android says *App not installed* and you had 0.1.0 / 0.3.0 / 0.3.2, uninstall the
old app **once** — those builds used an older signing key. From 0.3.3 onward updates
install in place.

## 2. Two brains (pick one, or use both)

| Brain | Needs | Works offline | Good for |
|---|---|---|---|
| **On-device Qwen3.5 0.8B** — `Settings → Local brain (Qwen3.5)` | a one-time ~470 MB download | yes, after the download | privacy, no key, no internet |
| **Cloud key** — Gemini (free tier), any OpenAI-compatible endpoint, OpenRouter or a local Ollama/LM Studio server | an API key | no | longer answers, better reasoning |

The on-device brain is the latest Qwen generation (Qwen3.5), running through
Transformers.js + ONNX Runtime Web **inside the app**. The engine and the WebAssembly
runtime are bundled with the APK, so nothing is fetched from a CDN.

Honest limits of the on-device model:

- 0.8B parameters. It is a small model: fine for everyday questions, summaries and
  simple code, not a replacement for a big cloud model.
- About **1.4 GB of free RAM**; close heavy apps first.
- Roughly **2–6 tokens/second on the CPU**, faster where WebGPU is available.
- A 10 GB model cannot run inside a phone browser/WebView. That needs `llama.cpp` on a
  computer (`python3 run_jarvis.py model download` / `model start` in the Python app).

## 3. Chat, voice, memory

- Text chat with streaming answers, markdown, copy/share/speak on every reply.
- Voice input (browser/WebView speech service) and spoken answers (on-device TTS).
- Memory: write facts once (“Remember: my name is Sunny…”), and every chat uses them.
- Chat tools: ask in plain language and the assistant can create tasks, check task
  status, search the 1,899-skill library and start a video job.

## 4. Library (offline)

1,899 skills, agents, commands and guides curated from 23 open-source repositories.
Search, read, bookmark, and save a whole pack for offline reading. Content belongs to
its original authors and keeps its own license (MIT / Apache-2.0 …).

## 5. Tasks

Say or type what you want done. JARVIS plans the steps, runs them one by one, retries
failures, and resumes pending work when the app is opened again. Progress is visible
in **Tasks**, with pause / resume / cancel / retry and a foreground-service
notification while work is running.

## 6. Video studio

`Settings → Video studio` (or ask: *"make a video about …"*):

- prompt → AI script → animated text scenes → **WebM saved automatically** to
  `Movies/JARVIS` in the phone gallery;
- vertical, square or landscape;
- share sheet for YouTube / Instagram / X, and a caption box;
- honest limit: this is a scripted, animated video, **not real AI footage**. Real
  footage (Veo, Runway, …) is a separate paid API — it is not included.

## 7. Connections

- **YouTube Data API key** (optional): test the key, search videos/channels in-app.
- **Share sheet**: the safest route to post — the content comes from JARVIS, you tap
  the app you want, and it posts there. JARVIS never gets your Google password.
- **Device card**: permissions, notifications, updates, storage.

## 8. Updates

The app checks GitHub releases at start. When a newer `jarvis-v*` build exists it shows
a banner, downloads the APK and opens the installer. The APK is signed with a stable CI
key (kept in the Actions cache and refreshed weekly), so updates install over the old
app.

## 9. Privacy and security

- API keys and settings stay on the phone (`localStorage`), never in this repository.
- No analytics, no hidden uploads, no third-party SDKs.
- Cloud requests go straight from the phone to the provider you configured.
- The Python server (optional) keeps its token in `~/.openjarvis/dashboard.token`.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `App not installed` | uninstall the older build once (signing key changed before 0.3.3) |
| Local brain fails to download | connect to Wi-Fi; the model comes from Hugging Face. Retry — the download resumes |
| “The phone ran out of memory” | close other apps, or use the CPU path (automatic) |
| Answers are slow | expected on CPU; WebGPU phones are faster. The cloud key is faster |
| Voice input missing | the WebView has no speech service — use a key + chat, or the browser version |
| Update banner does nothing | allow “install unknown apps” for JARVIS in Android settings |

## 11. Still open (honest backlog)

- Real AI footage (paid Veo/Runway key) is not wired.
- Automatic posting to YouTube/Instagram is not done — sharing is manual by design.
- A 4B/8B on-device model needs a native `llama.cpp` build, not a WebView.
- The on-device 0.8B model has not been benchmarked on the OPPO CPH2695 yet; the
  tokens/second figure above is the expected range, not a measured result.

## 12. Developer notes

- Web app source: [`apps/jarvis-pocket`](../../apps/jarvis-pocket) (plain static files,
  no bundler).
- Android wrapper: [`apps/jarvis-app`](../../apps/jarvis-app) (Capacitor).
- Python/Termux app: [`jarvis`](../../jarvis) — see [`README-APP.md`](README-APP.md).
- Tests: `python3 -m unittest tests.test_jarvis_app` (83) and
  `npm --prefix tools/pocket-smoke test` (30 UI checks).
