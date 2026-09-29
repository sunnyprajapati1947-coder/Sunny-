# Nova — GitHub Agent Core Import

Source:
MwesigwaLewis/local-ai-agent

Import candidates:
- agent/loop.py       -> Nova agent execution loop
- agent/router.py     -> model/tool routing ideas
- agent/parser.py     -> structured tool-call parsing
- tools/registry.py   -> centralized tool registry
- tools/base.py       -> common tool interface
- tools/filesystem.py -> filesystem capability
- tools/http_tool.py  -> HTTP capability
- tools/web.py        -> web capability
- tools/memory_tool.py -> memory capability
- tools/python_tool.py -> controlled Python capability
- tools/shell_tool.py -> controlled shell capability
- chat_store.py       -> conversation persistence ideas

Rules:
1. Nova remains the final architecture.
2. Never enable unrestricted shell execution.
3. Never bypass Nova security/policy.
4. Every action goes through permission -> execute -> verify.
5. Android/Termux compatibility must be tested before activation.
6. No source code is trusted merely because it is from GitHub.
