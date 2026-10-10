# Personal Jarvis — brain, memory aur permission-gated hands

## Current phone status / correction

- Native Termux `llama-cpp 0.6.0` (Clang 21, Android aarch64) installed and version verified by user.
- Ubuntu Python 3.12.3 + pinned OpenJarvis CLI installed/verified.
- **Previous model command failed.** Coding agent wrongly assumed Q4_K_M existed in the official repo. Actual phone log listed **only `Qwen3-1.7B-Q8_0.gguf`**. No model was loaded; server exited. GPU warning is expected for CPU-only inference, not the main error.
- User allows online use now. **API-key requirement has not been silently reintroduced**: brain remains local; approved web/phone tools may use internet.

## 1. Corrected brain startup — normal Termux

About **2 GB model download (estimate)** plus overhead; more memory/data than Q4. Phone-specific size/loading/speed still need verification. No provider API key/signup. Read the applicable model license/terms; official Qwen3 open-weight README points to Apache-2.0 notices.

```bash
llama-server -hf Qwen/Qwen3-1.7B-GGUF:Q8_0 --hf-file Qwen3-1.7B-Q8_0.gguf --no-mmproj --host 127.0.0.1 --port 8080 --alias jarvis-local -c 2048 -t 4 -tb 4 -b 128 -ub 128 -n 256 --parallel 1 -ngl 0 --jinja --reasoning off --no-agent --cors-origins http://127.0.0.1:8080,http://localhost:8080
```

- Exact file is based on **your repository listing**, not another guessed quant filename.
- CPU only; optional GPU addons don't solve this file error.
- `--no-agent`: don't give llama.cpp all built-in tools/MCP/browsing permissions automatically.
- CORS is limited to the phone-local browser UI origins. It is **not authentication**, and other local apps can still reach loopback.
- Keep foreground server running. Ctrl+C stops it. If 8080 is occupied, do not blindly kill another process.
- If Android kills it / memory is too high / download fails, report the error. We'll inspect a smaller model's actual files before naming another quant; no automatic bigger/premium fallback.

Second Termux session (left swipe → NEW SESSION):

```bash
curl -fsS --max-time 10 http://127.0.0.1:8080/health
```

Only `{"status":"ok"}` after loading proves readiness; actual inference still needs a reply. If bundled WebUI exists, same phone browser: `http://127.0.0.1:8080`. This is the model's UI, not a completed custom Jarvis APK.

**Latest progress:** user reported local `/health` → `{"status":"ok"}`. Actual reply is still pending. Phone starter transfer/extraction failed because the ZIP was absent at the expected Downloads path; Python missing-file errors are a consequence, not a model/venv fault. Do not reinstall Termux or repeat storage setup to solve it.

## 2. Downloadable personal starter kit

### Preferred persistent delivery — public GitHub branch

The preview curl link returned **HTTP 403**, so it was not a dependable phone delivery route. No ZIP was downloaded; checksum/unzip/Python missing-file errors followed. User explicitly approved publishing source/starter to the public repository on the tracked session branch. `main` is not changed or merged.

Once the branch is published and verified, native Termux can directly clone **the public source**, with no GitHub/provider API key, storage permission, ZIP extraction or preview URL:

```bash
git clone --depth 1 --single-branch --branch arena/0ad0d18b-sunny https://github.com/sunnyprajapati1947-coder/Sunny-.git "$HOME/Jarvis/jarvis-github"
```

After clone succeeds:

```bash
cd "$HOME/Jarvis/jarvis-github"
python jarvis_personal.py --status
python jarvis_personal.py --chat
```

Commands are separate to avoid HTML-escaped shell operators. Stop at any error. Clone refuses an existing non-empty destination; do not delete/reset it. The native model server must remain running in the other Termux session. Cloning without `--recurse-submodules` does not download/install the upstream Gitlink projects or activate ten runtimes. The app's `/sources` and approved `/fetch` remain the source review path.

No model, user note, API key or credential was added for public delivery. Publishing the starter is not proof of live phone inference/tool readiness.

### Viewer/browser download alternative

Provided **`jarvis-phone-starter.zip`** contains:

