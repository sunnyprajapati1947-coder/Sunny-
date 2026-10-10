# Current mode — bina API key, phone par local Jarvis

**Latest user preference: API key nahi chahiye.** Earlier Gemini setup ab current path nahi hai. API key/account banane ki zaroorat nahi. Existing Ubuntu/Python/OpenJarvis installation preserve karenge; Gemini code/config ko delete karna zaroori nahi.

Phone: ARM64, ~7.44 GiB reported total RAM, earlier ~26 GB free storage. Ubuntu Python 3.12.3 + OpenJarvis CLI `1.0.5.dev75+g764cfc1` verified. **Native engine install complete:** user ne Termux `llama-cpp 0.6.0` install karke `llama-server --version` → Clang 21.0.0, Android aarch64 report kiya. **Weights, local inference aur OpenJarvis connection abhi verified nahi hain.** Step 4A repeat nahi karna; next Step 4B hai.

**Correction from actual phone log:** the earlier Q4_K_M filename was unavailable. The phone listed only `Qwen3-1.7B-Q8_0.gguf` in this official repository. Use the corrected Q8_0 command below; GPU warnings are expected on this CPU-only setup. Previous model loading failed and the server exited; no inference succeeded. Q8 needs more memory/data than Q4, so do not assume its performance until tested.

User now permits online use. This allows downloads and individually reviewed web/phone tools; it does not require or silently enable a cloud model/API key.

## Architecture

- **Native Termux:** Android-compiled `llama-cpp` CPU server.
- **Ubuntu/Python 3.12:** existing OpenJarvis client, pointing only to the phone's loopback server.
- **Model candidate:** public `Qwen/Qwen3-1.7B-GGUF`, Q8_0, one model, context 2048, CPU threads 4, GPU layers 0, parallel slot 1.
- **Initial internet:** package + roughly about 2 GB (estimate) model download and cache overhead. Actual size/access must be checked by the phone's download client. No provider API key required. After successful caching, server's `--offline` mode can avoid model-network access.
- Small model ki quality/speed cloud Gemini ya fictional Jarvis jaisi guaranteed nahi. Temperature, battery, other apps aur CPU performance matter karte hain. Web/API/browser/remote-GPU capabilities independently internet/auth/hardware maang sakti hain.

Termux's current [official package build](https://github.com/termux/termux-packages/blob/master/packages/llama-cpp/build.sh) lists native aarch64 support (32-bit arm/i686 excluded), CPU runtime and optional GPU addons. **GPU addons install nahi kar rahe.** Packaged source `v0.6.0` argument definitions were reviewed; the user has now confirmed native phone version `0.6.0`.

Qwen's [official README](https://github.com/QwenLM/Qwen3) documents llama.cpp, small dense models and Apache-2.0 open-weight licensing. Keep the downloaded model/repository license notices. No weights have been downloaded by the coding agent.

## Step 4A — complete (reference only; reinstall nahi karna)

Agar prompt `(jarvis-venv) root@localhost...` hai, Ubuntu se normal Termux par wapas jao:

```bash
exit
```

Ab **normal Termux** mein:

```bash
pkg install llama-cpp
```

```bash
llama-server --version
```

**User output mein engine version already confirm ho gaya hai; next Step 4B hai.** Future package error par third-party curl-to-shell installer blindly mat chalao. `pkg` ko Ubuntu ke andar mat chalao.

## Step 4B — version check ke baad explicit first model download

Normal Termux mein ye foreground command roughly about 2 GB (estimate) model download/data/battery use kar sakti hai. Model file explicit hai taaki missing quant par kisi larger first file ka fallback select na ho:

```bash
llama-server -hf Qwen/Qwen3-1.7B-GGUF:Q8_0 --hf-file Qwen3-1.7B-Q8_0.gguf --no-mmproj --host 127.0.0.1 --port 8080 --alias jarvis-local -c 2048 -t 4 -tb 4 -b 128 -ub 128 -n 256 --parallel 1 -ngl 0 --jinja --reasoning off --no-agent --cors-origins http://127.0.0.1:8080,http://localhost:8080
```

- `--no-agent` keeps llama.cpp built-in tools disabled; custom phone actions will go through the separate approval boundary. CORS is restricted to the phone-local UI origins, rather than all origins. This is not authentication or isolation from other local apps.
- Download/file/version error aaye to stop and report. Do not remove `--hf-file` to grab an unknown bigger model automatically.
- CPU-only initial path hai; `--reasoning off` avoids enabling Qwen's long-thinking mode by default. `-n 256` sets an initial generation limit; browser/client requests also have their own limits.
- Model loading mein time lag sakta hai. Terminal busy rehna normal hai: **server running hai**.
- Is terminal ko band mat karo. `Ctrl+C` stops the server. Chat ke liye another Termux session/browser use karo.
- Port already in use ho to existing process blindly kill mat karo. Error bhejo; separate port choose/configure karenge.
- Android background process stop kar sakta hai. Keep Termux running; no root/bypass is needed.

