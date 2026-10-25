"""JARVIS — the personal assistant that runs on your own machine.

Layout:
    jarvis/config.py      settings, paths, secrets (never logged)
    jarvis/db.py          sqlite connection + migrations
    jarvis/memory.py      long-term memory (search / update / forget)
    jarvis/providers.py   Gemini, OpenAI-compatible, local llama.cpp + fallback
    jarvis/tools.py       permissioned tools (risk levels, sandbox, audit)
    jarvis/approvals.py   argument-bound one-time approvals
    jarvis/tasks.py       persistent task engine with pause/resume/recovery
    jarvis/brain.py       chat orchestration: context + tool loop
    jarvis/doctor.py      self diagnostics
    jarvis/server.py      local dashboard + JSON API (stdlib only)
"""

__version__ = "1.0.0"
