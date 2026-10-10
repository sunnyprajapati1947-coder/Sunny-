# Sunny ji ka Personal Jarvis: Plan aur Progress

Last update: 2026-10-10 · Branch: `arena/0ad0d18b-sunny` · Latest commit: `9c132eb`

Legend: ✅ ho gaya · 🔄 chal raha hai · ⬜ abhi nahi hua · ⏸️ deferred (sabse last mein)

Rule: Jarvis phone par chalega (Termux, Python). PC/Mac/Windows setup nahi. Jarvis khud phone ko control nahi karta; har phone action ke liye aapki permission chahiye.

---

## Phase 1: Andar ka Jarvis (phone par chal raha hai)

- ✅ Terminal chat (`python jarvis_personal.py --chat`)
- ✅ Phone browser page (`--web`), premium UI, orb, chips, "online" status (screenshot se confirm)
- ✅ Hinglish default reply, "Sunny ji" address (`/call` se badal sakte hain)
- ✅ Explicit Hindi sirf tab jab aap current message mein maangein
- ✅ Tasks: `/task add`, plan, done (aap type karte hain, model tasks nahi banata)
- ✅ Memory: notes RAM aur files mein; last 3 exchanges ka context
- ✅ Reminders: sirf banner aur startup reminder (koi phone action khud nahi chalta)
- ✅ Live news/mausam/price ka honest jawab (internet access nahi hai, ye seedha bataya jaata hai)
- ✅ Local brain (port 8080) + backup brain (port 8081, loopback only); fallback sirf connection error par
- ✅ Keepalive: crash hone par auto-restart; permanent error (port busy) par endless retry nahi
- ✅ Voice OFF by default (sirf owner enable kare)
- ✅ Tests: 100 pass (personal, tasks, web, keepalive, cloud, delivery, start, source registry)

## Phase 2: Cloud jawab (`/ask-cloud`) (abhi yahi atka hai)

- ✅ Code: `jarvis_cloud.py` (Gemini REST, key sirf env se, no tools, no redirect, error mein key nahi)
- ✅ `/ask-cloud QUESTION` → approval token → `/confirm TOKEN` (ek sawal, ek confirm)
- ✅ Privacy: sirf sawal ka text jaata hai; notes, tasks, chat history nahi jaate
- ✅ Browser mein Confirm card aur ☁ "Cloud (Gemini)" bubble
- ✅ JS bug fix (escaped newline) + JS syntax test
- ✅ Docs: `JARVIS_PERSONAL_SETUP.md` ka cloud section
- ✅ Starter zip rebuild (19 entries, `jarvis_cloud.py` included)
- ✅ Phone par web UI chal raha hai
- ❌ **Phone par key set nahi hui** (`echo` ne `key length: 0` dikhaya). Keepalive bina key ke chal raha hai.
- ⬜ Key set karke `/ask-cloud` ka pehla real test
- ⬜ Phone (Termux) se Gemini API tak network chalta hai ya nahi, ye verify karna hai

## Phase 3: Ten GitHub sources

Recorded hain (pinned commit, role, license caution): `jarvis_start.py`, `GITHUB_SOURCES.md`.
Ye abhi active features nahi hain.

- ✅ Ten sources ka catalog
- ⬜ Sunny ji ka pick: kaunse sources pehle integrate karne hain
- ⬜ Pehla source: `public-apis/public-apis` (free APIs ki list, Jarvis se search)
- ⬜ Doosra: `EbookFoundation/free-programming-books` (books search)
- ⬜ Teesra: `VoltAgent/awesome-agent-skills` (skills ideas)
- ⬜ Chautha: `codecrafters-io/build-your-own-x` (projects list)
- ⬜ `browser-use/jev-ultrafast`, `open-jarvis/OpenJarvis`: Python 3.12 chahiye, phone (Python 3.14) par seedha nahi; alag Linux env ya future plan
- ⬜ `NandhaKishorM/laya`: abhi review baaki
- ⬜ `TauricResearch/TradingAgents` (financial): aapka faisla pending
- ⬜ `trailhq/Graft`: review baaki
- ⬜ `FlashML-org/FreeVideo`: GPU chahiye; phone par local inference supported nahi (catalog mein `false`)
- ⬜ Docs ka FreeVideo row (`JARVIS_START_HERE.md`)
- ⬜ Purane "nine source" wale test assertions ko update karna (`tests/test_jarvis_start.py`, `tests/test_jarvis_source_registry.py`)

## Phase 4: Phone ki jaankari aur hardware

- ✅ Diagnostics: ARM64, Python 3.14.6, ~7.44 GiB RAM, 26G free storage
- ⬜ Android version aur phone model
- ⬜ Backup brain (8081) ke liye RAM test (kitna model chal sakta hai)
- ⬜ `JARVIS_PHONE_SETUP.md` banana (phone-specific commands)
- ⬜ `automation/prepare_jarvis_linux.sh` banana (agar Linux env chahiye)

## Phase 5: Deferred (sabse last mein)

- ⏸️ Termux:API (phone actions: SMS, call, notification, etc.) — permission-gated, abhi nahi
- ⏸️ Voice (TTS, wake word) — Termux:API signature issue pehle theek hoga
- ⏸️ Phone actions ke liye approval flow testing

## Sunny ji se decisions chahiye

1. Pehle kaunse sources integrate karne hain (Phase 3 ka pick)?
2. `TradingAgents` (financial) abhi off rakhna hai?
3. Financial automation: kya Jarvis paise se related kaam kare, ya sirf jaankari de?
4. Offline-only operation chahiye ya cloud fallback bhi theek hai (abhi per-question cloud hai)?
5. GPU host (jaise cloud GPU) ka koi plan hai ya nahi?