If packaged WebUI is available, **same phone's browser** mein:

```text
http://127.0.0.1:8080
```

Ye standard llama.cpp chat UI/model smoke test hai, completed custom Jarvis Android UI nahi. Loopback is not strong isolation from other apps on the same phone; no LAN/public bind or external tunnel is enabled.

## Step 4C — second Termux session se OpenJarvis connect

Termux mein left edge se swipe → **NEW SESSION**. Existing server session running rakho.

Optional read-only local status:

```bash
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/v1/models
```

Model loaded hone ke baad health normally `ok`/models data return karega. Loading ke waqt 503 ho sakta hai. Empty output/error ko inference success mat samajhna.

Native Termux se:

```bash
proot-distro login --bind "$HOME/Jarvis:/root/Jarvis" jarvis-linux
```

Ubuntu mein:

```bash
. /opt/jarvis-venv/bin/activate
export OPENJARVIS_HOME=/opt/jarvis-local
export NO_PROXY=127.0.0.1,localhost,::1
export no_proxy="$NO_PROXY"
unset GEMINI_API_KEY GOOGLE_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY OPENROUTER_API_KEY DEEPSEEK_API_KEY MINIMAX_API_KEY ATLASCLOUD_API_KEY NIM_API_KEY LLAMACPP_API_KEY
```

`unset` sirf current Ubuntu shell environment par apply hota hai; earlier files/account keys delete/revoke nahi hote. No key is needed for the local server. New home previous Gemini/default config ko overwrite nahi karta.

### Local secret-free profile

If provided `jarvis_offline.py` has been copied to bound `/root/Jarvis`, optional generator:

```bash
python /root/Jarvis/jarvis_offline.py --write-profile
```

Manual alternative (doesn't require downloading helper):

```bash
umask 077
mkdir -p "$OPENJARVIS_HOME"
(
set -o noclobber
cat > "$OPENJARVIS_HOME/config.toml" <<'TOML'
[engine]
default = "llamacpp"
[engine.llamacpp]
host = "http://127.0.0.1:8080"

[intelligence]
default_model = "jarvis-local"
preferred_engine = "llamacpp"
provider = "local"
temperature = 0.7
max_tokens = 256

[agent]
default_agent = "simple"
max_turns = 1
tools = ""
context_from_memory = false
default_system_prompt = "You are Jarvis, a personal local chat assistant on Android using a small Qwen model. Reply concisely in Hindi or Hinglish. Chat only: no phone control, browser, trading, video or executable skills. Do not claim to perform actions. Never request passwords or API keys."

[tools]
enabled = ""
[tools.mcp]
enabled = false
[analytics]
enabled = false
[telemetry]
enabled = false
[traces]
enabled = false
[learning]
enabled = false
TOML
)
```

Existing profile error aaye to preserve it and inspect, reset/delete nahi.

### Small local inference test

Ubuntu/venv mein:

```bash
jarvis --quiet ask --engine llamacpp --model jarvis-local --agent simple --max-tokens 256 --no-stream "Sirf ek chhoti line mein Namaste bolo."
```

Is command mein cloud model/API key use nahi hoti. Actual phone response ke baad hi inference verified count karenge. No phone action tools, skill execution or trading is enabled.

## Baad mein truly cache-only server startup

Successful first model caching ke baad **normal Termux** mein same server command ko `--offline` ke saath run kar sakte ho:

```bash
llama-server -hf Qwen/Qwen3-1.7B-GGUF:Q8_0 --hf-file Qwen3-1.7B-Q8_0.gguf --no-mmproj --host 127.0.0.1 --port 8080 --alias jarvis-local -c 2048 -t 4 -tb 4 -b 128 -ub 128 -n 256 --parallel 1 -ngl 0 --jinja --reasoning off --no-agent --cors-origins http://127.0.0.1:8080,http://localhost:8080 --offline
```

Missing/incomplete cached model par error aayega, silent download nahi. Initial download ki zaroorat ko bina internet working claim se hide nahi kar rahe.

## Workspace deliverables and status

- `jarvis_offline.py`: read-only plan by default; explicit `--write-profile` makes a new secret-free local config without overwrite. No model/server/install/API execution.
- `config/jarvis-local.toml.example`: matching local-only profile.
- `automation/jarvis_offline.sh`: default prints commands; `--install`, `--serve`, `--offline-serve` are explicit native-Termux actions. Refuses Ubuntu/desktop execution; foreground server only.
- These are unpublished workspace files; ordinary GitHub cloning doesn't automatically include them. Manual commands above work without copying them.
- No real phone engine install/model download/inference has been performed by the coding agent. Full ten-source integration/voice/Android APK remains unfinished. FreeVideo remains unsupported as this phone's native generator.
