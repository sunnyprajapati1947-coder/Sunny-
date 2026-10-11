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

## v5 update (2026-10-10, raat 2)

1. **Phone test fail fix**: trading test ab hermetic hai (real lane pe bhi
   kabhi touch nahi hoga) + trading_desk partial-roles bug fix (adhure model
   output pe deterministic fallback). jarvis-doctor ab fully green hoga.
2. **Speed pack**: personality compact (~60% chhota), context 6 turns,
   default 300 tokens, timeout 60s (NOVA_CHAT_TIMEOUT env) — 1.7B phone
   pe replies noticeably fast; lambi wait pe "offline" jhooth band.
3. **JARVIS WEB HUD** (phase 5 ✅): `jarvis-gui` — browser me Iron Man
   style dashboard (127.0.0.1:8787, local-only, zero dependency):
   - Arc-reactor theme, chat (same brain + memory), browser TTS + mic
     (hi-IN speech recognition), status cards (lane/battery/tools/memory
     auto-refresh), quick buttons (torch, news, time), background UPDATE.
   - /api/tool allowlist se hi safe tools (torch/brightness/volume/open).

## v6 update (2026-10-11)

1. **HUD hata diya** (Boss ka decision): `jarvis-gui` / web dashboard poora
   remove — `core/dashboard.py`, `automation/jarvis_gui.sh`,
   `tests/test_dashboard.py` delete; setup + README se bhi saaf. Voice-first
   hi asli Nova hai.
2. **Gemini smart lane** (naya): chat ab Gemini-first hai —
   `core/gemini_lane.py` Google `generateContent` API (v1beta) se baat
   karta hai, JARVIS_PERSONALITY system prompt + rolling history ke saath;
   default model `gemini-3.7-flash` (env `NOVA_GEMINI_MODEL` se override).
   - Key add command: **`jarvis-gemini-key`** (ya
     `bash automation/add_gemini_key.sh`) — interactive ya key as arg.
   - Key `config/gemini.key` me save (chmod 600), `.gitignore` me protected
     — git me kabhi commit nahi hoti. Env `NOVA_GEMINI_KEY_FILE` se path
     badal sakte ho.
   - No key / net fail / timeout => **local Qwen lane pe apne aap fallback**
     (`via=gemini` vs `via=lane` batata hai kaun jawab de raha tha).
   - `NOVA_GEMINI_ENABLED=0` se Gemini band (sirf local).
   - `jarvis-start` pe "Smart lane: GEMINI ON (model)" dikhta hai; `/status`
     me `gemini=ON/OFF`.
3. Tests: 202/202 pass (10 dashboard tests removed, 13 gemini tests added:
   key lifecycle, gitignore protection, env gates, response parse, network
   fail, brain routing + fallback, key-no-leak).

## Agla kaam (priority order)

1. Task engine ↔ Jarvis loop wiring (phase 3 completion)
2. Offline-message honesty (lane slow vs down)
3. YouTube pipeline integration (phase 7)
4. Wake-word / fast STT research
