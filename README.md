# SunnyAI — Nova

Nova is a local-first personal AI assistant. Everything runs on the device
(Termux/Android, Linux, macOS); the cloud is used only when truly necessary.

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

## Provider

SunnyAI can also route to Google AI models via a configured `GEMINI_API_KEY`
from the local environment. No API keys are stored in this repository.

Model availability can depend on the Google account, API project, quota,
region, preview status, and current Google API lifecycle. A model being
listed in the registry does not guarantee access.
