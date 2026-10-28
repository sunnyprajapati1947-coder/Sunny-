# GitHub Sources — Install Notes

Added 2026-10-28. The three sources below are checked out as git submodules under
`github/` and their dependencies are installed for local development.

## 1. OmniVoice (`github/OmniVoice`) — INSTALLED

- Editable install in `github/OmniVoice/.venv` (Python 3.11, torch 2.15, transformers 5.21, omnivoice 0.2.1).
- Use: `github/OmniVoice/.venv/bin/omnivoice-infer --help` (also `omnivoice-demo`, `omnivoice-infer-batch`).
- No GPU in this environment (`torch.cuda.is_available() == False`); inference runs on CPU.
- Models download from HuggingFace on first run (needs network access to huggingface.co).

## 2. Duix-Avatar (`github/Duix-Avatar`) — PARTIAL

- `npm install --ignore-scripts` completed (604 packages).
- `better-sqlite3` rebuilt from source against local Node headers (`npm_config_nodedir=/usr/local`); verified working.
- Electron app **binary not downloaded**: GitHub release-asset CDN
  (`objects.githubusercontent.com`) is blocked in this sandbox, so
  `node node_modules/electron/install.js` fails with a TLS error.
- Skipped `electron-builder install-app-deps` postinstall (needs Electron headers
  from electronjs.org, also unreachable here).
- Runtime also requires Docker images (`guiji2025/fun-asr`, `guiji2025/fish-speech-ziming`)
  and a display — neither is available in this sandbox.

## 3. OpenMontage (`github/OpenMontage`) — INSTALLED

- `make setup` completed: `.venv` with `requirements.txt`, Piper TTS, Remotion
  composer `npm install`, HyperFrames npx cache, `.env` created from `.env.example`.
- FFmpeg 7.0.2 (static, via `imageio-ffmpeg`) linked at `~/.local/bin/ffmpeg`.
  Add it to PATH: `export PATH="$HOME/.local/bin:$PATH"`.
- `make preflight` and `make hyperframes-doctor` both pass (doctor reports optional
  extras missing: FFprobe, Chrome headless, whisper-cpp, Docker).

## General

- Activate a Python env with e.g. `source github/OpenMontage/.venv/bin/activate`
  (OmniVoice likewise with `github/OmniVoice/.venv`).
- API keys go in `github/OpenMontage/.env` (never commit it).
