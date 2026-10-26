# Baaki kya hai — MARK XI ke baad ka honest checklist

**Updated:** 26 Oct 2026 · **Build:** v1.5.1 MARK XI

Yeh list "kya karna hai" ka sach hai, marketing nahi. Har item ke saath likha hai
ki woh **aapke haath** mein hai ya **code** mein, aur kitna kaam hai
(S = 1 ghanta se kam, M = aadha din, L = kai din).

---

## 0 · Aaj ki asli sthiti

| Cheez | Status |
| --- | --- |
| Tools | **123** capabilities, 16 categories (`python3 jarvis.py --check`) |
| Jarvis tests | **141** tests, sab pass (7 focused files) |
| Live prove hua | fake FreeLLMAPI gateway se poora route flow (`route:freellmapi`, `X-Routed-Via`), voice intents, time parsing, HUD |
| **Live prove nahi hua** | asli pollinations endpoint (sandbox se reachable nahi — fake gateway se poora flow test hua), asli FreeLLMAPI / OmniRoute, Gemini, Ollama/Qwen, desktop control (headless), Termux phone hand, Windows, macOS |
| Brain abhi | **keyless lane** (bina API key) + local reflexes — phone par internet ho to general sawaal bhi |

Yani **machine ka har hissa taiyaar hai, par asli duniya se wiring abhi baaki hai.**

---

## 0.1 · v1.5.1 mein band ho gaya

* **Keyless lane** — bina key wala brain (`text.pollinations.ai`), default on,
  `JARVIS_KEYLESS=0` se off. HUD chip `KEYLESS`, cooldown 90 s, koi status-poll
  network call nahi. 42 route tests.
* **Ek command Termux boot** — `bash automation/termux_jarvis.sh up`.
* **HUD bug fix** — `routeLane` TDZ error jo poora status render tod deta tha.
* **`models_connected` / `route_status`** keyless ko honestly dikhate hain.
* Guide: `docs/TERMUX_ONLY.md`.

---

## 1 · Aapke haath mein (har ek 10 minute)

| # | Kaam | Kaise | Kya khulega |
| --- | --- | --- | --- |
| 1.1 | **Gemini key** | `export GEMINI_API_KEY=...` | Cloud reasoning + screen/camera vision + planner |
| 1.2 | **Local Qwen** | `python3 jarvis.py --brain-setup` → `ollama pull qwen3:4b` | Private offline brain, agent loop |
| 1.3 | **Free gateway** (optional) | `curl -fsSL https://freellmapi.co/install.sh \| bash` ya `npm i -g omniroute && omniroute` | 5–600+ free models; keyless lane ke bina bhi chalta hai |
| 1.4 | **Desktop helpers** | `sudo apt install xdotool wmctrl tesseract-ocr scrot xclip` | Asli typing, hotkeys, window focus, OCR |
| 1.5 | **Phone hand** | Termux + Termux:API app → `bash automation/termux_jarvis.sh install` | Call, SMS, torch, camera, contacts, location |
| 1.6 | **SMTP email** | `JARVIS_SMTP_HOST/USER/PASS` | Asli email bhejna (abhi draft) |
| 1.7 | **Media control** | `sudo apt install playerctl` | Play/pause/next asli player par |

---

## 2 · P0 — safety aur correctness (main kar sakta hoon)

| # | Kaam | Kyun zaroori | Effort |
| --- | --- | --- | --- |
| 2.1 | **HUD auth + origin check** | HUD default `0.0.0.0` par khulta hai, **koi token nahi**. Same Wi-Fi par koi bhi `POST /api/command`, `/api/settings`, `/api/desktop` bhej sakta hai; koi bhi website CSRF kar sakti hai (JSON body Content-Type check ke bina parse hota hai). Fix: default `127.0.0.1`, optional `JARVIS_TOKEN`, `Origin`/`Host` allowlist, per-IP rate limit. | M |
| 2.2 | **Jarvis CI** | `.github/workflows/` mein sirf Nova ka **scheduled** job hai — Jarvis tests kabhi CI mein nahi chalte, push/PR par kuch nahi chalta. Chahiye: `jarvis.yml` → `unittest discover` + `--check` + jsdom HUD smoke. | S |
| 2.3 | **Nova ka `requests` bug** | Clean machine par 10 tests error dete hain (`github/local_ai_agent/tools/web.py` → `import requests`). Fix: dependency file ya lazy import. Tabhi "sab tests green" sach hoga. | S |
| 2.4 | **Asli gateway test** | FreeLLMAPI/OmniRoute sirf fake server se test hue. Asli gateway ke saath: 429 handling, bade prompts, non-`auto` model names, timeouts. | S (aap gateway chalao) |
| 2.5 | **Server API tests** | `tests/test_server.py` hi nahi — `/api/command`, approval flow, static files, 404, `/api/file` traversal par automated guard nahi. | M |
| 2.6 | **`LICENSE` file** | Repo par koi license nahi. Public share karne se pehle decide karna zaroori (MIT? private?). | S |

