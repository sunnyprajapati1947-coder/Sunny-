# SunnyAI

Google AI model routing registry for SunnyAI.

## Provider

SunnyAI uses a configured `GEMINI_API_KEY` from the local environment. No API keys are stored in this repository.

## Capabilities

The registry separates text/coding, image, video, audio, embedding, research, computer-use, and music model targets so the application can route tasks by capability.

## Important

Model availability can depend on the Google account, API project, quota, region, preview status, and current Google API lifecycle. A model being listed in the registry does not guarantee access.

## Apps

- [`apps/ecc-pocket`](apps/ecc-pocket) — ECC Pocket: a phone-first, offline-capable reader/PWA that turns the [affaan-m/ECC](https://github.com/affaan-m/ECC) skills, agents, commands and rules into a searchable installable app. **Live: <https://ecc-pocket.vercel.app>**
- [`jarvis/`](jarvis) — **JARVIS app**: a local-first, stdlib-only personal assistant for Termux/Debian (Python 3.11+, zero pip installs). **Qwen3.5 4B Q4 brain** (the latest Qwen generation, 2.74 GB GGUF via llama.cpp, `python3 run_jarvis.py model download && model start`, 10 GB hard cap) or Gemini with a key; **1,899 skills** (1,889 imported from 23 curated GitHub packs + 10 native runnable ones) taught to the model through an atlas + `skill_search`/`skill_show`; **online hands** (`http_request`, `download_file` — approval-gated, SSRF-guarded, size-capped); hands-free voice with the "Jarvis" wake word, SQLite memory, a crash-safe task engine, permissioned tools with single-use approvals, a mobile dashboard at `127.0.0.1:8787`, and one-command public access via a tunnel. 83 tests + 34 dashboard UI checks. Start with `python3 run_jarvis.py doctor`. Guide: [`docs/jarvis/README-APP.md`](docs/jarvis/README-APP.md)
- [`apps/jarvis-pocket`](apps/jarvis-pocket) — Jarvis Pocket: a pocket AI assistant with **Qwen3.5 running on the phone** (Transformers.js + ONNX Runtime Web, bundled, offline after one download) or your own model key; grounded in 1,899 skills, agents, commands and guides curated from 23 open-source agent repositories, with voice, memory and an offline library. Fully English UI. **Live: <https://jarvis-pocket-red.vercel.app>** · 30 jsdom UI checks
- **JARVIS Android APK (no terminal)** — installable app with an **on-device Qwen3.5 brain**, a task queue (retries + resume), video studio (prompt → WebM → gallery), connections hub, first-run setup wizard and in-app updates. **One-tap install: <https://jarvis-pocket-red.vercel.app/install.html>** · APK: [latest release](https://github.com/sunnyprajapati1947-coder/Sunny-/releases) · English guide: [`docs/jarvis/APP-GUIDE.md`](docs/jarvis/APP-GUIDE.md) · Python guide: [`docs/jarvis/README-APP.md`](docs/jarvis/README-APP.md)
