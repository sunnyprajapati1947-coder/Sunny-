# Research notes (October 2026)

What was checked, what was reused, and why. Every claim below comes from the source linked next to it.

## Projects named in the request

| Project | What it is | License | Decision |
|---|---|---|---|
| OpenJarvis (several unrelated repos share the name) | e.g. [LALSINGH16-code/OpenJarvis](https://github.com/LALSINGH16-code/OpenJarvis) is an early-development desktop assistant; [dmrr35/Open.Jarvis](https://github.com/dmrr35/Open.Jarvis) is a Windows-first assistant | MIT (both) | **Not reused.** Your `/root/OpenJarvis` was permission-denied in this session, so I could not inspect it. Nova is a new project; nothing was renamed or reconfigured from OpenJarvis. |
| Open-source OpenJarvis framework | Lists Ollama, vLLM, SGLang and llama.cpp backends; Apache-2.0 per its [SourceForge mirror](https://sourceforge.net/projects/openjarvis.mirror/) | Apache-2.0 | Too large for a phone; kept as reference only. |
| llama.cpp | Local inference; `llama-server` exposes an OpenAI-compatible `/v1/chat/completions` endpoint, and the project is MIT licensed ([llama-cpp.com](https://llama-cpp.com/), [tutorial](https://tech-insider.org/llama-cpp-tutorial-2026/)) | MIT | **Reused as the local brain.** Your existing server on 127.0.0.1:8081 is used as-is. Nova speaks plain HTTP JSON, so there is no Python binding to compile on the phone. |
| Termux:API | Command bridge to Android features: `termux-battery-status`, `termux-notification`, `termux-tts-speak`, `termux-speech-to-text`, clipboard and more ([command reference](https://github.com/gangadharKorrapati/termux-api-usage), [overview](https://riddhiraj.hashnode.dev/how-to-use-termux-api-commands-in-termux)) | Termux:API app + `termux-api` package | **Reused** for battery, notifications, speech and clipboard. Each command is wrapped and reports NOT AVAILABLE when missing. Termux:API cannot control other apps or the screen; Nova does not claim that. |
| smolagents (Hugging Face) | Code-first agent library, Apache-2.0 ([andrew.ooo review](https://andrew.ooo/posts/smolagents-huggingface-code-first-agent-library/), [license summary](https://ai.miraheze.org/wiki/Smolagents)) | Apache-2.0 | **Ideas reused, library not used.** Its default design runs model-written Python; Nova instead uses a small JSON tool protocol with explicit risk levels and approval, which is easier to audit on a phone and needs no extra dependencies. |
| Repositories in `GITHUB_SOURCES.md` (existing repo) | Listed as source material only | varies | Not audited in this session; no code copied from them. |

## Architectural decisions

1. **Standard library only.** No pip dependencies means install is fast, nothing large downloads, and it runs on Python 3.11+ (Termux ships 3.13).
2. **Tool calling by JSON in plain text.** It works with any OpenAI-compatible chat model, including small Qwen builds that lack native function calling.
3. **Rules first.** Common requests (time, battery, read/write a file, remember/recall, search, run tests) run deterministically, so the assistant still does real work when the model is offline or unsure.
4. **Verified actions.** File writes are read back and hashed; memory writes are read back; a task step is only "verified" when its tool calls succeeded.
5. **Bounded everything.** Max agent turns, format-error retries, step retries, web bytes, command timeouts.
6. **Local-first, online opt-in.** Online fallback is disabled by default. It needs both `online.enabled = true` and a key in `secrets.env`.
7. **Update from trusted remotes only**, fast-forward only, tested in isolation first, with backup and rollback.

## Sources

- llama.cpp server and OpenAI compatibility: [llama-cpp.com](https://llama-cpp.com/), [tech-insider tutorial](https://tech-insider.org/llama-cpp-tutorial-2026/)
- Termux:API command usage: [termux-api-usage](https://github.com/gangadharKorrapati/termux-api-usage), [hashnode guide](https://riddhiraj.hashnode.dev/how-to-use-termux-api-commands-in-termux)
- smolagents licence: [andrew.ooo](https://andrew.ooo/posts/smolagents-huggingface-code-first-agent-library/), [Learn AI wiki](https://ai.miraheze.org/wiki/Smolagents)
- OpenJarvis variants: [LALSINGH16-code/OpenJarvis](https://github.com/LALSINGH16-code/OpenJarvis), [dmrr35/Open.Jarvis](https://github.com/dmrr35/Open.Jarvis), [SourceForge mirror](https://sourceforge.net/projects/openjarvis.mirror/)
- Free search: Wikipedia's MediaWiki API (keyless), optional self-hosted SearXNG.
