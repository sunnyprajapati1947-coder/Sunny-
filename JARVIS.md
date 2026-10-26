# J.A.R.V.I.S. — MARK XI

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
python3 jarvis.py --brain    # local Qwen lanes, runtime, recommendation
python3 jarvis.py --brain-setup   # exact Ollama / llama.cpp commands
python3 jarvis.py --agent "goal"  # multi-step agent, plan saved to disk
```

**v1.5.0** plugs Jarvis into **free model routes**: point it at a local
FreeLLMAPI or OmniRoute gateway and the whole free-model catalogue becomes a
brain lane — one key, no bill. **v1.4.0** gave Jarvis a **real hand on the
phone**: place calls, send SMS, post notifications, buzz, torch, volume,
clipboard, speak, camera, contacts, location and the notification shade — all
through Termux:API, with honest fallbacks on a PC. It sits on top of v1.3.0's
**desktop control** (type, hotkeys, mouse, window focus, screen OCR), **real
sending** (SMTP email, `.ics` calendar events, WhatsApp auto-send), the
**installable PWA** and the approval-gated **coding agent** — **123 tools**,
still stdlib-only by default.

The assistant is **stdlib-only by default**. Optional packages
(`requirements-jarvis.txt`) upgrade telemetry, terminal speech and vision.

---

## 1. What it can do

The feature set follows both NetHyTech build series — *Jarvis 2.0* (43 episodes)
and *Jarvis 1.0* (41 episodes): speech recognition, TTS with multiple voices,
automation, music, alarms, time management, internet checks, vision, weather,
translation, random advice, YouTube SEO and WhatsApp automation — reimplemented
here as a maintainable Python package with a browser HUD.

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
| Welcome home | “I'm home”, “daddy's home”, “wake up Jarvis” — greeting with pending work |
| Advice | “give me some advice”, “motivate me” (Advice Slip API + offline lines) |
| Translation | “translate good morning to Hindi”, “how do you say thank you in French”, “hindi me bolo good night” |
| Creator tools | “YouTube SEO for a Python tutorial” — titles, description, tags |
| Bulk memory | “import data from notes.json” — up to 500 facts from JSON/CSV/TXT |

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
* **Settings** — owner, city, recognition language, wake word, **voice picker with
  preview (male/female/regional)**, speech rate, spoken replies, interface sounds,
  music folder, cloud reasoning toggle.

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

One-shot commands, handy over SSH or in scripts:

```
python3 jarvis.py --brain          # which lanes are alive, what to install
python3 jarvis.py --brain-setup    # copy-paste Ollama / llama.cpp commands
python3 jarvis.py --test-brain     # ping the fastest lane, report latency
python3 jarvis.py --agent "tidy my downloads folder"
python3 jarvis.py --plans          # persistent plans and their progress
python3 jarvis.py --memory qwen    # search the memory journal
```

Inside the HUD/CLI you can also type: `brain status`, `brain setup`,
`test local brain`, `ask local <question>`, `agent do <goal>`, `make a plan to …`,
`show plans`, `complete step 2 of plan …`, `search memory for …`,
`adhd mode on|off`, `map the repo`.

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
| GET | `/api/desktop` | desktop control status (armed, display, OCR) |
| GET | `/api/plans` | persistent plans with steps and progress |
| GET | `/api/memory` | memory journal statistics and recent observations |
| POST | `/api/command` | `{text, source}` → assistant envelope |
| POST | `/api/approve` \| `/api/deny` | `{token}` for the approval gate |
| POST | `/api/vision` | `{image: dataURL, question}` |
| POST | `/api/desktop` | `{armed: true/false}` — arm or panic-lock input |
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

* **One tool registry** — `jarvis/tools.py` declares 115 tools with argument
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
| `JARVIS_VOICE` | auto (British male) | preferred `speechSynthesis` voice name |
| `JARVIS_VOICE_RATE` | `0.98` | TTS rate |
| `JARVIS_MUSIC_DIR` | `~/Music` | local library for “play music” |
| `JARVIS_LLM_ENABLED` | `true` | allow cloud/local reasoning |
| `GEMINI_API_KEY` or `JARVIS_GEMINI_KEY` | — | Gemini reasoning + vision |
| `JARVIS_QWEN_URL` | `http://127.0.0.1:8080/v1/chat/completions` | local Qwen lane |
| `JARVIS_FAST_QWEN_URL` | `http://127.0.0.1:8081/v1/chat/completions` | fast local lane |
| `JARVIS_CODER_QWEN_URL` | deep lane | coding lane (Qwen2.5-Coder) |
| `JARVIS_QWEN_MODEL` | `qwen2.5:7b-instruct` | deep lane model name |
| `JARVIS_FAST_QWEN_MODEL` | `qwen3:4b` | fast lane model name |
| `JARVIS_CODER_QWEN_MODEL` | `qwen2.5-coder:7b` | coder lane model name |
| `JARVIS_BRAIN_MODE` | `auto` | `auto` \| `local` \| `gemini` \| `offline` |
| `JARVIS_AGENT_ENABLED` | `true` | allow the multi-step agent loop |
| `JARVIS_AGENT_STEPS` | `5` | step budget, clamped to 1–12 |
| `JARVIS_ADHD_MODE` | `false` | focus-mode output by default |
| `JARVIS_SMTP_HOST` | — | mail server (e.g. `smtp.gmail.com`) |
| `JARVIS_SMTP_PORT` | `587` | 587 STARTTLS, 465 SSL |
| `JARVIS_SMTP_USER` / `JARVIS_SMTP_PASSWORD` | — | SMTP login (Gmail app password) |
| `JARVIS_SMTP_FROM` | user | From address |
| `JARVIS_SMTP_TLS` | `true` | STARTTLS on port 587 |
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
  tools.py                central registry (115 tools)
  brain.py                provider chain: Gemini / local Qwen planner, vision
  local_brain.py          lane discovery, Qwen catalog, RAM recommendations
  agent.py                bounded plan→act→observe loop, repo map
  plans.py                task_plan.md / findings.md / progress.md on disk
  memory.py               observation journal + BM25 retrieval + compression
  adhd.py                 focus-mode output shaping
  core.py                 orchestrator: handle → intent/LLM → tool → envelope
  scheduler.py            reminders, timers, alarms, battery/disk watchdogs
  server.py               stdlib HTTP server + static HUD
  cli.py                  terminal console, voice, diagnostics
  skills/                 system, desktop, phone (Termux:API hand), files, web,
                          weather, media, productivity, communication
                          (SMTP/WhatsApp/calendar), vision, assistant
                          (brain/agent/memory)
