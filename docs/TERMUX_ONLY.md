# Jarvis sirf phone par — bina API key, ek command

PC ki zaroorat nahi. Termux mein **ek command** aur Jarvis chalu — HUD phone ke
browser mein, haath (call, SMS, torch, camera…) Termux:API se, aur dimaag ke liye
koi API key nahi.

---

## 0 · Ek command

Naya phone (Termux installed, internet on) — yeh ek line paste karo:

```bash
pkg install -y git && git clone https://github.com/sunnyprajapati1947-coder/Sunny-.git ~/Sunny- && bash ~/Sunny-/automation/termux_jarvis.sh up
```

Purana clone already hai? Bas:

```bash
cd ~/Sunny- && git pull && bash automation/termux_jarvis.sh up
```

`up` khud yeh karta hai:

1. `python` + `termux-api` packages check karta hai, missing ho to install.
2. `JARVIS_KEYLESS=1` set karke HUD `127.0.0.1:7777` par start karta hai.
3. `termux-wake-lock` lagata hai taaki Android process na maare.
4. Browser kholta hai + READY panel dikhata hai (HUD URL, brain lane, hands count).

Aage se har baar bas:

```bash
cd ~/Sunny- && bash automation/termux_jarvis.sh up
```

---

## 1 · Key nahi hai, to dimaag kahan se aayega?

Teen layer hain — teeno bina key chalte hain:

| Layer | Kya karta hai | Key chahiye? |
| --- | --- | --- |
| **Keyless lane** | public OpenAI-compatible endpoint (`text.pollinations.ai`), best effort | ❌ nahi |
| **Local reflexes** | 123 tools: time, notes, tasks, timers, weather, news, wikipedia, calculator, files, memory, agent | ❌ nahi |
| **Phone hand** | 17 Termux:API actions | ❌ nahi |

Yani internet ho to general sawaal bhi jawab milte hain; internet na ho to bhi
Jarvis ka har **kaam** chalta rahega (sirf open-ended gyaan nahi).

Keyless lane chalti hai `auto` mode ke teesre step par: Gemini (key nahi) → local
Qwen (nahi chala) → **keyless**. Aap kuch set nahi karte, yeh default hai.

Band karna ho to: `export JARVIS_KEYLESS=0` (ya Settings se brain mode `local`).

---

## 2 · Pehla 5-minute demo

1. `bash automation/termux_jarvis.sh up`
2. Chrome mein HUD khulega → menu → **Add to Home screen** (PWA icon ban jayega).
3. Type karo: `phone check` → 17/17 dikhna chahiye.
4. `torch on` → flashlight. `torch off`.
5. `SMS bhejo 98765xxxxx ko main ghar pahunch raha hoon`
   (approval card aayega → **Approve**).
6. `aaj ka weather` · `news` · `kya hai black hole` (wikipedia) · `10% of 4500`.
7. `hello` bolne ke liye mic button dabao — Chrome ka voice input Hinglish samajhta hai.
8. `free route` → dikhega: **Keyless route: ● ready · no API key needed**.

---

## 3 · Kya phone par poora chalta hai, kya nahi

| ✅ Chalta hai | ❌ Nahi chalta |
| --- | --- |
| HUD + PWA + voice (Chrome) | Desktop control (type/hotkeys/window focus) — PC only |
| 17 phone actions (call, SMS, torch, camera, location…) | Doosri apps ki screen padhna (Android rok deta hai) |
| Notes, tasks, timers, alarms, reminders | Lock-screen par wake word (browser limitation) |
| Weather, news, wikipedia, calculator | — |
| Memory, plans, coding agent (patch + tests) | — |
| Keyless lane se general sawaal | Bade local models (4B+ phone par slow) |

---

## 4 · Settings jo phone ke liye theek hain

| Env | Default | Matlab |
| --- | --- | --- |
| `JARVIS_KEYLESS` | `1` | no-key lane on/off |
| `JARVIS_KEYLESS_URL` | `https://text.pollinations.ai/openai` | koi bhi OpenAI-compatible no-key server |
| `JARVIS_KEYLESS_MODEL` | `openai-fast` | us endpoint ka model |
| `JARVIS_PORT` | `7777` | HUD port |
| `JARVIS_BRAIN_MODE` | `auto` | `route` = keyless/gateway pehle, `local` = sirf reflex + Qwen |

Poori list: `config/jarvis.env.example`.

---

## 5 · Troubleshooting

| Symptom | Fix |
| --- | --- |
| `This script is for Termux on Android` | PC par chal raha hai — wahan `python3 jarvis.py` use karo |
| HUD nahi khula | `bash automation/termux_jarvis.sh status` → phir `termux-open-url http://127.0.0.1:7777` |
| `phone check` mein 0/17 | `pkg install termux-api` + **Termux:API app** install karke ek baar kholo |
| Keyless lane `○ offline` | internet check karo; ya `export JARVIS_KEYLESS_URL=...` apna server do |
| Keyless lane 429/401 | public endpoint rate-limit — 1 minute baad khud theek, ya FreeLLMAPI chala lo |
| Reply dheere | pehla jawab slow ho sakta hai (public lane); local reflexes turant hain |
| Background mein band ho jata hai | battery optimization off + `termux-wake-lock` (script khud lagata hai) |

---

## 6 · Aage kya (optional, jab mann kare)

* **Behtar brain:** FreeLLMAPI/OmniRoute PC ya LAN par → `docs/FREE_ROUTES.md`.
* **Local private brain:** `pkg install llama-cpp` + Qwen3-1.7B Q4 (≈1.2 GB RAM).
* **Gemini:** `export GEMINI_API_KEY=...` → vision + cloud reasoning.
* **PC jaisa control:** wahi repo PC par clone karo, `docs/DESKTOP_DEMO.md`.
