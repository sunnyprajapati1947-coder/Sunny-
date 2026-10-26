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

# J.A.R.V.I.S. v1.2.0 source base (pattern mining)

These repositories were studied for architecture and workflow ideas only.
No source code was copied; every implementation in `jarvis/` is original.

1. https://github.com/open-jarvis/OpenJarvis
   Adopted pattern: local-first lanes, starter model guidance.

2. https://github.com/TauricResearch/TradingAgents
   Adopted pattern: role-specialised model routing.

3. https://github.com/morluto/rea
   Adopted pattern: plan-before-act loops.

4. https://github.com/NandhaKishorM/laya
   Adopted pattern: layered assistant/agent separation.

5. https://github.com/anthropics/claude-code
   Adopted pattern: tool schemas, approval gates.

6. https://github.com/thedotmack/claude-mem
   Adopted pattern: memory compression.

7. https://github.com/tt-a1i/archify
   Adopted pattern: plan visualisation ideas.

8. https://github.com/K-Dense-AI/scientific-agent-skills
   Adopted pattern: structured skill manifests.

9. https://github.com/paperclipai/paperclip
   Adopted pattern: durable task artefacts.

10. https://github.com/Egonex-AI/Understand-Anything
   Adopted pattern: repository maps as context.

11. https://github.com/code-yeongyu/oh-my-openagent
   Adopted pattern: open agent-loop conventions.

12. https://github.com/ayghri/i-have-adhd
   Adopted pattern: focus-mode output shaping.

13. https://github.com/coreyhaines31/marketingskills
   Adopted pattern: content/SEO skill shape.

14. https://github.com/wshobson/agents
   Adopted pattern: small bounded agents.

15. https://github.com/VoltAgent/awesome-agent-skills
   Adopted pattern: skill catalog structure.

16. https://github.com/nanocoai/nanoclaw
   Adopted pattern: lightweight tool sandboxing.

17. https://github.com/alirezarezvani/claude-skills
   Adopted pattern: modular skill files.

18. https://github.com/OthmanAdi/planning-with-files
   Adopted pattern: task_plan / findings / progress files.

19. https://github.com/teng-lin/notebooklm-py
   Adopted pattern: offline-first Python client taste.

20. https://github.com/travisvn/awesome-claude-skills
   Adopted pattern: skill discoverability.

21. https://github.com/yusufkaraaslan/Skill_Seekers
   Adopted pattern: skill selection heuristics.

22. https://github.com/Jakeschincariol/youtube-agent-skill
   Adopted pattern: YouTube creator workflow.

Where the patterns live:
- local brain lanes + model catalog → `jarvis/local_brain.py`
- agent loop + bounded steps → `jarvis/agent.py`
- on-disk plans → `jarvis/plans.py`, `data/jarvis/plans/`
- compressed memory journal → `jarvis/memory.py`, `data/jarvis/memory.jsonl`
- focus mode → `jarvis/adhd.py`
- repository maps → `jarvis/agent.py::repo_map`

All third-party projects remain under their own licences; nothing is vendored.
