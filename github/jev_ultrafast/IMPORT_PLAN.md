# Nova — jev-ultrafast Import Plan

Source:
browser-use/jev-ultrafast (fastest and cheapest web agent)

What Nova adopted:
- The dynamic, indexed element-table observation format.
- The single-operation step vocabulary: TYPE_TEXT, CLICK, GOTO, DONE, BLOCKED.
- The bounded goal-driven loop with an operation trace.

Where it lives:
- core/web_agent.py (text-mode agent; no browser driver needed on Termux)
- skills/web-research/SKILL.md

Rules:
1. Nova's agent is read-only: no login, no credentials, no form submission.
2. Every fetch goes through Nova's validated web tools.
3. The step budget is hard-capped; the loop can always terminate.
4. Deterministic local policy only — zero model calls per step.
