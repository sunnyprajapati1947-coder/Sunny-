# Jarvis Pocket

A phone-first AI assistant with a brain made of open-source agent knowledge.

Jarvis Pocket is two things in one installable web app:

1. **A real assistant.** Chat with any model you already have a key for — Gemini, OpenRouter, OpenAI, Claude, Groq, DeepSeek or a local OpenAI-compatible endpoint. Streaming replies, voice input, spoken answers, long-term memory, chat history, markdown rendering and an offline fallback that still searches the library when the network is gone.
2. **A library of 1889 skills, agents, commands and guides** curated from **23** open-source repositories. Everything the assistant cites is real content from those repos, shipped with the app and readable with no signal.

The model is yours, the knowledge is local, and nothing is sent anywhere except the provider you picked.

**Live app: <https://PLACEHOLDER>** — open it on a phone and add it to the home screen.

## How the assistant stays grounded

Large models happily invent skills and commands. Jarvis Pocket makes that harder in three layers:

- **Retrieval before the answer.** Every message triggers a local search over the pack index. The top matches are loaded from their chunk and injected into the system prompt as context.
- **Tools.** The model can call `kb_search` (rank the library), `kb_open` (read a full document) and `remember` (write to memory). Tool calls are plain JSON tags, so they work with small open models too, not just providers with native tool support.
- **Citations.** Answers link to library items as `[Title](#/item/<id>)`, which route straight into the reader. The UI hides tool tags and shows a *Sources* row under the answer.

If no key is configured the app still works: it answers from the pack with ranked extracts and a link to every item, then points at settings.

## Screens

| Screen | What it does |
| --- | --- |
| Chat | Streaming answers, markdown, code copy, voice in/out, stop, retry, sources, history |
| Library | 23 packs, type filters, curated paths, progressive list |
| Search | Ranked search across titles, descriptions, keywords and tags; recent queries |
| Reader | Sanitised markdown, table of contents, code copy, share, bookmark, read aloud, *Ask Jarvis*, link to the original file on GitHub |
| Memory | Facts the assistant should always know; injected into every chat on this device |
| Settings | Provider + key + model, persona, reply language, voice, offline pack download, theme, text size, export/reset |
| About | Every pack with license and item count, how grounding works, credits |

## Providers

| Provider | Notes |
| --- | --- |
| Google Gemini | Free tier, browser-friendly. Default choice. |
| OpenRouter | One key, many models, browser-friendly. |
| OpenAI | Works where the browser allows direct API calls; otherwise use OpenRouter. |
| Anthropic | Uses the direct-browser header for Claude models. |
| Groq | Very fast open models, free tier. |
| DeepSeek | Cheap reasoning models. |
| Custom | Any OpenAI-compatible base URL, e.g. Ollama on your LAN. |

Keys live in `localStorage` on the device and are sent only to the provider you selected. There is no backend in this project at all, which also means there is nowhere else for them to go — but it does mean anything with access to your browser profile can read them.

## Packs

