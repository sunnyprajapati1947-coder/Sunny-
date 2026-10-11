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
jarvis-gui                        # Iron Man style web HUD (browser me)
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

## Provider: Gemini online + local fallback

Jarvis can use Google Gemini for natural conversation and fall back to local
Qwen when Gemini is not configured, times out, or returns an API error. Explicit
tool intents still run through the local tool registry first; Gemini text alone
does not grant phone or shell permissions.

After setup, create `config/nova.env` locally (this file is gitignored):

```bash
mkdir -p config
cat > config/nova.env <<'EOF'
GEMINI_API_KEY=PASTE_YOUR_KEY_HERE
GEMINI_MODEL=gemini-2.5-flash
NOVA_LLM_PROVIDER=auto
GEMINI_TIMEOUT=25
EOF
chmod 600 config/nova.env
```

Replace the placeholder on your phone only. Never paste a real key into chat,
GitHub issues, source files, screenshots, or commits. You can also export
`GEMINI_API_KEY` in the local shell instead of using the file.

- `NOVA_LLM_PROVIDER=auto`: Gemini first when a key is present, then local Qwen.
- `NOVA_LLM_PROVIDER=local`: local Qwen only.
- `NOVA_LLM_PROVIDER=gemini`: try Gemini first, then local Qwen fallback.
- Default model: `gemini-2.5-flash`; set `GEMINI_MODEL` to a model available
  to your Google AI project if this one is unavailable.

Gemini API use is subject to Google's current pricing, quotas, region and model
availability. The fallback does not mean the cloud request was free or that
every requested phone action is supported.