- `jarvis_personal.py`: own CLI interface, local brain client, explicit SQLite owner notes, approved phone/web actions.
- Existing Nova `core/tool_registry.py`, Termux tools and `security/*` boundary reused, not replaced.
- `jarvis_start.py`: all ten pinned source roles + safe source-only downloader.
- Local deployment helper/profile and these guides.

**No models, secrets, `.env`, OAuth tokens, preinstalled upstream packages, or user chats are bundled.** Tiny source kit only. Workspace changes are not automatically available from GitHub; this downloadable file is the delivery path.

If downloaded into the **same Android profile's Downloads**, normal Termux:

```bash
termux-setup-storage
pkg install unzip
unzip -n "$HOME/storage/downloads/jarvis-phone-starter.zip" -d "$HOME/Jarvis"
cd "$HOME/Jarvis/jarvis-phone-starter"
python jarvis_personal.py --status
```

`-n` preserves existing files. If Downloads file isn't found, check actual filename/profile transfer; no root/permission bypass or deleting existing Jarvis is needed.

Native Termux Python 3.14 works for this stdlib starter; OpenJarvis's separate Python 3.12 stays in Ubuntu. The native app uses the same OpenAI-compatible localhost model protocol; it doesn't claim the whole upstream OpenJarvis framework was ported into native Python 3.14.

## 3. Start the personal interface

Keep C++ server running in its original Termux session, then in the kit directory:

```bash
python jarvis_personal.py --chat
```

Try `Namaste, tum kya kar sakte ho?` only after model health is ready. Text is sent **only to numeric loopback `127.0.0.1`**; env proxies and redirects are not used. No hosted inference/API key is requested. Small model can still make mistakes; no claim of unlimited intelligence or fictional capabilities.

### Memory

```text
/remember Mera naam Sunny hai
/confirm THE_TOKEN_SHOWN_FOR_THIS_ACTION
/notes
```

Use the **actual token printed** after reviewing the exact action; the token label above is not a value to copy literally. Notes are saved only after owner confirmation, in `~/.jarvis-personal/memory.sqlite3` (private directory/file). This is not a password vault. Model conversations are not silently saved as notes. Up to 700 characters of recent notes may be included in local chat as **data**, not authority. Context is small; long/complex input can overflow.

### Hands — actual bounded starter functions

```text
/battery
/notify Jarvis | Namaste
/say Namaste
/open https://github.com
```

- Battery is read-only. Notification/TTS/browser opening need **one-time owner confirmation**.
- Source download and note save also require confirmation.
- The program never executes shell strings, GitHub README/skill instructions, or commands generated in model text.
- `/confirm` can approve only the original stored arguments; it doesn't accept replacement arguments.
- `/stop` disables registered tools and cancels pending actions. `/resume` asks the owner to type YES locally.
- Return values are marked untrusted using the existing Nova boundary. Nested `success: false` means the tool failed even if the boundary returned successfully.

**Phone plugin readiness is still unknown.** Battery/notifications/speech need Termux:API command package and compatible Android plugin/permissions. Browser opening can use native `termux-open-url`. Check command availability with `python jarvis_personal.py --status` before enabling more. Android TTS may use internet depending on selected voice; do not promise all speech stays offline.

Official plugin guide: https://github.com/termux/termux-api . App and plugin must be from a compatible signing source. Don't uninstall existing Termux or enable broad permissions blindly. Package alone is not proof that plugin/Android permissions work.

## 3b. Hinglish, "Sunny ji" aur voice (owner-only settings)

**Update the phone copy first** (after this commit is pushed):

```bash
cd "$HOME/Jarvis/jarvis-github" && git pull
python jarvis_personal.py --chat
```

**Language rule.** Default reply Hinglish mein (Roman letters) hoga. Devanagari/Hindi sirf tab jab aap message mein saaf likhein, jaise `Hindi mein bolo` ya `in Hindi`. Sirf Devanagari mein likhna Hindi jawab ki request nahi maana jata. Model agar galti se Devanagari de de, to ek baar Hinglish mein dobara jawab maanga jata hai.

**Address.** Default naam `Sunny ji` hai. Badalne ke liye:

```text
/call Sunny ji
/prefs
```

