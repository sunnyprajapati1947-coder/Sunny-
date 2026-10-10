# Nova GitHub Source Base

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

Important:
These repositories are SOURCE MATERIAL.
Nova will not blindly copy unsafe or incompatible code.
Every component must pass compatibility and security checks
before becoming an active Nova capability.

## Requested Jarvis sources (2026-10-10)

The ten additional sources are recorded with pinned commit IDs, roles, requirements, and license cautions in [`jarvis_start.py`](jarvis_start.py). See [the starting guide](JARVIS_START_HERE.md) and [reported-device next commands](JARVIS_PHONE_SETUP.md) for the deployment plan. Per-source phone strategies and `--phone-plan` are descriptive planning data, not completed ports.

- Runtime candidates: `browser-use/jev-ultrafast`, `NandhaKishorM/laya`, `open-jarvis/OpenJarvis`, `TauricResearch/TradingAgents`, `trailhq/Graft`, `FlashML-org/FreeVideo`.
- Reference catalogs: `codecrafters-io/build-your-own-x`, `public-apis/public-apis`, `EbookFoundation/free-programming-books`, `VoltAgent/awesome-agent-skills`.

Status: **catalog-only / planned**. The read-only `github_source_catalog` tool can describe them; it cannot download or execute them. A manually downloaded checkout is not an installed or active capability. No third-party code has been copied into the runtime by this change.

Each linked tool, skill, API, tutorial, and book needs its own compatibility, permission, and license review. `build-your-own-x` has no detected repository license; keep it as a link/reference unless reuse permission is established. Trading research does not authorize broker access or automated financial execution.

FreeVideo is recorded as **remote GPU only** for this phone. Its documented Linux engine requires x86_64/NVIDIA hardware and at least 16 GB system RAM plus 8 GB VRAM; installing Ubuntu on Android does not provide that hardware. Code and model-weight licenses are distinct. No FreeVideo engine, GPU service, or weights have been installed or connected.