| Pack | Repo | Items | License |
| --- | --- | ---: | --- |
| ECC | [affaan-m/ECC](https://github.com/affaan-m/ECC) | 395 | MIT |
| claude-skills | [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | 362 | MIT |
| agents | [wshobson/agents](https://github.com/wshobson/agents) | 325 | MIT |
| scientific-agent-skills | [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | 223 | MIT |
| marketingskills | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | 154 | MIT |
| oh-my-openagent | [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | 86 | NOASSERTION |
| paperclip | [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | 63 | MIT |
| claude-mem | [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) | 47 | Apache-2.0 |
| claude-code | [anthropics/claude-code](https://github.com/anthropics/claude-code) | 45 | NOASSERTION |
| Skill_Seekers | [yusufkaraaslan/Skill_Seekers](https://github.com/yusufkaraaslan/Skill_Seekers) | 43 | MIT |
| Understand-Anything | [Egonex-AI/Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) | 30 | MIT |
| planning-with-files | [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files) | 20 | MIT |
| nanoclaw | [nanocoai/nanoclaw](https://github.com/nanocoai/nanoclaw) | 16 | MIT |
| laya | [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya) | 15 | Apache-2.0 |
| archify | [tt-a1i/archify](https://github.com/tt-a1i/archify) | 14 | Apache-2.0 |
| OpenJarvis | [open-jarvis/OpenJarvis](https://github.com/open-jarvis/OpenJarvis) | 14 | Apache-2.0 |
| rea | [morluto/rea](https://github.com/morluto/rea) | 12 | MIT |
| youtube-agent-skill | [Jakeschincariol/youtube-agent-skill](https://github.com/Jakeschincariol/youtube-agent-skill) | 12 | MIT |
| notebooklm-py | [teng-lin/notebooklm-py](https://github.com/teng-lin/notebooklm-py) | 6 | MIT |
| i-have-adhd | [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) | 4 | MIT |
| TradingAgents | [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) | 1 | Apache-2.0 |
| awesome-agent-skills | [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 1 | MIT |
| awesome-claude-skills | [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | 1 | NOASSERTION |

Content belongs to the original authors and stays under each repository's license (the app only reads and renders it). Every reader shows a *View source on GitHub* link pinned to the exact commit the pack was built from.

## Rebuilding the pack

The data is generated, never hand-edited.

```bash
# clone the sources (one directory per repository)
mkdir -p /tmp/repos && cd /tmp/repos
for repo in affaan-m/ECC open-jarvis/OpenJarvis nanocoai/nanoclaw ...; do
  git clone --depth 1 https://github.com/$repo.git "$(basename $repo)"
done

# repository metadata (stars, license, language, topics)
for d in */; do gh api "repos/$(git -C $d remote get-url origin | sed 's#https://github.com/##; s#\.git$##')" ...; done > meta.jsonl

cd apps/jarvis-pocket
python3 tools/build_pack.py --repos /tmp/repos --meta /tmp/repos/meta.jsonl --out data
```

`build_pack.py` walks every checkout, skips vendored/test/license noise, parses YAML frontmatter, classifies each file (skill, agent, command, rule, prompt, workflow, guide), de-duplicates identical bodies across repositories, applies per-repo and global caps, then writes:

- `data/manifest.json` — ~1,889 searchable entries with descriptions, keywords, tags, pack and chunk pointers, plus curated collections (786 KB, ~179 KB gzipped)
- `data/chunks/cNNN.json` — the markdown itself, ~260 KB per chunk, lazy-loaded and cached by the service worker (15 MB total)
- `data/packs.json` — repository metadata

Bump `VERSION` in `sw.js` whenever the shell changes so clients pick up the new build.

## Run it

```bash
cd apps/jarvis-pocket
python3 -m http.server 8080 --bind 0.0.0.0
# open http://localhost:8080 (or http://<laptop-ip>:8080 on the phone)
```

A static server is required: `fetch()` and service workers are blocked on `file://`. There is no build step and no backend.

## Deploy

Any static host works — point it at `apps/jarvis-pocket` and keep the directory tree.

- **Vercel:** project with output directory `apps/jarvis-pocket`, no build command (or a build command that checks the folder exists).
- **Netlify / Cloudflare Pages:** publish directory `apps/jarvis-pocket`, no build command.
- **GitHub Pages:** publish the folder (Actions artifact or `gh-pages` branch).

## Compatibility notes

- Vanilla ES5-flavoured JavaScript, no framework, no webfonts, no trackers. Roughly 240 KB of app shell before compression.
- `color-mix()` and `backdrop-filter` are progressive enhancements; solid fallbacks are declared first.
- Voice input uses the Web Speech API (Chrome/Edge/Safari; Firefox lacks it) and speech output uses `speechSynthesis`. Both degrade to typing and reading.
- Installable PWA needs HTTPS (or `localhost`); offline reading needs *Settings → Save all for offline* once.
- Storage: chats and memory live in `localStorage`; the pack lives in Cache Storage and can be cleared from Settings.

## Layout

```
apps/jarvis-pocket/
├── index.html                shell + icon sprite
├── manifest.webmanifest      PWA manifest
├── sw.js                     offline shell + pack cache
├── assets/
│   ├── css/app.css           design system (dark/light, four text sizes)
│   └── js/
│       ├── core.js           DOM, storage, toasts, sheets
│       ├── pack.js           manifest index, chunk loader, search, RAG
│       ├── memory.js         long-term memory on device
│       ├── llm.js            provider adapters, SSE streaming, system prompt
│       ├── voice.js          Web Speech input + speech synthesis
│       ├── markdown.js       marked + DOMPurify, link resolution, TOC
│       ├── chat.js           chat UI, tool loop, history
│       ├── library.js        library, search, pack, reader, shelf
│       └── app.js            router, settings, memory, about, boot
├── data/                     generated pack (manifest + chunks)
├── icons/
└── tools/build_pack.py       deterministic pack builder
```