---

## 3 · P1 — product gaps (jo turant mehsoos hote hain)

| # | Kaam | Detail | Effort |
| --- | --- | --- | --- |
| 3.1 | **PC auto-start** | systemd user unit (Linux), launchd plist (macOS), Task Scheduler (Windows). Abhi sirf manual `python3 jarvis.py`. | S |
| 3.2 | **Phone boot auto-start** | `install_termux_background.sh` sirf **Nova** ko uthata hai, Jarvis ko nahi. Termux:Boot hook chahiye. | S |
| 3.3 | **One-command installer** | `install.sh` — Python check, optional deps, env file, `--check`, phir HUD. Abhi 6 manual steps hain. | S |
| 3.4 | **Streaming replies** | Routes abhi `"stream": False` — poora jawab banne ke baad dikhta hai. SSE se token-by-token, HUD mein typing effect. | M |
| 3.5 | **Route telemetry** | `tokens` meta mein aata hai par kahin jama nahi hota. Chahiye: per-route calls, tokens, fail rate, p95 latency + HUD sparkline. | M |
| 3.6 | **HUD browser smoke test repo mein** | jsdom harness har turn `/tmp` mein banti hai; repo mein `tests/hud/` hona chahiye taaki CI bhi chala sake. | S |
| 3.7 | **Windows / macOS pass** | Code paths hain, kabhi chale nahi. Ek-ek machine par `--check`, desktop, voice, paths (backslash) verify + docs. | M |
| 3.8 | **Packaging** | `pyproject.toml` + `pipx install .` se `jarvis` command; optional PyInstaller single-file (video Day 43). | M |

---

## 4 · P2 — naye capabilities (bade kaam)

| # | Kaam | Kyun | Effort |
| --- | --- | --- | --- |
| 4.1 | **Semantic memory** | Abhi BM25 keyword match hai. Embeddings (local Qwen ya free route) se "kal wali baat" jaisi fuzzy recall. | M |
| 4.2 | **Offline STT** | HUD voice browser ke Web Speech API par hai (Chrome + internet). Vosk / whisper.cpp se Hindi + Hinglish offline. | L |
| 4.3 | **Google Workspace lane** | Gmail read/send (OAuth), Calendar events (abhi `.ics` files), Drive search. Aapke Google apps already connected hain — Jarvis ko bhi de sakte hain. | L |
| 4.4 | **Vision lane** | Local Tesseract (screen text) + Termux camera + Gemini vision. Abhi vision = Gemini only. | M |
| 4.5 | **Agent PR flow** | Coding agent patch + test karta hai; branch → commit → PR tak ka safe flow chahiye (approval ke saath). | M |
| 4.6 | **Per-task model pinning** | "coding ke liye qwen2.5-coder", "fast jawab ke liye `auto:fast`" — preference store + intent. | S |
| 4.7 | **Key encryption** | `data/jarvis/routes.json` mein keys plaintext hain (chmod 600). OS keyring ya passphrase encryption. | M |
| 4.8 | **Backup / restore** | Memory, settings, plans, routes ek zip mein export/import. Abhi manual file copy. | S |
| 4.9 | **Devanagari intents** | Hinglish Roman hai; देवनागरी voice input ke liye normalisation chahiye. | M |

---

## 5 · Jaan-boojh kar nahi kar rahe

* **Voice cloning** — licensed/browser voices only (aapka pehle ka decision).
* **User text ko shell mein daalna** — koi `shell=True` nahi, sab allow-listed argv.
* **Bina approval destructive action** — armed gate + audit trail hi rehta hai.
* **Cloud-only brain** — local-first architecture, cloud optional.

---

## 6 · Meri recommendation — agle 3 kaam

1. **2.1 HUD auth** (safety) + **2.2 Jarvis CI** + **2.3 `requests` fix** → ek hi pass mein ho sakta hai, phir `main` hamesha green.
2. **2.4 Asli keyless endpoint test** — phone par `route test keyless` chala kar batao; agar 429/401 aaye to main doosra no-key endpoint jod dunga.
3. **3.1 + 3.3 auto-start + installer** → "PC on, Jarvis on" wala feel.

Bas bolo kaunsa number uthaun — main usi par kaam shuru kar deta hoon.
