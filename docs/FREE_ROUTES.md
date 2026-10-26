# Free routes — free models ka poora catalogue, Jarvis ke andar

Gemini key nahi hai? Ollama nahi chal raha? Bas ek **free gateway** chala do aur
Jarvis ke paas sau se zyada models aa jayenge — ek hi key ke saath, zero bill.

Yeh guide do cheezein cover karti hai: **setup** (3 minute) aur **demo**
(3 minute), aur end mein woh **honest picture** — kaun route, kaunsa model,
kitna time.

---

## 0 · How it works (one paragraph)

Do open-source gateways aapke saare free API keys ko ek **OpenAI-compatible
endpoint** mein lapet dete hain. Jarvis us endpoint ko ek **route** ki tarah
samajhta hai: base URL + model (`auto` = gateway khud best free provider chunta
hai). Route ke andar ka model badalne par Jarvis ko kuch nahi badalna padta —
gateway `X-Routed-Via` header mein batata hai ki asli answer kis platform/model
ne diya, aur Jarvis wahi sach aapko dikhata hai.

| Gateway | Default endpoint | Model | Install | Key |
| --- | --- | --- | --- | --- |
| **FreeLLMAPI** | `http://127.0.0.1:3001/v1` | `auto` | `curl -fsSL https://freellmapi.co/install.sh \| bash` ya Docker | `freellmapi-…` (dashboard `:3001`) |
| **OmniRoute** | `http://127.0.0.1:20128/v1` | `auto` | `npm install -g omniroute && omniroute` | koi bhi string |
| **Keyless** | `https://text.pollinations.ai/openai` | `openai-fast` | kuch nahi | ❌ nahi chahiye |

* **FreeLLMAPI** — 34 free providers, ~635 endpoints, ~7.4B free tokens/month,
  keys SQLite mein encrypted, local-first. Docker:
  `docker run -d --name freellmapi -p 3001:3001 -v freellmapi:/app/data ghcr.io/freellmapi/freellmapi:latest`
* **OmniRoute** — 60+ providers, OpenAI ↔ Claude ↔ Gemini format translation,
  quota tracking, `--mcp` mode. Dashboard `http://localhost:20128`.

Dono ko ek saath chalane ki zaroorat nahi — Jarvis dono ko parallel probe karta
hai aur jo pehle jawab de use use karta hai.

### 0.1 Teesra, sasta option — keyless lane

Kuch bhi install nahi karna? Jarvis ke paas ek **keyless** lane already hai:
koi bhi public OpenAI-compatible endpoint jo bina key chalta hai
(default `https://text.pollinations.ai/openai`, model `openai-fast`).

```bash
export JARVIS_KEYLESS=1          # default already on
# ya apna no-key server:
export JARVIS_KEYLESS_URL=http://192.168.1.20:8080/v1
export JARVIS_KEYLESS_MODEL=llama3
```

* **Best-effort** hai: rate limit ya downtime par 90 second ke liye chup ho jati
  hai aur Jarvis saaf bolta hai ki route ne jawab nahi diya.
* Local gateways (`freellmapi`, `omniroute`) usse pehle priority par hain — jab
  woh chal rahe hain, keyless lane sirf backup hai.
* HUD footer ise `KEYLESS` chip se dikhata hai jab sirf yahi lane ready ho.
* Band karna ho: `export JARVIS_KEYLESS=0`.

---

## 1 · Setup

### 1.1 Gateway chalao (koi ek)

FreeLLMAPI:

```bash
curl -fsSL https://freellmapi.co/install.sh | bash
# ya
docker run -d --name freellmapi -p 3001:3001 -v freellmapi:/app/data \
  ghcr.io/freellmapi/freellmapi:latest
```

Dashboard `http://localhost:3001` kholo, free providers add karo, aur unified key
(`freellmapi-…`) copy karo.

OmniRoute:

```bash
npm install -g omniroute && omniroute
# dashboard: http://localhost:20128
```

### 1.2 Jarvis ko batao

```bash
export JARVIS_FREELLMAPI_KEY=freellmapi-xxxxxxxx
export JARVIS_OMNIROUTE_KEY=any-string
export JARVIS_BRAIN_MODE=route        # optional: free routes ko pehli pasand banao
```

Ya `config/jarvis.env.example` ki free-route section copy karke
`config/jarvis.env` mein daal do — Jarvis boot par khud load karta hai. Keys
sirf environment se aati hain; repo mein kuch nahi likha jaata.

### 1.3 Check karo

```bash
python3 jarvis.py --check
```

