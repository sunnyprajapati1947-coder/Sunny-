# J.A.R.V.I.S. — MARK VII

**Just A Rather Very Intelligent System** — a local-first voice assistant with a
cinematic HUD, real system control, long-term memory and a security envelope
that stops anything destructive without explicit authorization.

Built into this repository alongside the existing Nova automation layer. Jarvis
never routes through Nova; it owns its tools, its approval gate and its audit
trail.

```
python3 jarvis.py            # HUD on http://localhost:7777
python3 jarvis.py --cli      # terminal console
python3 jarvis.py --cli --voice --wake    # hands-free terminal mode
python3 jarvis.py --check    # self-diagnostic
```

The assistant is **stdlib-only by default**. Optional packages
(`requirements-jarvis.txt`) upgrade telemetry, terminal speech and vision.

---

## 1. What it can do

The feature set follows the *Jarvis 2.0* build series by NetHyTech (43 episodes):
speech recognition, TTS, automation, music, alarms, time management, internet
checks, vision, weather and WhatsApp automation — reimplemented here as a
maintainable Python package with a browser HUD.

| Area | Commands (examples) |
| --- | --- |
| Identity & conversation | “who are you”, “how are you”, “tell me a joke”, “quote of the day” |
| Time & date | “time”, “date”, “set an alarm for 6:30 am”, “cancel all reminders” |
| Timers & reminders | “set a 5 minute timer”, “remind me to stretch in 20 minutes”, “what are my reminders” |
| Notes & tasks | “make a note buy milk”, “add task finish report”, “what's on my plate” |
| Memory | “remember my favourite colour is teal”, “what is my favourite colour”, “forget …” |
| File management | “list files”, “find file report”, “read file notes.txt”, “create file mission.txt with …”, “delete file …” |
| Web knowledge | “search python decorators”, “wikipedia Ada Lovelace”, “news about ISRO” |
| Weather | “weather”, “weather in Mumbai” (Open-Meteo, offline city table fallback) |
| Communication | “send a WhatsApp to 9876543210 saying I am late”, “email boss@example.com about the report”, “call ravi” |
| Media | “play music”, “play lofi on youtube”, “pause music”, “what's playing” |
| System control | “status”, “battery”, “network speed”, “volume 40”, “brightness 70”, “open youtube”, “lock screen”, “shutdown” |
| Vision | HUD eye button → image → description (needs `GEMINI_API_KEY`) |
| Briefing | “brief me” — time, weather, tasks, reminders, battery, storage in one call |

Everything is available in the HUD, the terminal, and over HTTP.

---

## 2. The HUD

`web/` is a self-contained interface: no CDN, no build step, no external fonts.

* **Arc reactor** — canvas core that changes colour and cadence with state
  (standby, listening, thinking, speaking, alert).
* **Telemetry** — live CPU / memory / disk gauges, host, IP, latency, battery,
  module count, session uptime.
* **Conversation** — rich cards for weather, news, articles, files, timers,
  reminders, quotes, contacts, drafts and calculations.
* **Mission control** — pending reminders, running timers and alarms; live event
  feed for background events.
* **Approval modal** — every high-impact action shows its summary, token and a
  180-second countdown. Nothing executes without *Authorize*.
* **Voice** — browser `SpeechRecognition` (Chrome/Edge best) and
  `speechSynthesis`; optionally gate commands behind the wake word.
* **Settings** — owner, city, recognition language, wake word, speech rate,
  spoken replies, interface sounds, music folder, cloud reasoning toggle.

Accessibility: keyboard focus rings, `aria-live` conversation, reduced-motion
support, and a responsive layout down to phones.

The HUD is served from `/`; assets live under `/assets/`.

---

## 3. Command line

```
$ python3 jarvis.py --cli
J.A.R.V.I.S. · Mark VII · Sir · Patna · brain: offline
> remind me to call the bank at 6 pm
> /status     /tools     /history     /voice     /wake     /mute     /help     /exit
```

`--voice` speaks replies through `pyttsx3`, `espeak-ng` or `say`; `--wake`
requires the wake word before a command is accepted.

