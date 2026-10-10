# Nova — OpenJarvis Import Plan

Source:
open-jarvis/OpenJarvis (Personal AI, On Personal Devices)

What Nova adopted:
- The local-first personal AI doctrine (cloud only when truly necessary).
- The morning-digest preset idea: a daily briefing from personal signals.
- Personal memory primitives that never leave the device.

Where it lives:
- core/personal_profile.py (remember / recall / forget / briefing)
- skills/daily-briefing/SKILL.md

Rules:
1. The profile is a single local JSON file; no sync, no upload.
2. personal_forget gives the owner a right-to-be-forgotten.
3. Briefings may compose local signals only.
