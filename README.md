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
- [`jarvis/`](jarvis) — **JARVIS app**: a local-first, stdlib-only personal assistant for Termux/Debian (Python 3.11+, zero pip installs). Streaming chat with Gemini or a local llama.cpp lane, **1,899 skills** (1,889 imported from 23 curated GitHub packs + 10 native runnable ones), hands-free voice with the "Jarvis" wake word, SQLite memory, a crash-safe task engine, permissioned tools with single-use approvals, a mobile dashboard at `127.0.0.1:8787`, and one-command public access via a tunnel. Start with `python3 run_jarvis.py doctor`. Guide: [`docs/jarvis/README-APP.md`](docs/jarvis/README-APP.md)
- [`apps/jarvis-pocket`](apps/jarvis-pocket) — Jarvis Pocket: a pocket AI assistant (bring your own model key) grounded in 1,889 skills, agents, commands and guides curated from 23 open-source agent repositories, with voice, memory and an offline library. **Live: <https://jarvis-pocket-red.vercel.app>**