`--check` prints a 14-point diagnostic (Python, tool registry, telemetry,
network, Gemini link, display, audio mixer, Termux bridge, STT/TTS, brain mode,
local Qwen lanes).

---

## 4. HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | uptime probe |
| GET | `/api/status` | identity, metrics, brain, scheduler, stats, settings |
| GET | `/api/history?limit=` | conversation log |
| GET | `/api/events?since=` | incremental background events |
| GET | `/api/agenda` | reminders, timers, alarms (with remaining seconds) |
| GET | `/api/suggestions` | contextual command chips |
| GET | `/api/tools` | registered tools grouped by category |
| GET | `/api/settings` | public settings (never the API key) |
| POST | `/api/command` | `{text, source}` → assistant envelope |
| POST | `/api/approve` \| `/api/deny` | `{token}` for the approval gate |
| POST | `/api/vision` | `{image: dataURL, question}` |
| POST | `/api/settings` | partial settings patch |
| POST | `/api/clear` | clear conversation history |
| GET | `/api/file?path=` | serve an image/text file from the data folder |

A command response looks like:

```json
{
  "ok": true,
  "reply": "Timer armed for 30 seconds, Sir.",
  "speech": "Timer set, Sir.",
  "cards": [{"type": "timer", "label": "Timer", "duration": "30 seconds"}],
  "action": null,
  "approval": null,
  "data": {"id": "timer-…", "due": "2026-10-26T11:20:00"},
  "meta": {"intent": "timer_set", "tool": "timer_set", "provider": "intent",
           "ms": 4, "source": "text", "server_ms": 4}
}
```

High-impact actions return `approval: {token, tool, summary, expires_in}` instead
of executing. Approving the token runs the tool once; tokens are single-use and
expire after 180 seconds.

---

## 5. Security envelope

* **One tool registry** — `jarvis/tools.py` declares 66 tools with argument
  schemas, categories and `high_impact` flags. Intents and the LLM planner both
  execute through `JarvisCore.call()`, so validation, approval and audit always
  apply.
* **Approval gate** — power, WhatsApp, email, calls, app closing, file
  creation/deletion, note/todo clearing, shortcuts and screen vision all require
  a one-time token.
* **Preflight checks** — a tool can answer before approval is requested (missing
  contact, unknown file path, empty message), so a token is never wasted on a
  guaranteed failure.
* **No shell** — commands run as argument arrays; only allow-listed binaries,
  and shell metacharacters are rejected.
* **Path confinement** — file operations resolve inside `$HOME` or the Jarvis
  data folder; credential-shaped files are refused for reading.
* **Danger screen** — mass deletion, disk formatting and fork bombs are blocked
  before any tool is considered.
* **Audit trail** — JSON lines in `logs/jarvis_audit.jsonl`: every execution,
  approval request, grant, denial, block and tool fault.

---

## 6. Configuration

Defaults come from `config/jarvis.env.example` (safe, no secrets). Copy it to
`config/jarvis.env` and edit; the loader also reads `config/nova.env` and real
environment variables, which always win.

| Variable | Default | Meaning |
| --- | --- | --- |
| `JARVIS_OWNER` | `Sir` | how the assistant addresses you |
| `JARVIS_CITY` | `Patna` | weather default |
| `JARVIS_LANGUAGE` | `en-IN` | recognition / voice locale |
| `JARVIS_WAKE_WORD` | `jarvis` | wake phrase |
| `JARVIS_WAKE_WORD_ENABLED` | `false` | require the wake word |
| `JARVIS_HOST` / `JARVIS_PORT` | `0.0.0.0` / `7777` | HTTP bind |
| `JARVIS_SPEAK` / `JARVIS_SOUND` | `true` | speech and UI sound |
| `JARVIS_VOICE_RATE` | `0.98` | TTS rate |
| `JARVIS_MUSIC_DIR` | `~/Music` | local library for “play music” |
| `JARVIS_LLM_ENABLED` | `true` | allow cloud/local reasoning |
| `GEMINI_API_KEY` or `JARVIS_GEMINI_KEY` | — | Gemini reasoning + vision |
| `JARVIS_QWEN_URL` | `http://127.0.0.1:8080/v1/chat/completions` | local Qwen lane |
| `JARVIS_FAST_QWEN_URL` | `http://127.0.0.1:8081/v1/chat/completions` | fast local lane |
| `JARVIS_DATA_DIR` | `data/jarvis` | state, notes, files |

