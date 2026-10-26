# SunnyAI

Google AI model routing registry for SunnyAI.

## J.A.R.V.I.S. · MARK IX

A complete local-first voice assistant now ships in this repository: cinematic
HUD, voice input and spoken replies, system telemetry, files, notes, tasks,
reminders, timers, alarms, weather, news, media, WhatsApp/email drafts, vision
and long-term memory — with an approval gate and audit trail around every
high-impact action.

v1.3.0 adds **real desktop control** (type, hotkeys, mouse, window focus, screen OCR),
**real sending** (SMTP email, .ics calendar events, WhatsApp auto-send), an
**installable phone app** (PWA + Termux launcher) and a **coding agent** that
patches files with a backup and runs the project's own tests — on top of the local
Qwen brain, agent loop, compressed memory and focus mode. **99 tools**, still
stdlib-only.

Hands-free voice is tuned for real rooms: wake-word aliases, instant beep,
barge-in that stops a reply when you start talking, backoff instead of a hot
mic loop, and a **Barge-in** switch in Settings. `python3 jarvis.py
--desktop-check` prints exactly which desktop helpers are missing, and
`docs/DESKTOP_DEMO.md` is the 10-minute live demo script.

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
