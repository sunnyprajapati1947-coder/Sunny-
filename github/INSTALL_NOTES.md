# GitHub Sources — Install Notes

Added 2026-10-28. The four sources below are checked out as git submodules under
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

## 4. FreeVideo (`github/FreeVideo`) — INSTALLED (Python 3.11 workaround)

- Editable install in `github/FreeVideo/.venv`: `freevideo-engine 2026.9.16.41444`
  plus the `runtime` extras (triton 3.7.1, transformers 5.15.0, accelerate 1.14.0,
  peft, huggingface_hub 1.30.0, modelscope-hub, ...). `pip check` is clean.
- CLI verified: `github/FreeVideo/.venv/bin/freevideo --help`
  (subcommands: plan, doctor, generate, bench, calibrate, ...).
- Upstream requires Python `>=3.12,<3.13`. This sandbox only has 3.11 and
  FreeVideo's bootstrap downloads uv/CPython from the GitHub release CDN
  (blocked here), and building CPython 3.12 needs dev headers that are absent.
  The whole `freevideo_engine` package compiles cleanly under 3.11
  (`python3 -m compileall` passed), so it was installed with
  `PIP_IGNORE_REQUIRES_PYTHON=1 ... pip install -e . --no-deps`.
- Only pin deviation: `numpy 2.4.6` instead of `2.5.2` (no cp311 wheel).
  Everything else matches the pinned runtime versions.
- Full setup (`./setup.sh`: ComfyUI + model weights + GPU) is not possible in
  this sandbox — no GPU, and model/ComfyUI downloads are blocked. Torch is not
  in this venv by design; the engine loads it from ComfyUI's environment.

## General

- Activate a Python env with e.g. `source github/OpenMontage/.venv/bin/activate`
  (OmniVoice likewise with `github/OmniVoice/.venv`).
- API keys go in `github/OpenMontage/.env` (never commit it).