Ya HUD mein bolo:

> **"free route"** · **"route status"** · **"free models lagao"**

```
FREE ROUTE · 1/2 online · 5 models
  freellmapi   online    1.3 ms   auto   groq/llama-3.3-70b-free
  omniroute    offline   cannot reach 127.0.0.1:20128 (Connection refused)
```

Route online nahi hai to Jarvis jhooth nahi bolta — exact command batata hai
jo aapko chalani hai.

---

## 2 · Demo, in order

1. `python3 jarvis.py` — HUD khul jayega. Footer mein **ROUTE chip** dikhega.
2. Settings → **use free models** (ya bolo *"use free models"*). Brain mode
   `route` ho jaata hai.
3. Poocho koi asli sawaal: *"teach me something surprising about octopuses"*.
   Jawab ke saath footer `freellmapi · groq/llama-3.3-70b-free` dikhata hai.
4. Panel mein **TEST ROUTE** dabao — latency, model count, aur serving model
   live aata hai.
5. *"which models are connected"* — Gemini, local Qwen lanes aur dono routes ek
   hi table mein, honest online/offline status ke saath.
6. Gateway band karo (`Ctrl+C`) aur phir wahi sawaal poocho — Jarvis saaf
   bolta hai ki route down hai, par local reflexes chalte rehte hain; koi
   jhoota jawab nahi.

### Apna endpoint jodo

Kahin bhi OpenAI-compatible server chal raha hai (llama.cpp, vLLM, LM Studio,
Ollama ka `/v1`, ya LAN ka koi box)?

> **"add route mybox at http://192.168.1.20:3001/v1 model llama3"**

> **"connect endpoint http://127.0.0.1:8080/v1 as llama"**

> **"remove route mybox"**

Custom routes `data/jarvis/routes.json` mein rehte hain (mode `600`). Key
environment se: `JARVIS_ROUTE_MYBOX_KEY=…`.

---

## 3 · Brain modes

| Mode | Order | Kab use karein |
| --- | --- | --- |
| `auto` (default) | Gemini → local Qwen → free routes | normal din |
| `route` / `free` | free routes → local Qwen | Gemini key nahi, Ollama slow |
| `gemini` | sirf Gemini | cloud quality chahiye |
| `local` | sirf Qwen | offline, private |
| `offline` | koi LLM nahi | sirf tools/intents |

Bolo: *"use auto brain"*, *"use free route"*, *"use local qwen"*, *"use gemini"*,
*"go offline"*. Ek route fail hua to woh 30 second ke liye skip hota hai, taaki
agli baat turant ho.

---

## 4 · Honest attribution

Har route jawab ke saath yeh metadata aata hai:

```json
{"meta": {"provider": "route:freellmapi", "route": "freellmapi",
          "model": "auto", "routed_via": "groq/llama-3.3-70b-free"}}
```

* `provider` — kis lane ne answer diya (`route:freellmapi`, `gemini`, `local`, `offline`)
* `routed_via` — gateway ka `X-Routed-Via`: asli upstream platform/model
* `model` — jo model Jarvis ne maanga (`auto`)

Sab routes down hain to provider `offline` hota hai aur `errors` list batati
hai kaun kyun fail hua.

---

## 5 · Troubleshooting

| Symptom | Fix |
| --- | --- |
| `cannot reach 127.0.0.1:3001` | Gateway band hai — `docker start freellmapi` ya `omniroute` |
| `401` / `403` | Key galat — dashboard se naya unified key, `JARVIS_FREELLMAPI_KEY` update |
| `404` on `/chat/completions` | URL mein `/v1` chhoot gaya (`…:3001/v1`) |
| `429` bahut zyada | Free provider ki limit — model `auto` rakho, gateway rotate kar lega |
| Keyless lane `○ offline` | internet ya endpoint down; 90 s baad khud retry, ya `JARVIS_KEYLESS_URL` do |
| Route online par jawab slow | OmniRoute mein doosra provider ya model `auto:fast` try karo |
| HUD purana dikh raha | Hard refresh; `web/sw.js` cache version `jarvis-v1.5.0` hai |

---

## 6 · Verify (developer)

```bash
python3 -m unittest tests.test_free_routes -v   # 33 tests
python3 jarvis.py --check                       # 123 tools
```

Tests ek stdlib `ThreadingHTTPServer` ko fake gateway banate hain: probe,
model list, `auto` routing, `X-Routed-Via` parsing, 4xx/5xx, timeout, key
masking, per-route cooldown, brain-mode order aur "sab down" ka honest jawab.
