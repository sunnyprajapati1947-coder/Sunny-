# SunnyAI

Google AI model routing registry for SunnyAI.

## J.A.R.V.I.S. · MARK XI

A complete local-first voice assistant now ships in this repository: cinematic
HUD, voice input and spoken replies, system telemetry, files, notes, tasks,
reminders, timers, alarms, weather, news, media, WhatsApp/email drafts, vision
and long-term memory — with an approval gate and audit trail around every
high-impact action.

v1.5.0 connects **free model routes**: run
[FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) or
[OmniRoute](https://github.com/ChrisCompton/omniroute) locally and Jarvis
borrows their whole catalogue of free models — one key, no cloud bill. Say
*"free route setup"*, *"use free models"* or *"which models are connected"*;
add any OpenAI-compatible endpoint with *"add route mybox at
http://192.168.1.20:3001/v1"*. Every answer names the route and model that
actually served it (`X-Routed-Via`), and when nothing is online Jarvis says so
plus the exact install command. That builds on v1.4.0's **real hand on the
phone** (call, SMS, notifications, torch, volume, camera, contacts, location
through Termux:API), v1.3.0's **real desktop control**, **real sending** (SMTP
email, .ics calendar events, WhatsApp auto-send), the **installable PWA** and
the approval-gated **coding agent** — on top of the local Qwen brain, agent
loop, compressed memory and focus mode. **123 tools**, still stdlib-only.

Hands-free voice is tuned for real rooms: wake-word aliases, instant beep,
barge-in that stops a reply when you start talking, backoff instead of a hot
mic loop, and a **Barge-in** switch in Settings. `python3 jarvis.py
--desktop-check` prints exactly which desktop helpers are missing, and
`docs/DESKTOP_DEMO.md` is the 10-minute live demo script. `python3 jarvis.py
--phone-check` does the same for the Android hand; `docs/PHONE_HAND.md` is the
phone setup + demo guide, and `docs/FREE_ROUTES.md` wires up the free model
routes behind the `route` brain mode.

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