Without any model key the assistant is fully functional offline: intents, tools,
memory, telemetry, timers and the HUD all run locally. The brain chain is
Gemini → local Qwen (`:8080`) → fast Qwen (`:8081`) → deterministic fallbacks.

Every setting above is also editable in the HUD, except secrets.

---

## 7. Files and data

```
jarvis.py                 launcher (HUD / CLI / diagnostics)
jarvis/
  config.py               settings, env loading, validation
  security.py             approval gate, audit, path confinement, danger screen
  intents.py              deterministic NLU (English + Hinglish)
  tools.py                central registry (66 tools)
  brain.py                Gemini / Qwen planner, vision, cooldowns
  core.py                 orchestrator: handle → intent/LLM → tool → envelope
  scheduler.py            reminders, timers, alarms, battery/disk watchdogs
  server.py               stdlib HTTP server + static HUD
  cli.py                  terminal console, voice, diagnostics
  skills/                 system, files, web, weather, media, productivity,
                          communication, vision
web/                      HUD (index.html, assets/app.css, assets/app.js)
config/jarvis.env.example settings template
data/jarvis/state.json    notes, tasks, reminders, timers, contacts, memory
logs/jarvis_audit.jsonl   audit trail (git-ignored)
logs/jarvis.log           server log
```

`data/jarvis/` and `logs/` are git-ignored: they are personal state, not source.

---

## 8. Optional upgrades

```
pip install -r requirements-jarvis.txt
```

* `psutil` — accurate CPU, memory, disk, battery.
* `pyttsx3` — terminal speech output.
* `SpeechRecognition` + `pyaudio` — terminal speech input.
* `Pillow`, `pyperclip` — image helpers and clipboard.

Browser speech (HUD) needs none of these.

For cloud reasoning set one key:

```
export GEMINI_API_KEY=...      # reasoning + vision
python3 jarvis.py
```

For a local model, run any OpenAI-compatible server on `:8080` / `:8081`
(Qwen via llama.cpp or Ollama) and point `JARVIS_QWEN_URL` at it.

---

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| HUD shows `NO LINK` | the server stopped; restart `python3 jarvis.py` |
| Mic button disabled | browser lacks SpeechRecognition — use Chrome/Edge or the text channel |
| Voice input blocked | allow microphone permission for the origin |
| No sound | check browser autoplay policy; click once, then enable “Spoken replies” |
| Vision unavailable | set `GEMINI_API_KEY`; vision has no offline fallback |
| Weather/news offline | outbound HTTPS is blocked; the assistant offers a search link |
| Port busy | `--port 7788` (or let it walk forward automatically) |
| Wake word ignored | “Wake word listening” must be on, then say “Jarvis, …”. |

---

## 10. Verification

```
python3 jarvis.py --check                  # 14-point self diagnostic
python3 -m unittest discover -s tests      # Nova + repo test suite
```

The Jarvis layer has no third-party test dependency; the HTTP surface can be
exercised with `curl`:

```
curl -s localhost:7777/api/status | python3 -m json.tool
curl -s -X POST localhost:7777/api/command \
     -H 'Content-Type: application/json' \
     -d '{"text":"set a 2 minute timer","source":"text"}' | python3 -m json.tool
```

---

## 11. Credits

Feature scope inspired by the public **Jarvis 2.0** tutorial playlist by
*Anubhav Chaturvedi / NetHyTech*. This is an independent implementation: the
architecture, security model, tools and interface were written for this
repository and do not reuse the tutorial's source code or its third-party
assets. Voice cloning segments of that series were intentionally not reproduced.
