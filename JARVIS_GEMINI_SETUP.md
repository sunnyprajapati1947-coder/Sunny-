# Optional earlier path — Cloud API + Google Gemini

**Current preference changed to no API key / local inference. Is guide ko abhi skip karo; [JARVIS_OFFLINE_SETUP.md](JARVIS_OFFLINE_SETUP.md) follow karo.** Earlier cloud files/config preserve hain, but no key or live API was supplied/used here.

**Phone par OpenJarvis base CLI verified hai. Gemini live inference abhi verify nahi hua hai.** Ab API dependency, secret-free chat profile aur ek small test configure karenge. Google account access/quota tumhare account par depend karega.

## 1. API key — sirf apne phone par

Agar Gemini API key nahi hai, official [Google AI Studio API-key page](https://aistudio.google.com/apikey) apne browser mein kholo. Account/project ki available API key use/create karo aur model availability, quota, billing/terms check karo. **Free/unlimited access guaranteed nahi hai.** API key, Google password ya screenshot of key yahan mat bhejna.

Cloud requests mein prompts/context Google ko jayenge. Personal assistant ka matlab data automatically phone-only nahi hai.

## 2. Ubuntu `(jarvis-venv)` shell mein SDK

```bash
python -m pip install --only-binary=cryptography,cffi "google-genai==2.29.0"
```

```bash
python -m pip check
```

`No broken requirements found.` expected hai. SDK ki requirement ki wajah se `websockets` ka 17.x se compatible 16.x par downgrade normal ho sakta hai; apne aap use dobara upgrade mat karo. GPU/local-tokenizer/audio/video extras nahi chahiye. Error aaye to aage mat badho.

SDK version pinned hai: official SDK README upcoming 3.x changes ke liye pinning recommend karta hai. [Official SDK](https://github.com/googleapis/python-genai).

## 3. Built-in OpenJarvis CLI ke liye private profile

Ye profile **API key store nahi karta**. Existing config overwrite nahi karenge. Same Ubuntu shell mein:

```bash
export OPENJARVIS_HOME=/opt/jarvis-google
umask 077
mkdir -p "$OPENJARVIS_HOME"
```

Neeche ka whole block ek saath paste karo. `noclobber` existing file ko preserve karta hai; already-exists error aaye to rukkar existing file inspect karo, delete/reset mat karo.

```bash
(
set -o noclobber
cat > "$OPENJARVIS_HOME/config.toml" <<'TOML'
[engine]
default = "cloud"

[intelligence]
default_model = "gemini-flash-latest"
preferred_engine = "cloud"
provider = "google"
temperature = 0.2
max_tokens = 512

[agent]
default_agent = "simple"
max_turns = 1
tools = ""
context_from_memory = false
default_system_prompt = "You are Jarvis, the user's personal phone assistant interface, powered by Google Gemini over the internet. Answer concisely in Hindi or Hinglish. This version supports chat only, not phone control, browser actions, trading, video generation or executable skills. Do not claim to perform actions that have not been verified. Never ask for passwords or API keys in chat."
system_prompt = "You are Jarvis, the user's personal phone assistant interface, powered by Google Gemini over the internet. Answer concisely in Hindi or Hinglish. This version supports chat only, not phone control, browser actions, trading, video generation or executable skills. Do not claim to perform actions that have not been verified. Never ask for passwords or API keys in chat."

[tools]
enabled = ""
[tools.mcp]
enabled = false

[analytics]
enabled = false
[telemetry]
enabled = false
gpu_metrics = false
[traces]
enabled = false
[learning]
enabled = false

[server]
host = "127.0.0.1"
agent = "simple"
TOML
)
```

`gemini-flash-latest` official SDK examples ka rolling text-model alias hai, fixed price/version promise nahi. Account par available na ho to provider ki listed text-model ID explicitly choose karenge; no automatic paid fallback.

## 4. API key hidden input se enter karo

**Same Ubuntu shell** mein:

```bash
read -r -s -p "Gemini API key (hidden): " GEMINI_API_KEY
```

Ab key phone ke terminal mein paste karke Enter dabao. Characters show na hona normal hai. Phir:

```bash
printf '\n'
export GEMINI_API_KEY
export GOOGLE_GENAI_USE_ENTERPRISE=false
export GOOGLE_GENAI_USE_VERTEXAI=false
```

Key `read` ke input mein jaati hai, command text/history mein literal export nahi hoti. Is guide mein key disk/Git/config file mein save nahi kar rahe. Current shell/process memory mein rahegi; new session par phir privately enter karni padegi. **`echo $GEMINI_API_KEY`, `env`, debug traces ya `jarvis config show` ka unreviewed output chat mein mat bhejna.**

## 5. Ek small live test (quota/charges ho sakte hain)

Agar provider quota/billing accept hai tab run karo:

```bash
jarvis --quiet ask --engine cloud --model gemini-flash-latest --agent simple --max-tokens 512 --no-stream "Sirf ek chhoti line mein Namaste bolo."
```

Sirf response bhejo. Failure par API key/headers/full unreviewed traceback nahi—HTTP error code aur short non-secret message bhejo.

- **401/403:** key restrictions, project/API access, quota/billing locally check karo.
- **404:** selected model available nahi ho sakta; AI Studio ki current text-model ID check karenge.
- **429:** provider quota/rate limit. Wait/check quota; account rotation/bypass ya blind retry nahi.
- Empty response: model/safety/thinking/token-budget ho sakta hai; successful answer assume nahi karenge.

Output token limit dollar cap/free guarantee nahi; input/other billable tokens aur provider policy apply. Upstream CLI uses its SDK retry behavior. Test working hone ke baad chat/UI/permissions ko individually verify karenge; arbitrary agent/tools/scripts/mining/skills enable mat karo.

## Optional: actual lightweight phone chat wrapper

`jarvis_google.py` ek standalone Gemini chat interface hai jo **pinned OpenJarvis cloud engine** reuse karta hai:

- Default `--check` read-only; API request/key prompt nahi.
- Explicit `--ask`/`--chat` hi live calls karte hain.
- Key hidden prompt/environment se; API-key command-line option/file storage nahi.
- Google Developer API only; 30s timeout, SDK attempts=1, no other-provider fallback.
- Responses max 512 tokens by default (configurable 64–2048), questions max 4000 chars; last 3 turns RAM mein.
- No chat/key persistence by this wrapper; `/reset` clears context.
- No tool, shell, phone, browser, skill, trading or video execution.
- Provider exceptions ki credential-bearing text/traceback print nahi hoti; own key response mein redact hoti hai.
- Framework ka unknown-model `$0` cost estimate **free request ka proof nahi**, isliye wrapper use billing claim ke liye nahi dikhata.

Download/save the provided `jarvis_google.py` file. If it is in the **same Android profile's Downloads** folder, normal Termux mein `termux-setup-storage` permission ke baad `cp -i` se `$HOME/Jarvis` mein copy kar sakte ho. Existing file replace mat karna. Ubuntu re-entry uses the already-established Jarvis folder bind:

```bash
# Normal Termux, not Ubuntu:
termux-setup-storage
cp -i "$HOME/storage/downloads/jarvis_google.py" "$HOME/Jarvis/jarvis_google.py"
proot-distro login --bind "$HOME/Jarvis:/root/Jarvis" jarvis-linux
```

Ubuntu mein:

```bash
. /opt/jarvis-venv/bin/activate
python /root/Jarvis/jarvis_google.py --check
python /root/Jarvis/jarvis_google.py --ask "Sirf Namaste bolo."
```

Ya explicitly interactive chat:

```bash
python /root/Jarvis/jarvis_google.py --chat
```

Hidden key entry phone par hoti hai; key yahan nahi bhejni. If Downloads file cannot be found, stop and check filename/profile transfer; no root/bypass needed. Manual built-in CLI setup above does **not** require this helper file.

## Verification scope

Dependency compatibility and configuration parsing are checked locally. Adapter tests use the real pinned SDK/framework types with **mocked API responses**, not your account/key or real Google inference. Actual Gemini authentication/model/quota/response is **pending your phone's test output**. Other GitHub sources remain planned/deferred; FreeVideo is still remote GPU only, not connected.
