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

## Linked sources

These are registered as reference material but are NOT vendored into the
repository tree, because their size would dominate the checkout. Clone them
outside the workspace and point `NOVA_LINKED_SOURCES` at the parent directory.
`core/source_manifest.py` records the expected location and reports it under a
`linked:` prefix.

7. morluto/rea
   Reverse engineering CLI + MCP server (npm package `rea-agents`, MIT).
   Static analysis of binaries and applications, decompiler bridges
   (Ghidra / IDA / Hopper), JavaScript and web-bundle analysis, and runtime
   tracing.
   Status: reference-only. Not wired into `NovaToolRegistry`.
   Runtime: Node.js `^22.23.4 || ^24.22.1 || >=26.12.1`.

Important:
These repositories are SOURCE MATERIAL.
Nova will not blindly copy unsafe or incompatible code.
Every component must pass compatibility and security checks
before becoming an active Nova capability.