## Abhi ka next step

1. Keepalive ko `Ctrl+C` se band karein.
2. `read -rs GEMINI_API_KEY && export GEMINI_API_KEY` (key paste karein, screen par kuch nahi dikhega).
3. `echo "key length: ${#GEMINI_API_KEY}"` → lamba number aana chahiye.
4. `bash automation/jarvis_web_keepalive.sh` → naya link browser mein kholiye.
5. Chat mein `/ask-cloud ...` → Confirm dabayein. Jo result aaye wo yahan paste karein.

---

## Master spec: phase-wise status (2026-10-10)

Ye section "PERSONAL JARVIS AI — COMPLETE MASTER INSTRUCTIONS" ke phases ko repo ke actual status se milata hai. Jo ✅ hai wahi test ya user ke phone output se verify hai.

### Phase 1: Inspect, backup, repair OpenJarvis, startup/diagnostics

- ✅ Environment inspection script: `automation/jarvis_inspect.sh` (read-only; API key sirf length dikhata hai). Sandbox par syntax aur output check ho chuka hai.
- ⬜ Phone par script chalana: Termux mein ek baar, aur Ubuntu proot mein ek baar. Output user paste karega.
- ⬜ Qwen generation error ka current status: purana `logs/qwen.log` mein Qwen3.5-4B Q4 par ek request poori hui dikhti hai (crash nahi). Lekin 1.7B Q8 ka load pehle fail hua tha (`JARVIS_OFFLINE_SETUP.md`). Naye Q8 model par reply test abhi nahi hua.
- ✅ OpenJarvis base CLI (Ubuntu proot, Python 3.12.3, `/opt/jarvis-venv`): user ne `jarvis --version` aur `pip check` chalaye (README ke mutabiq).
- ⬜ Backup: OpenJarvis aur `~/Jarvis/jarvis-github` ka backup (`automation/jarvis_inspect.sh` ke output ke baad).
- ⬜ Startup launcher `jarvis-start`: abhi ye naam nahi bana. Abhi `jarvis_web_keepalive.sh` aur `jarvis_personal.py --chat/--web` hain.
- ⚠️ Spec mein `/root/OpenJarvis` aur Python 3.13.5 likha hai. Repo ke latest docs ke mutabiq active setup Ubuntu proot ka `/opt/jarvis-venv` (Python 3.12.3) hai. Inspection output se final confirm hoga.

### Phase 2: Local brain, Hinglish chat, model routing, web research

- ✅ Hinglish chat, local brain fallback (8080 → 8081), live-info honesty.
- ⬜ Model routing (task ke hisaab se model chunna): abhi sirf fallback hai, routing nahi.
- ⬜ Online research (web search, page fetch, source save): abhi band hai. Ise alag permission ke saath banana hai.
- ⬜ Model/RAM test: phone par 8081 backup brain ke liye RAM check.

### Phase 3: Memory, task planning, execution, verification, recovery

- ✅ Tasks (owner-typed), checkpoints ka base (`tasks/task_state.py`, `tasks/state.json`), notes memory.
- ⬜ Searchable long-term memory, memory review/delete command, backup system.
- ⬜ Retry limits, timeouts, auto-resume after restart: abhi pura nahi.

### Phase 4: GitHub, private backups, coding tools, safe self-update

- ✅ Session branch par code push ho raha hai (GitHub connection sandbox mein kaam karta hai).
- ⬜ Private backup repository, update review aur rollback system: abhi nahi.
- ⬜ Blindly unknown scripts execute na karne ka rule: design mein hai, pura enforce nahi hua.

### Phase 5: Android/Termux features, dashboard, voice

- ✅ Web dashboard (basic: chat, chips, status, reminders).
- ⏸️ Termux:API (notification, clipboard, file ops): deferred. Pehle signature issue theek karna hai.
- ⏸️ Voice input/TTS: deferred.

### Phase 6: CBSE Class 10 study module, creative tools, read-only market research

- ⬜ CBSE 2027 study module: abhi nahi bana. Pehle syllabus verify karna hoga (official CBSE site se).
- ⬜ Market research (read-only, paper trading): abhi nahi. Real-money trade kabhi nahi.

### Phase 7: YouTube automation, more modules

- ⏸️ Abhi nahi. Core stable hone ke baad.

## Recovery (agar terminal ya phone restart ho jaaye)

1. Termux: `cd ~/Jarvis/jarvis-github && git pull`
2. Key chahiye ho to: `read -rs GEMINI_API_KEY && export GEMINI_API_KEY` (cloud ke liye; sirf is session mein).
3. Web UI: `bash automation/jarvis_web_keepalive.sh` (naya token print hoga).
4. Health: `bash automation/jarvis_inspect.sh`
5. Koi kaam adhura ho to `tasks/state.json` mein status dekhein. Jo status `COMPLETED` nahi, use "unfinished" maanein.
6. Sandbox/GitHub branch: `arena/0ad0d18b-sunny`. Nayi kaam ki commit yahin.

## Next command (phone)

Termux mein:
```
cd ~/Jarvis/jarvis-github && git pull && bash automation/jarvis_inspect.sh
```

Ubuntu proot mein (wahi repo wali path, ya ek copy):
```
bash ~/Jarvis/jarvis-github/automation/jarvis_inspect.sh
```
Agar proot mein repo nahi hai, to sirf wo script copy karke chalayein. Dono outputs paste karein.
