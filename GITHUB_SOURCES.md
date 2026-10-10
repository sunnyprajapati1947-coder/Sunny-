# Nova GitHub Source Base

## First wave (core)

1. MwesigwaLewis/local-ai-agent
   Core local-agent architecture, tool loop, streaming, local-first concepts.

2. csornyei/mimir
   Memory, context management, MCP/tool-loop concepts.

3. AbuZar-Ansarii/local-AI-Agent
   Android/Termux local-agent architecture.

4. explysm/termux-assistant
   Termux/Android assistant and Termux API concepts.

5. gary149/llama-agent
   llama.cpp-native agent/tool execution concepts.

6. vishal-q/nova-ai-assistant
   Voice, wake-word, Hindi/Hinglish assistant concepts.

## Second wave (capability expansion)

7. browser-use/jev-ultrafast
   Element-table observation and single-operation web-agent loop
   (TYPE_TEXT / CLICK / GOTO / DONE / BLOCKED) -> core/web_agent.py

8. NandhaKishorM/laya
   Typed System-1 decisions (choice / score / noul) in a single pass
   -> core/decision_engine.py

9. open-jarvis/OpenJarvis
   Local-first personal AI: personal memory + morning-digest briefing
   -> core/personal_profile.py

10. codecrafters-io/build-your-own-x
    Curated offline index of build-your-own-X tutorials
    -> core/data/build_guides.json + core/learning_hub.py

11. public-apis/public-apis
    Curated no-key API directory + working clients (weather, currency,
    dictionary, Wikipedia) -> core/public_api_tools.py

12. EbookFoundation/free-programming-books
    Curated offline free-book shelf -> core/data/book_shelf.json

13. TauricResearch/TradingAgents
    Trading-firm role debate (analyst/bull/bear/trader/risk) with no-key
    price data -> core/trading_desk.py

14. trailhq/Graft
    Repo context packs: tree, languages, import hubs, skeletons,
    NOVA_CONTEXT.md -> core/context_spec.py

15. VoltAgent/awesome-agent-skills
    SKILL.md skill-pack format, validated loader, catalog index
    -> core/skill_loader.py + skills/

Important:
These repositories are SOURCE MATERIAL.
Nova will not blindly copy unsafe or incompatible code.
Every component must pass compatibility and security checks
before becoming an active Nova capability.
Each second-wave source has an import plan under github/<source>/IMPORT_PLAN.md.
