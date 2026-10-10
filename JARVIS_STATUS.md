# JARVIS — Project Status

> Ye file master instructions (#16) ke hisaab se persistent status hai.
> Terminal/device restart ke baad isi se kaam resume hota hai.

**Owner:** Boss (OPPO CPH2695, Android 16, ARM64, ~7.4GB RAM, Termux)
**Repo:** ~/Nova (branch: arena/648528ed-sunny)
**Foundation:** Nova/SunnyAI core + adapted modules (GITHUB_SOURCES.md me 15 sources)
**Last updated:** 2026-10-10 (v4)

## Phase status (master plan ke mutabik)

| Phase | Kya | Status |
|---|---|---|
| 1 | Environment inspect + backup + reliable startup | ✅ DONE — `jarvis-start`, `jarvis-doctor`, `setup_termux.sh` |
| 2 | Local brain + Hindi/Hinglish chat + model routing + web research | ✅ DONE — Qwen 1.7B fast lane, Hinglish personality, fast↔deep fallback (deep down = fast pe girta hai), web_search/fetch |
| 3 | Memory + task planning + checkpointing | 🟡 PARTIAL — chat memory (60 turns) + personal facts + task queue/verifier code hai; Jarvis loop me task-engine wiring baaki |
| 4 | GitHub + coding tools + safe self-update | 🟡 PARTIAL — git tools code me hain; `git pull` manual hai, self-update system baaki |
| 5 | Android/Termux features + dashboard + voice | 🟡 PARTIAL — voice (TTS/STT) + phone control (open/torch/clipboard/volume/brightness/battery/notification) DONE; web dashboard baaki |
| 6 | CBSE study assistant + market research | ✅ DONE — study_plan/quiz/tips (Class 10, Board 2027, 75+ target) + market_analyze (analysis-only) |
| 7 | YouTube automation | 🟡 DEFERRED (master plan ke mutabik) — render/queue/upload code repo me maujood hai, integration baad me |

## Aaj ke fixes (2026-10-10)

1. **Deep-lane offline bug**: complex prompts dead deep lane (8080) pe jaate the
   → ab fast lane pe fall back karta hai (`fast_fallback`). "Offline" jhooth band.
2. **App open bug**: `am` Termux PATH pe nahi hota — ab `/system/bin/am` direct
   use hota hai, isliye "instagram kholo" ab **app** kholta hai (browser nahi).
3. **Speed**: context 12→8 turns, normal replies 350 tokens (detail maange tab 800),
   anti-repeat ke saath. 1.7B pe phone par reply time noticeable kam.
4. **News quality**: ab news page fetch karke **asli headlines** padhta hai,
   sirf site ke naam nahi.
5. **Phone control**: torch on/off, clipboard read/write, volume, brightness
   intents add hue.
6. **Study coach**: CBSE Class 10 syllabus + MCQ quiz + 75+ tips (Hinglish).

## Rozana commands

```bash
jarvis-start          # lane check + Jarvis (setup ke baad kahin se bhi)
jarvis-doctor         # poora health check + fix hints
# ya manually:
bash ~/Nova/automation/start_fast_lane.sh
python3 ~/Nova/jarvis.py
```

## Recovery (restart ke baad)

```bash
bash ~/Nova/automation/jarvis_background.sh boot   # Termux:Boot app ke saath auto-start
# ya manually:
cd ~/Nova && git pull && jarvis-start
```

## Known limitations (honest)

- STT har baar Google dialog kholta hai (~2-3s) — Termux limitation, continuous
  mic nahi. Wake-word phase 8+ me.
- 1.7B chhota model hai: kabhi kabhi Hinglish bhool kar English me jawab de
  ya galat ho. 4B option hai par phone par slow.
- Board 2027 ka final syllabus CBSE se confirm karna (study module note hai).
- Web dashboard (phase 5) abhi nahi bana.
- Torch ke liye Termux app ko Camera permission chahiye.

## v4 update (2026-10-10, raat)

1. **Permission denied fix**: automation/*.sh ab executable bits ke saath
   commit hote hain + setup khud chmod karta hai.
2. **jarvis-update** (phase 4 ✅): `bash automation/jarvis_update.sh` ya
   Jarvis se bolo "jarvis update kar lo" — fetch -> dikhao -> apply ->
   test -> fail pe khud rollback. Voice intent bhi hai.
3. **WhatsApp + Dial** (phone control ✅): "919876543210 ko whatsapp pe
   bhejo ki aaj meeting hai" -> wa.me chat pre-filled message ke saath;
   "phone lagao" -> dialer. Send/call button hamesha Boss ke haath me.
4. **Setup me purana galat model URL hata diya** (ab download_model.sh
   hi ek matra model source hai).

## Agla kaam (priority order)

1. Web dashboard — Iron Man HUD (phase 5 completion)
2. Task engine ↔ Jarvis loop wiring (phase 3 completion)
3. YouTube pipeline integration (phase 7)
4. Wake-word / fast STT research