web/                      HUD (index.html, assets/, manifest.webmanifest, sw.js)
automation/termux_jarvis.sh  Android install / start / stop launcher
config/jarvis.env.example settings template
data/jarvis/state.json    notes, tasks, reminders, timers, contacts, memory, prefs
data/jarvis/memory.jsonl  append-only observation journal (memory v2)
data/jarvis/plans/        task_plan.md, findings.md, progress.md per goal
data/jarvis/files/*.ics   calendar events you can import anywhere
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
| Translation unavailable | offline phrasebook covers common phrases; arbitrary text needs a Gemini key or internet |
| Wrong voice | open Settings → Assistant voice → PREVIEW, then save |

---

## 10. Verification

```
python3 jarvis.py --check                  # 14-point self diagnostic
python3 -m unittest tests.test_local_brain  # 21 brain/agent/memory tests
python3 -m unittest tests.test_desktop_comms # 18 desktop/comms/PWA tests
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

## 11. Jarvis 1.0 additions

The second playlist — *Build Your Own Jarvis 1.0 Desktop Assistant* (41 episodes) —
adds these capabilities to the same core:

| Episode theme | Implementation |
| --- | --- |
| Speech-to-text, advanced listen (ep 2) | browser `SpeechRecognition`, terminal `--voice --wake` |
| TTS, British Brian, female & 11 voices (3, 11, 25, 27) | voice picker + preview in Settings, `JARVIS_VOICE` |
| Brain / ML model, second model, brain optimisation (5–7, 19, 38) | Gemini → Qwen → fast Qwen → offline chain |
| Wish & welcome, “daddy's home” (8, 29) | “I'm home” → `wake_greeting` with pending work |
| Online/offline checks (14, 39) | `network_info`, live `LINK` pill, brain lane probe |
| Random advice (15) | `random_advice` — Advice Slip API with an offline line bank |
| All-possible automation (12, 16) | 115-tool registry: apps, volume, brightness, files, media, brain, agent |
| Big data import (18) | `import_data` — JSON/CSV/TXT into long-term memory, 500 rows, secrets skipped |
| Battery monitoring (20) | telemetry gauges + scheduler power alerts |
| Wikipedia, Google, YouTube search (21–23) | `wikipedia`, `web_search`, `play_music` YouTube fallback |
| Play music on YouTube (24) | `play_music` — local library first, YouTube search fallback |
| Internet speed (28) | `internet_speed` via Cloudflare speed endpoint |
| Time, jokes, IP, temperature (30–33) | `get_time`, `joke`, `network_info`, `weather` |
| Speed & code optimisation, driver-free (34, 37) | stdlib server, no Chrome driver, 2 s telemetry cache |
| Speech recognition & translation (35) | `translate_text` — phrasebook → MyMemory → neural |
| LLM integration (36, 39) | planner with JSON tool calls and approval-aware execution |
| YouTube SEO for creators (40) | `seo_pack` — 6 titles, description, tags, hashtags |
| Zero to hero recap (41) | `--check` diagnostics + this document |

**Dataset format** for `import_data` (JSON shown; CSV/TXT use `key: value` or `key = value`):

```json
{
  "favourite food": "litti chokha",
  "office": "Patna, Bihar",
  "project code": "MARK VII"
}
```

Values that look like credentials (tokens, passwords, keys) are skipped and
reported, never stored.

---

## 12. Local brain, agent loop and memory (v1.2.0)

This release mines the best patterns from 22 public agent/AI repositories and
folds them into the existing modules — no project was vendored wholesale.

### 12.1 The local Qwen brain

`jarvis/local_brain.py` discovers **OpenAI-compatible** local servers and routes
by task:

| Lane | Default endpoint | Purpose | Suggested model |
| --- | --- | --- | --- |
| `fast` | `127.0.0.1:8081` | routing, short answers | `qwen3:4b` |
| `deep` | `127.0.0.1:8080` | planning, reasoning | `qwen2.5:7b-instruct` |
| `coder` | deep lane | code, repo work | `qwen2.5-coder:7b` |
| `ollama` | `127.0.0.1:11434` | auto-detected fallback | whatever you pulled |

* **Discovery** — each lane is probed with `GET /v1/models` (~1.1 s, cached 12 s);
  if the server reports a different model, the live model wins. Nothing is ever
  downloaded by Jarvis.
* **Catalog** — 11 Qwen builds (Qwen3 1.7B/4B/8B, Qwen2.5 7B/14B/32B,
  Coder 7B/14B, Qwen3 30B-A3B MoE, VL 7B) with RAM, context and role metadata.
* **Recommendation** — `≥28 GB RAM → 32B`, `≥18 → 14B`, `≥11 → 8B`, `≥6 → 4B`,
  otherwise 1.7B. Shown in the HUD and by `brain status`.
* **Routing** — `JARVIS_BRAIN_MODE`:
  * `auto` — Gemini first when a key exists, then local Qwen, then offline core
    (the local lane is retried after an 8 s failure cooldown);
  * `local` — Qwen only; ideal on a laptop with no cloud key;
  * `gemini` — cloud only;
  * `offline` — deterministic intents only.
* **Local vision** — `brain.vision` now tries Gemini first (when keyed) and then a
  local Qwen-VL model on the deep lane, so the HUD camera button still describes
  images with no cloud access (`ollama pull qwen2.5vl:7b`).
* **Honest failure** — with no lane running the assistant still answers; the HUD
  shows which lanes are down and `brain setup` prints the exact commands:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3:4b
ollama serve            # Jarvis auto-detects :11434
# Windows:
winget install Ollama.Ollama
ollama pull qwen3:4b
# or, without Ollama:
llama-server -m Qwen3-4B-Instruct-Q4_K_M.gguf -c 32768 --port 8080
```

### 12.2 The agent loop

`jarvis/agent.py` runs a bounded **plan → act → observe** loop (1–12 steps,
default 5). Each step asks the chosen lane for exactly one JSON action, executes
a registered tool, and appends the observed result to a scratchpad. It stops on
a final reply, an unknown tool, the step cap, or an approval gate it cannot
cross. The plan itself lives on disk (`data/jarvis/plans/<slug>/`):

```
task_plan.md   goal, status, numbered checklist
findings.md    evidence gathered
progress.md    timestamped log of each step and its result
```

`plan_show`, `plan_update` and `agent resume` read those files, so progress
survives a restart, a context wipe or a crash. `repo_map` adds a cheap
repository summary (languages, key files, pruned tree, ignored directories) so
the model reasons about real structure instead of guessing.

### 12.3 Memory v2

`jarvis/memory.py` keeps an append-only `memory.jsonl` of observations
(`preference`, `decision`, `fact`, `note`, `episode`). Retrieval is BM25-style
with recency and importance boosts; every 20 turns the session is compressed
into a single episode observation. Credentials are refused at write time.
`memory_save`, `memory_search` (empty query → statistics) and
`python3 jarvis.py --memory <query>` expose it.

### 12.4 Focus mode (ADHD-friendly)

Inspired by *i-have-adhd*: `focus_mode on` (or `adhd mode on`) makes model prose
lead with the action, bullet the steps, cap replies at ~90 words and finish with
one concrete next move (also rendered as a gold `NEXT ACTION` card). Deterministic
tool output is left untouched. The system prompt carries the same instruction so
the local model complies without post-processing tricks.

### 12.5 HUD

The right rail gains a **NEURAL CORE** panel: lane dots with live latency, the
recommended model for your RAM, memory/plan counters, and `SETUP` / `TEST` /
`FOCUS` buttons that issue real commands. Settings gains brain routing, agent
step budget, agent and focus-mode switches.

### 12.6 Verification

```bash
python3 -m unittest tests.test_local_brain -v      # 21 tests
python3 -m unittest tests.test_desktop_comms -v    # 18 tests
python3 jarvis.py --check                          # includes brain mode + lanes
```

The lane contract is tested against a fake OpenAI-compatible server, so the
HTTP path is exercised even on a machine with no model installed.

### 12.7 Credits for the v1.2.0 patterns

| Source | Pattern adopted (reimplemented) |
| --- | --- |
| [open-jarvis/OpenJarvis](https://github.com/open-jarvis/OpenJarvis) | local-first lanes, starter model guidance, doctor-style status |
| [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) | role-specialised model routing (analyst/coder lanes) |
| [morluto/rea](https://github.com/morluto/rea) | planning before acting, explicit tool loops |
| [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya) | layered agent/assistant separation |
| [anthropics/claude-code](https://github.com/anthropics/claude-code) | tool schemas, approval gates, concise system prompts |
| [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) | memory compression into observations |
| [tt-a1i/archify](https://github.com/tt-a1i/archify) | plan/architecture visualisation ideas for the HUD |
| [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | structured skill manifests |
| [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | task artefacts that outlive a chat |
| [Egonex-AI/Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) | repository maps as model context |
| [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | open agent loop conventions |
| [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) | focus-mode output shaping |
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | reusable SEO/content skill shape (feeds `seo_pack`) |
| [wshobson/agents](https://github.com/wshobson/agents) | small single-purpose agents, bounded steps |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | skill catalog structure |
| [nanocoai/nanoclaw](https://github.com/nanocoai/nanoclaw) | lightweight sandboxing instincts for tool runs |
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | modular skill files |
| [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files) | `task_plan.md` / `findings.md` / `progress.md` |
| [teng-lin/notebooklm-py](https://github.com/teng-lin/notebooklm-py) | offline-first Python client taste |
| [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | skill discoverability |
| [yusufkaraaslan/Skill_Seekers](https://github.com/yusufkaraaslan/Skill_Seekers) | skill discovery/selection heuristics |
| [Jakeschincariol/youtube-agent-skill](https://github.com/Jakeschincariol/youtube-agent-skill) | YouTube creator workflow (feeds `seo_pack`) |

All of the above remain third-party projects under their own licences; only
ideas and patterns were adapted, and every line here is original code written
for this repository.

---

## 13. Desktop control, real sending, the phone hand and the phone app

### 13.1 Desktop control

Jarvis can now actually drive the machine instead of only launching apps.

| Command | What happens |
| --- | --- |
| `arm desktop control` | unlocks keyboard/mouse actions (stored as a preference) |
| `type <text>` | types into the active window; long text goes through the clipboard |
| `press ctrl+s` | sends hotkeys (`alt+tab`, `cmd+shift+4`, …) |
| `click at 400 300` / `double click at …` | moves the pointer and clicks |
| `list windows` | prints visible window titles |
| `focus chrome` | brings a window to the front |
| `what's on my screen` | screenshots, reads it with Tesseract OCR, falls back to local Qwen-VL |
| `desktop panic` | locks input immediately |

**Platform backends**

| OS | Input | Windows | OCR |
| --- | --- | --- | --- |
| Linux X11 | `xdotool` | `wmctrl` | `tesseract` + scrot/gnome-screenshot |
| Windows | PowerShell + `user32` (`SendKeys`, `SetCursorPos`, `mouse_event`) | PowerShell `AppActivate` | PowerShell screen capture + Tesseract |
| macOS | AppleScript (+ `cliclick` for mouse) | AppleScript | `screencapture` + Tesseract |

Install the optional helpers:

```bash
# Linux
sudo apt install xdotool wmctrl tesseract-ocr scrot
# macOS
brew install tesseract cliclick
# Windows
winget install UB-Mannheim.TesseractOCR
```

**Safety.** Nothing types or clicks until you arm it, every call is audited, shell
metacharacters are rejected, `ctrl+delete` style destructive combos are blocked,
and `desktop panic` locks the layer without restarting Jarvis. Reading the screen
is passive and needs no arming; it is still logged.

### 13.2 Real sending

| Feature | How it works |
| --- | --- |
| Email | `send email directly to you@example.com about … saying …` → SMTP with STARTTLS/SSL, approval required |
| Calendar | `schedule dentist tomorrow at 5 pm` → real `.ics` file + a reminder 10 minutes before; the HUD card downloads it into any calendar |
| WhatsApp | normal mode opens `wa.me` with the text prefilled; `auto send whatsapp to ravi: …` drives WhatsApp Desktop (armed + approval), then presses Enter |

SMTP is configured in `config/jarvis.env` (never in the HUD, never logged):

```
JARVIS_SMTP_HOST=smtp.gmail.com
JARVIS_SMTP_PORT=587
JARVIS_SMTP_USER=you@gmail.com
JARVIS_SMTP_PASSWORD=your-app-password
JARVIS_SMTP_FROM=you@gmail.com
```

Gmail needs an **app password** (2-Step Verification → App passwords); normal
passwords are rejected. Without SMTP the assistant says so and offers the setup
card instead of pretending to send.

### 13.3 The phone app

The HUD is now an installable **PWA**:

* `/manifest.webmanifest` — name, icons (192/512 PNG, maskable), standalone
  display, theme colours and three shortcuts (Status, Screen, Brain).
* `/sw.js` — caches the shell for offline open; `/api/*` is always live and
  never cached.
* An **INSTALL APP** button appears in the header when the browser offers
  installation; on Android use “Add to Home screen”, on iOS Share → Add to Home
  Screen.
* `/?cmd=status%20report` runs a command on open — that is how the shortcuts work.

For a phone that runs Jarvis itself (Android):

```bash
bash automation/termux_jarvis.sh install   # Termux + Termux:API
bash automation/termux_jarvis.sh start     # wake-lock, start, open the HUD
bash automation/termux_jarvis.sh stop
```

**Honest limits.** A browser cannot listen for the wake word while the phone is
locked; keep the tab (or installed PWA) open for voice, or use the CLI on a PC.
Qwen 1.7B runs in Termux via llama.cpp but slowly; 4B+ belongs on the PC. iOS
does not allow a local Python server — there the PWA is a remote control for the
PC.

### 13.4 The coding agent (patch and test loop)

The agent loop from v1.2.0 now has a real patch primitive and a way to prove its
own work:

| Command | What happens |
| --- | --- |
| `replace <old> with <new> in file notes.txt` | exact-snippet patch, one match, backup written first |
| `in file app.py replace foo with bar` | same patch, file named first |
| `edit file app.py: foo => bar` | shorthand form |
| `run the tests` / `run tests in ~/project` | detects pytest / unittest / npm and runs it |

Both tools are **high-impact**: the HUD opens the approval sheet, shows what will
change, and only then writes. `edit_file` never guesses — a missing snippet, an
ambiguous snippet (two matches without an occurrence number) or a binary file is
refused and the file is untouched. Every successful patch copies the old file to
`data/jarvis/backups/<name>-<timestamp>.bak` and reports `+added/-removed` lines.
`run_tests` only executes known runners (`python3 -m pytest`, `python3 -m
unittest discover`, `npm test`) inside the home folder, caps the run at 300 s and
returns the last lines of the log as a card. A suite that runs **zero** tests is
called out instead of being reported as green.

### 13.5 The phone as a real hand (v1.4.0)

Jarvis on Android is not a chat window — it has hands. Everything runs through
Termux:API binaries with an explicit argv (never a shell):

| Say | Real action |
| --- | --- |
| `phone check` | capability matrix: which of the 17 actions work, and how to fix the rest |
| `phone status` / `phone battery` | battery %, charging, temperature, health, Wi-Fi |
| `call ravi` | **places a call** (approval sheet first) |
| `sms ravi saying running late` | **sends an SMS** from the SIM (approval first) |
| `ravi ko sms bhejo main late hoon` | the same in Hinglish |
| `notify me on the phone that tea is ready` | posts a notification |
| `vibrate` · `torch on` · `torch off` | buzz, flashlight |
| `phone volume 60` · `phone volume` | set or read every audio stream |
| `phone clipboard` · `copy this to the phone` | clipboard read/write |
| `say good morning on the phone` | the phone's own TTS speaks |
| `take a photo with the phone` | camera photo, saved on the phone, file card in chat |
| `phone contacts ravi` | searches the real contact list (`save: true` imports to Jarvis) |
| `phone notifications` | reads the notification shade |
| `where is my phone` | GPS/network location |
| `open youtube on the phone` | opens a link or file on the phone |

**Fallback on a PC.** The same commands stay honest: `call` and `sms` return a
one-tap `tel:` / `sms:` link, everything else explains that the Android bridge is
not on this machine and prints the two setup steps. Nothing claims success it did
not observe.

**Safety.** `phone_call`, `phone_sms` and `phone_photo` are high-impact and go
through the approval sheet; the preflight validates the contact and the text
before the gate opens. Messages are passed as a single argv entry, so `;`, `|`
and `>` inside an SMS are literal characters — the binary is allow-listed and
`shell=False` is used end to end. Actions are audited in `logs/jarvis.log` and a
short trail lands in `data/jarvis/phone/hand.log`.

**Setup** (both halves are needed):

```bash
pkg install termux-api                    # command line wrappers
# plus the "Termux:API" app from F-Droid / Play Store, opened once
bash automation/termux_jarvis.sh hand      # 17/17 expected
python3 jarvis.py --phone-check            # same report from Python
```

`docs/PHONE_HAND.md` is the full setup + 17-step demo + OEM troubleshooting guide.

### 13.6 Hands-free voice (v1.3.0)

The HUD voice channel is now tuned for real rooms, not just headphones:

| Behaviour | Detail |
| --- | --- |
| Wake aliases | `jarvis`, `jarvice`, `javis`, `jaarvis`, `j.a.r.v.i.s`, `जार्विस` all count |
| Wake feedback | soft double beep + “Wake word heard · go ahead” as soon as it is recognised |
| Barge-in | start talking while Jarvis replies and the reply stops, then your sentence runs |
| Barge-in toggle | Settings → **Barge-in (interrupt me)** / `JARVIS_BARGE_IN=true` |
| Auto-restart | the microphone re-arms after every end, with exponential backoff (0.7 s → 8 s) instead of a hot loop |
| Tab visibility | the mic is released while the tab is hidden and re-armed when you return |
| Errors | `not-allowed` stops the loop and says exactly what to fix; network/busy errors back off quietly |

Barge-in works two ways: while the wake loop is listening (hands-free) and, if
you have used the microphone once this session, through a short-lived watcher
that only lives while Jarvis is speaking. It ignores the first 450 ms of its own
speech so the reply cannot interrupt itself.

### 13.7 Desktop readiness check

```bash
python3 jarvis.py --desktop-check
```

or say `desktop check`. It reports the platform, whether a display is attached,
the arming state, and every capability (`input`, `windows`, `ocr`, `screenshot`,
`clipboard`) with the helper it found or the exact install command to run.
`docs/DESKTOP_DEMO.md` is the 10-minute live demo script for Linux, Windows and
macOS, including the safety drill.

### 13.8 Hinglish time, done properly

`jarvis/timeparse.py` now understands how people actually speak in Patna:

| You say | It means |
| --- | --- |
| `sawa 5 baje` / `sawa paanch baje` | 5:15 |
| `paune 5 baje` | 4:45 |
| `saadhe 5 baje` | 5:30 |
| `dedh baje` / `dhai baje` | 1:30 / 2:30 |
| `aadhe ghante baad` / `dedh ghante baad` | +30 min / +90 min |
| `dhai ghante me` / `sawa ghante baad` | +150 min / +75 min |
| `20 minute me` | +20 min |
| `agle hafte` / `agle somvaar ko 5 baje` | next week / next Monday 5 PM |
| `aaj raat 12 baje` | tonight 00:00, not noon |
| `… yaad dilana` (trailing) | reminder — time-first word order included |

Titles are cleaned too: “aaj shaam paune 5 baje gym yaad dilana” becomes the
reminder **gym** at 4:45 PM, not a sentence.

### 13.9 Verification

```bash
python3 -m unittest tests.test_desktop_comms -v   # 18 tests
python3 -m unittest tests.test_coding_agent -v    # 11 tests
python3 -m unittest tests.test_timeparse -v       # 16 tests
python3 -m unittest tests.test_phase5_voice -v    # 14 tests
python3 -m unittest tests.test_phone_hand -v      # 25 tests
python3 -m unittest tests.test_local_brain -v     # 21 tests
python3 jarvis.py --check                         # 14-point diagnostic
python3 jarvis.py --desktop-check                 # desktop capability report
python3 jarvis.py --phone-check                   # Android hand capability report
```

The desktop layer is tested on a headless machine by checking arming, gating,
key normalisation, destructive-combo blocking and honest fallbacks. Input
backends are exercised on a real desktop session (see `docs/DESKTOP_DEMO.md`).
Wake-word and barge-in behaviour is exercised in jsdom with a fake
SpeechRecognition: wake-only speech sends no command, a wake+command phrase is
stripped and dispatched, and talking over a reply cancels speech. The phone hand
is tested against stub `termux-*` binaries on `PATH`, so each assertion checks
the exact argv Android would receive — including a message full of shell
metacharacters that must stay literal.

---

---

## 14. Free model routes (v1.5.0)

Two open-source gateways turn a pile of free API keys into one OpenAI-compatible
endpoint:

| Gateway | Default endpoint | Install | Key |
| --- | --- | --- | --- |
| [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) | `http://127.0.0.1:3001/v1` | `curl -fsSL https://freellmapi.co/install.sh \| bash` (or the Docker image) | `freellmapi-…` from the dashboard |
| [OmniRoute](https://github.com/ChrisCompton/omniroute) | `http://127.0.0.1:20128/v1` | `npm install -g omniroute && omniroute` | any string |

Jarvis treats them as **routes**, not as a hard-coded client: an OpenAI-compatible
`/v1/chat/completions` endpoint plus a model. Both presets use model `auto`, so
the gateway picks whichever free provider is healthy right now.

A third preset is **keyless** — a public endpoint that needs no signup and no
install (`https://text.pollinations.ai/openai`, model `openai-fast`). It is
best effort: Jarvis never probes it during HUD status polls, the first real
answer proves it, and a failure puts it on a 90-second cooldown while Jarvis
says so. That is what lets a fresh Termux install answer questions with zero
API keys; `JARVIS_KEYLESS=0` turns it off and `JARVIS_KEYLESS_URL` points it at
any other no-key OpenAI-compatible server.

### 14.1 Brain modes

```
gemini | local | route | free | auto | offline
```

| Mode | Order tried |
| --- | --- |
| `auto` (default) | Gemini → local Qwen → free routes |
| `route` / `free` | free routes → local Qwen |
| `gemini`, `local` | that lane only |
| `offline` | no language model |

A route that errors is backed off for 30 s so the next turn skips it instantly.
The route lane is a first-class brain: with a gateway online, `auto` mode answers
questions even when Gemini has no key and Ollama is not running.

### 14.2 Saying it

| Phrase | Tool |
| --- | --- |
| "free route", "routes", "route status", "omniroute status" | `route_status` |
| "free route setup", "connect free models", "free models lagao" | `route_setup` |
| "which models are connected", "kaun se models", "list models" | `models_connected` |
| "models on freellmapi" | `route_models` |
| "route test omniroute", "test freellmapi" | `route_test` |
| "use free models", "switch to free route" | `route_use route` |
| "route test keyless" | `route_test` on the no-key lane |
| "use auto brain", "use local qwen", "use gemini", "go offline" | `route_use <mode>` |
| "add route mybox at http://192.168.1.20:3001/v1 model llama3" | `route_add` |
| "connect endpoint http://127.0.0.1:8080/v1 as llama" | `route_add` |
| "remove route mybox" | `route_remove` |

`route setup` prints the exact install command for each gateway; when nothing is
online Jarvis says which one refused and what to run, instead of pretending.

### 14.3 Honest attribution

Every route answer carries the gateway's routing header. The reply envelope
publishes it:

```json
{"meta": {"provider": "route:freellmapi", "route": "freellmapi",
          "model": "auto", "routed_via": "groq/llama-3.3-70b-free"}}
```

The HUD footer shows the live route chip and the route panel lists every gateway
with latency, model count and a TEST ROUTE button.

### 14.4 Config

```bash
JARVIS_BRAIN_MODE=route
JARVIS_FREELLMAPI_KEY=freellmapi-xxxxxxxx
JARVIS_FREELLMAPI_URL=http://127.0.0.1:3001/v1
JARVIS_OMNIROUTE_KEY=any-string
JARVIS_OMNIROUTE_URL=http://127.0.0.1:20128/v1
```

Custom routes live in `data/jarvis/routes.json` (mode `600`); the key may also
come from `JARVIS_ROUTE_<ID>_KEY`. `docs/FREE_ROUTES.md` is the step-by-step
guide.

### 14.5 Verification

```bash
python3 -m unittest tests.test_free_routes -v   # 42 tests
```

A stdlib `ThreadingHTTPServer` plays the gateway: probes, model lists, `auto`
routing, `X-Routed-Via` parsing, 4xx/5xx, timeouts, key masking, per-route
cooldown, brain-mode order, the route provider id and honest fallbacks when
every route is down. The keyless lane is covered separately: no dial during
status polls, reachability check, 90-second cooldown after a failure, the
`JARVIS_KEYLESS=0` switch and a full answer with no key configured.

---

## 15. Credits

Feature scope inspired by two public tutorial playlists by *Anubhav Chaturvedi /
NetHyTech*: **Jarvis 2.0** (43 episodes) and **Build Your Own Jarvis 1.0**
(41 episodes). This is an independent implementation: the architecture, security
model, tools and interface were written for this repository and do not reuse the
tutorials' source code or their third-party assets. Voice cloning segments were
intentionally not reproduced — licensed/browser voices only.
