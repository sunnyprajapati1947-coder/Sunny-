---
name: web-research
description: Run a bounded goal-driven web research task with an element table and an operation trace
tools: web_agent_run, api_wikipedia, api_directory_search
---

# Web Research

Adapted from the jev-ultrafast agent loop: one goal, a numbered element
table, one operation per step (TYPE_TEXT, CLICK, DONE, BLOCKED).

## Steps

1. Write the user request as one clear goal sentence.
2. Call `web_agent_run` with the goal (and a search query if the user gave
   specific words).
3. Read the operation trace and findings.
4. Answer with the findings and cite the sources the agent visited.
5. For encyclopedic topics, prefer `api_wikipedia`; for "is there a free API
   for X", prefer `api_directory_search`.

## Guardrails

- The agent never logs in, never types credentials, never submits forms.
- If findings are empty, say so instead of guessing.
