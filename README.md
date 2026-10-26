# SunnyAI

Google AI model routing registry for SunnyAI.

## J.A.R.V.I.S. · MARK VIII

A complete local-first voice assistant now ships in this repository: cinematic
HUD, voice input and spoken replies, system telemetry, files, notes, tasks,
reminders, timers, alarms, weather, news, media, WhatsApp/email drafts, vision
and long-term memory — with an approval gate and audit trail around every
high-impact action.

v1.2.0 adds a **local Qwen brain** (Ollama / llama.cpp / LM Studio / vLLM auto-detected,
11-model catalog, RAM-aware recommendation), a **bounded agent loop** with plans
saved to disk, **compressed memory**, **focus mode**, and 84 tools.

```bash
python3 jarvis.py            # HUD on http://localhost:7777
python3 jarvis.py --cli      # terminal console
python3 jarvis.py --check    # self-diagnostic
python3 jarvis.py --brain    # local Qwen status and recommendation
python3 jarvis.py --agent "goal"   # multi-step agent with on-disk plan
```

Runs on the Python standard library alone; every extra package is optional.
Full documentation: **[JARVIS.md](JARVIS.md)**.

## Provider

SunnyAI uses a configured `GEMINI_API_KEY` from the local environment. No API keys are stored in this repository.

## Capabilities

The registry separates text/coding, image, video, audio, embedding, research, computer-use, and music model targets so the application can route tasks by capability.

## Important

Model availability can depend on the Google account, API project, quota, region, preview status, and current Google API lifecycle. A model being listed in the registry does not guarantee access.
