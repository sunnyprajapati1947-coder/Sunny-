# SunnyAI — Jarvis (Nova)

Nova is a local-first personal AI assistant that runs entirely on your phone
(Termux/Android) — it listens, thinks, and talks like a personal Jarvis.

## Quick start (Termux)

```bash
pkg update -y && pkg install -y git curl termux-api
git clone -b arena/648528ed-sunny https://github.com/sunnyprajapati1947-coder/Sunny-.git Nova
bash ~/Nova/automation/setup_termux.sh
python3 ~/Nova/jarvis.py --text   # type mode (works anywhere)
python3 ~/Nova/jarvis.py          # voice mode (needs the Termux:API app)
```

## The Jarvis loop

    suno (termux-speech-to-text)
      -> socho (tools pehle: time/battery/weather/yaad-rakhna; phir local
         Qwen model with Jarvis personality + rolling memory)
      -> bolo (termux-tts-speak)

- `jarvis.py` — voice-first entry point (`/status`, `/reset`, `/exit`)
- `core/voice_interface.py` — speak + listen (graceful text fallback)
- `core/jarvis_brain.py` — act-first intent router, then human-like chat
- `core/conversation.py` — persistent rolling dialogue (last 12 turns replayed)
- `core/identity.py` — name/owner + Hinglish personality (env-configurable)

Voice needs the **Termux:API** app (F-Droid/Play) installed and opened once,
plus `pkg install termux-api`. Without it Jarvis silently falls back to typing.

## Model lanes

- Smart lane: Google Gemini (free API key) — default for chat; falls back automatically.
  Add your key once: `jarvis-gemini-key` (or `bash automation/add_gemini_key.sh`).
  Key from <https://aistudio.google.com/apikey>; stored in `config/gemini.key`
  (chmod 600, git-ignored — never committed).
- Fast lane: local Qwen small model for bounded, low-complexity turns.
- Deep lane: local Qwen 4B-class model for reasoning, planning, and research.
- `nova_chat.py` starts/checks both lanes automatically and self-heals.

## Sources

Nova is built from adapted open-source source material. See
`GITHUB_SOURCES.md` for the full list (15 sources) and
`github/<source>/IMPORT_PLAN.md` for what each source contributed.

## Capabilities

| Area | Tools | From |
|---|---|---|
| Web | web_search, web_fetch, web_research, web_agent_run | local-ai-agent, jev-ultrafast |
| Market | market_analyze, api_currency | TradingAgents, public-apis |
| Public APIs | api_weather, api_currency, api_dictionary, api_wikipedia, api_directory_search | public-apis |
| Personal | personal_remember, personal_recall, personal_forget, personal_briefing | OpenJarvis |
| Learning | learning_find_build_guide, learning_find_books, learning_available_topics | build-your-own-x, free-programming-books |
| Coding context | repo_context_pack (NOVA_CONTEXT.md) | Graft |
| Skills | skills_list, skills_get, skills_validate, skills_catalog_search | awesome-agent-skills |
| Decisions | decision_choice, decision_score, decision_yes_no | laya |
| Phone | phone_battery, phone_volume, phone_notification, phone_toast, phone_vibrate | termux-assistant |
| YouTube | status, prepare, upload (approval), queue, automation | Nova automation pipeline |

All tools are registered in one boundary (`core/tool_bridge.py`) and pass
Nova security policy before execution: no unrestricted shell, no secret
exposure, human approval for high-impact actions, and no automatic financial
execution.

## Quick start

```bash
python3 nova_chat.py            # interactive chat (starts local lanes)
python3 -m core.tool_bridge     # build the tool registry
python3 -m unittest discover -s tests -q   # run the test suite
```

Skill packs live in `skills/<name>/SKILL.md` and are validated on load.

## Provider

Chat routes to Google's Gemini API (`generativelanguage.googleapis.com`,
`generateContent`) when a key is configured via `jarvis-gemini-key`.
The key lives only in the local git-ignored file `config/gemini.key`
(or `$NOVA_GEMINI_KEY_FILE`); no API keys are stored in this repository.
Without a key — or if the network fails — Nova falls back to the local
Qwen lanes, so chat always works.

Model availability can depend on the Google account, API project, quota,
region, preview status, and current Google API lifecycle. A model being
listed in the registry does not guarantee access.
