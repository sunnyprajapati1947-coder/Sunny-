---
name: daily-briefing
description: Compose the owner's morning digest from local personal facts, reminders, goals, and pending tasks
tools: personal_briefing, personal_remember, personal_recall, api_weather
---

# Daily Briefing

Adapted from OpenJarvis morning-digest: a spoken daily briefing from personal
signals, fully local.

## Steps

1. Call `personal_briefing` for the digest skeleton (date, time, goals,
   reminders, pending tasks).
2. If the owner's city is known (stored as a preference), call `api_weather`
   with it and add one weather line.
3. Speak the briefing in a warm, short form. Hinglish is fine.
4. Offer to remember anything new the owner mentions.

## Guardrails

- Everything stays on-device; never send personal facts to any network tool.
- If nothing is stored yet, suggest one useful thing to remember.