Naam 1–30 characters ka ho sakta hai (letters, digits, space, `.`, `'`, `-`). Quotes, newline ya HTML/prompt-like text reject hota hai.

**Voice (default OFF).** Jarvis ke replies bolne ke liye:

```text
/voice engines          # installed TTS engines list (read-only)
/voice engine NAME      # optional; /voice engine default clears it
/voice lang en-IN       # or hi-IN; /voice lang default clears it
/voice pitch 1.1        # 0.5–2.0, default 1.1
/voice rate 0.95        # 0.5–2.0, default 0.95
/voice test             # ek sample line bolega
/voice on               # ab har Jarvis reply bolega
/voice off
```

Verified from the Termux:API source (`scripts/termux-tts-speak.in`): `termux-tts-speak` accepts only `-e engine`, `-l language`, `-n region`, `-v variant`, `-p pitch`, `-r rate`, `-s stream`. There is **no voice-name or gender option**. So a "sweet female voice" depends on which installed Android TTS engine and voice the phone uses for that language. Pitch only brightens the tone; it does not make a male voice female. Choose a female-sounding voice in Android/Google TTS settings first, then test with `/voice test`.

Important limits:

- Voice settings and the address are changed only by your typed `/` commands. Model text like "voice on karo" or `/call X` in a reply does nothing.
- Voice replies do not use approval tokens. They only speak text that the model already produced. They are not a tool the model can call.
- Each reply is spoken at most about 400 characters (cut at a word boundary); full text is still printed.
- Speaking waits until the line finishes, so the chat pauses briefly.
- Some Android TTS engines may use the internet; that is engine-dependent, so keep `/voice off` if you don't want that.
- `/say TEXT` remains a separate confirmed one-time speech action.

Settings are stored only in `~/.jarvis-personal/preferences.json` (private file). A corrupt file falls back to defaults (voice off, `Sunny ji`).

**Honest capability note.** Default brain is a small 1.7B Q8 local model on the phone. It can be warm and organized in Hinglish, but it will not match large cloud models in knowledge or reasoning. Do not expect "unlimited" or futuristic abilities from this local model. A bigger local model is possible only after a separate RAM/storage test on your phone.

## 4. All ten GitHub sources in the starter

`/sources` shows all ten roles, pins, requirements and license warnings. `/fetch SOURCE_ID` requests an approved, pinned **source-only** download (no installer/runtime/model execution). Example `/fetch public-apis`, then review and confirm its real token.

| Source | Honest current integration state |
|---|---|
| OpenJarvis | Ubuntu CLI verified; shared local-model profile; native starter uses compatible loopback protocol |
| jev-ultrafast | External browser automation candidate; `/open` is basic Android browser launch, NOT Jev integration |
| laya | Routing-model candidate deferred; not the chat brain, no PyTorch/weights installed |
| Graft | Coding context candidate, Node/native tests pending; not personal memory |
| TradingAgents | Research candidate disabled; no broker/order execution |
| FreeVideo | Planned remote compatible GPU only; no working local Android generator |
| build-your-own-x | Tutorial/reference links; no detected repo license, no blind content copying |
| public-apis | API discovery/reference; each actual connector/terms/auth reviewed separately |
| free-programming-books | Reference list; no books bulk downloaded/trained into the brain; linked rights differ |
| awesome-agent-skills | Discovery list; individual executable skills NOT installed/audited automatically |

**All ten are cataloged; all ten runtimes are NOT working integrations.** Clone/source download is not activation. We must separately test useful adapters, permissions, hardware and licenses. FreeVideo's documented GPU/memory target cannot be created by optimizing wrappers on this phone.

## Verification scope

Starter tests use fake local-model responses and mocked phone/browser/source/TTS actions. They also verify Hinglish/Devanagari retry rules, `Sunny ji` address validation, voice-off default, validated voice settings, the verified `termux-tts-speak` flags, and that model text cannot change settings or trigger speech. They verify one-time approval, original-argument binding in the app, no model-text command execution, credential URL rejection, key-free loopback requests, private notes, stop switch and ten-source catalog. No actual phone hands/live model/inference/API plugin test has been completed by the coding agent. Next evidence is your successful model health/response and app/tool outputs.
