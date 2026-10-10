# SunnyAI

Google AI model routing registry for SunnyAI.

## Provider

SunnyAI uses a configured `GEMINI_API_KEY` from the local environment. No API keys are stored in this repository.

## Capabilities

The registry separates text/coding, image, video, audio, embedding, research, computer-use, and music model targets so the application can route tasks by capability.

## Important

Model availability can depend on the Google account, API project, quota, region, preview status, and current Google API lifecycle. A model being listed in the registry does not guarantee access.

## Personal Jarvis on Android: first steps

See [JARVIS_START_HERE.md](JARVIS_START_HERE.md) for Termux starting commands and a reviewed map of the ten requested GitHub sources. The standalone `jarvis_start.py` helper provides non-secret device diagnostics, a read-only source catalog, and explicit one-at-a-time pinned source downloads.

This is a foundation, not a complete Android app or a working integration of those projects. No upstream runtime, skill, browser action, or financial execution is enabled automatically. The existing Nova core and approval boundary are preserved.

### Reported phone profile and next commands

The reported device is ARM64 with ~7.44 GiB total RAM, ~26 GB free storage, and native Python 3.14.6. See [JARVIS_PHONE_SETUP.md](JARVIS_PHONE_SETUP.md) for the next Ubuntu 24.04/Python 3.12 commands. `python jarvis_start.py --phone-plan` prints the plan without executing it; `automation/prepare_jarvis_linux.sh` defaults to printing commands and requires explicit `--apply` for base-environment preparation.

The user has now confirmed Ubuntu Python 3.12.3 and the active `/opt/jarvis-venv`. [JARVIS_CORE_INSTALL.md](JARVIS_CORE_INSTALL.md) provides the next pinned base-CLI install and verification commands. `automation/install_jarvis_core.sh` is dry-run by default and guards explicit installation to the prepared Linux/Python 3.12 venv. The same source passed installation/CLI smoke checks on sandbox Linux x86_64/Python 3.11. The user has now also reported successful `pip check`, `jarvis --version` (`1.0.5.dev75+g764cfc1`), and `jarvis --help` on the ARM64 phone in Ubuntu/Python 3.12.3. **Base CLI is verified; model/backend and personal phone-tool integration are not configured yet.** **Current user preference: no API key, local/offline inference.** Follow [JARVIS_OFFLINE_SETUP.md](JARVIS_OFFLINE_SETUP.md): native Termux `llama-cpp`, one small Qwen3-1.7B Q8_0 model, and the existing Ubuntu OpenJarvis client over phone loopback. `jarvis_offline.py` defaults to a read-only plan and can explicitly create a new secret-free local profile. `automation/jarvis_offline.sh` defaults to printing commands; installation/server startup/cache-only mode require explicit native-Termux actions. **Native phone engine verified:** the user installed Termux `llama-cpp 0.6.0` and reported `llama-server --version`, built with Clang 21.0.0 for Android aarch64. **Model loading failed:** the earlier Q4 filename was not available in the official repository. The user's listing confirmed `Qwen3-1.7B-Q8_0.gguf`; local commands now use that exact Q8 file, with CPU limits, built-in agent tools off and phone-local CORS. The user now reported `http://127.0.0.1:8080/health` → `{"status":"ok"}`. Server readiness is verified; actual model reply/identity and phone tools are not yet verified. Starter installation failed because the ZIP was absent in Downloads; the attempted temporary preview URL then returned HTTP 403. User approved publishing the code/starter on the public session branch for persistent GitHub source delivery, leaving main untouched. See the direct Git clone instructions in JARVIS_PERSONAL_SETUP.md. User permits online tools but no cloud API key is assumed.

### Brain + memory + approved hands prototype

[`jarvis_personal.py`](jarvis_personal.py) adds a native, stdlib personal CLI using the existing Nova tool registry, audit, untrusted-output and approval/kill-switch boundary. The brain can call only numeric loopback (no proxy/redirect/cloud fallback); local SQLite notes are explicit/approved; phone notification/TTS/browser actions require one-time confirmation of the original arguments. Model replies never execute actions. All ten sources are available as a read-only catalog and approved pinned **source-only** fetches, not ten enabled runtimes.

See [JARVIS_PERSONAL_SETUP.md](JARVIS_PERSONAL_SETUP.md) and the downloadable `jarvis-phone-starter.zip` for transfer/run instructions. Termux:API plugin/permissions and actual phone hands/inference are not verified; browser automation, heavy routing, trading and GPU video remain deferred.

The earlier Gemini option remains available but is **not the current setup path**. `jarvis_google.py` is an optional standalone cloud chat adapter with hidden local key entry, no tools, bounded timeout/retries, and three recent turns in RAM. No user key was supplied or stored here; no live Gemini request was performed. Existing files are preserved. All other upstream integrations remain deferred.

FreeVideo is the tenth source, classified as a **planned remote GPU module**, not a local Android runtime. Neither installing Ubuntu nor customizing wrappers creates the NVIDIA hardware/memory its documented Linux engine requires. Its model weights have a separate license.
