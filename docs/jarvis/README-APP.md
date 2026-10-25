# JARVIS — phone par chalne wala app (Hinglish guide)

Ye woh **asli app** hai jise tumne maanga tha: Python backend + mobile dashboard, dono ek hi repo mein,
**zero third-party packages**. Plan nahi, chalta hua code.

```
python3 run_jarvis.py doctor     # 16 checks, kya theek hai kya nahi
python3 run_jarvis.py serve      # dashboard + API start
```

Browser mein `http://127.0.0.1:8787/?token=...` kholo — token start hote waqt print hota hai aur
`~/.openjarvis/dashboard.token` mein rehta hai.

---

## 1. Seedha sach (status board)

| Cheez | Status | Kahan verify hua |
|---|---|---|
| Doctor / self-diagnostics | **WORKING** | 16 checks, exit code 0/1/2 — `python3 run_jarvis.py doctor` |
| SQLite memory + FTS search | **WORKING** | `tests/test_jarvis_app.py::MemoryTests` (5 tests) |
| Task engine (pause/resume/cancel/requeue, crash sweep, deps, retries) | **WORKING** | `TaskTests` (6 tests) |
| Approval engine (arg-hash binding, single-use, TTL) | **WORKING** | `ApprovalTests` (3 tests) |
| Tools: memory, fs, system, git, python, web, Termux notify/speak | **WORKING** | `ToolTests` (8 tests) |
| Authenticated dashboard (401 without token, 429 after 12 bad tries) | **WORKING** | `ServerTests` (10 tests) + jsdom UI smoke 28/28 |
| Streaming chat (SSE) | **WORKING** | real HTTP test + browser UI |
| Provider chain: Gemini REST streaming, OpenAI-compatible, local llama.cpp, breaker | **WORKING (code)** — live key/local model ke bina untested | `ProviderTests` against a fake Gemini server |
| **Local brain: Qwen3 4B Q4 GGUF + llama-server** | **WORKING (code + tests)** — asli 2.5 GB model sandbox mein nahi chala | `ModelTests` (7): catalog, cap, resume, start/stop, stale pid; `LocalLaneTests` (3): SSE, tool loop, honest offline |
| **Model manager (download/start/stop/use, 10 GB hard cap, resume)** | **WORKING** | `model status/download/start/stop`, `ServerTests` model API |
| **Skill atlas (saari 1,899 skills model ko sikhati hain)** | **WORKING** | `skills --atlas`, atlas prompt test |
| **Hindi/Hinglish search (skills + memory)** | **WORKING (map-based)** | `फोन` → phone skills, `mere phone ka checkup karo` → Phone checkup, Hindi memory recall |
| **Online hands: public HTTP API + file download** | **WORKING** | `OnlineToolTests` (5 tests): approval, SSRF block, header block, caps |
| **Skill library: 1,889 GitHub skills + 10 native** | **WORKING** | import 1.4s, FTS search, `SkillTests` (9 tests) + UI smoke |
| **Skill run (native, real tools) + approval pause/resume** | **WORKING** | `jarvis-phone-checkup` DONE, `jarvis-memory-export` PAUSED→approve→DONE |
| **Bolo aur kaam shuru (hands-free + wake word + offline intents)** | **WORKING (browser)** | fake recogniser test + real SSE chat; Chrome/Android par mic chahiye |
| **Online access (tunnel)** | **PARTIAL** — script + token auth + rate limit ready; public URL yahan se nahi bana | `automation/jarvis_public.sh`, `ServerTests.test_auth_lockout` |
| Hindi / Hinglish replies | **PARTIAL** | prompt + language setting hai; quality model par depend karti hai |
| Hindi/Devanagari **search** (skills + memory) | **WORKING (67-word Hindi map + variants)** | sandbox: `फोन` 0 hits → phone skills; Hindi memory `मेरा फोन` ab milta hai |
| Voice input (browser STT) | **PARTIAL** | Chrome/Android par chalta hai, Firefox par nahi |
| Voice output (browser TTS) | **PARTIAL** | device ki voices par depend karta hai |
| Termux notification / TTS tools | **BLOCKED in sandbox** | code hai, `termux-api` package + app phone par chahiye |
| Local llama.cpp lanes | **NEEDS SETUP** | `automation/start_fast_lane.sh` + GGUF model |
| Auto task planning by model | **PARTIAL** | model ko step-by-step chalata hai; model offline ho to step honestly fail hota hai |
| Trading / real-money actions | **NOT IMPLEMENTED** (jaan-boojh kar) | — |

Koi bhi feature "working" sirf tab likha hai jab test ya real call se verify hua. Jo verify nahi hua,
wahan "untested" likha hai.

**Android APK (0.3.0)** — `jarvis-v0.3.0` release: `JARVIS-0.3.0.apk` (9.99 MB), `com.sunnyai.jarvis`,
non-debuggable, release-signed. Ismein tasks queue, chat tools, video studio, connections hub, in-app
updater aur foreground-service notification sab bundle hain. Neeche section 1.5 dekho.

| App feature | Status | Verify kaise hua |
|---|---|---|
| Installable APK (Capacitor shell + native bridge) | **WORKING** | GitHub release `jarvis-v0.3.0`, CI run success (`JARVIS Android APK`) |
| Tasks tab: plan → steps → retry (2x) → resume after restart | **WORKING** | jsdom smoke: 2-step task DONE, failure path FAILED→retry DONE, `jp.tasks` persist |
| Chat tools `task_create` / `task_status` / `video_create` | **WORKING** | smoke: tool tag se task bana aur Tasks screen me dikha |
| Video studio: prompt → WebM slideshow → gallery auto-save | **WORKING (WebM slideshow)** | smoke: plan parse, record, `saveToGallery` mime `video/webm`, 1.2 KB base64 payload |
| Connections hub: YouTube key test + in-app search + share sheet | **WORKING** | smoke: key save, search result sheet, share/copy buttons |
| In-app updater (download APK + install notification) | **WORKING (code)** | `downloadUpdate` → DownloadManager → FileProvider install intent |
| "Jarvis ready hai boss" + self-check on start | **WORKING (code)** | `native.js` boot: info → selfCheck → update check → toast/TTS |
| Real AI video footage (Veo/Runway) | **NOT IMPLEMENTED** | paid API key chahiye; abhi sirf slideshow video |
| Auto-post to YouTube/Instagram without user tap | **NOT IMPLEMENTED** | OAuth + platform audit chahiye; abhi share sheet + gallery + captions |
| Background kaam with app closed | **PARTIAL** | foreground service app zinda rakhta hai; WebView force-stop par JS ruk jata hai |


---

## 1.5 Installable APK — bina terminal (recommended)

Phone par bas ek file install karni hai. Termux, Python, `git` — kuch nahi chahiye.

1. Phone ke browser me release page kholo:
   `https://github.com/sunnyprajapati1947-coder/Sunny-/releases/tag/jarvis-v0.3.0`
2. **JARVIS-0.3.0.apk** tap karo → "Install unknown apps" allow karo (sirf browser/Files app ke liye).
3. App kholo → Settings → **AI provider** me apni Gemini (ya OpenAI-compatible) key daalo.
   Bina key ke bhi 1,899-skill library, tasks ke local steps aur video script ka offline fallback chalta hai.
4. Pehli baar notification permission maangega — allow karo, warna task-done alerts nahi aayenge.

**Pehli baar ek extra step:** `0.1.0` doosri (throwaway) signing key se bana tha. Agar woh install hai to
Android "App not installed" bolega — purana JARVIS uninstall karke `0.3.0` install karo. `0.3.0` se aage
signing key fix hai (release notes me signer SHA-256), isliye aage ke updates seedhe install ho jayenge.

**Andar kya hai**

- Tasks tab: goal likho → JARVIS steps banata hai → ek-ek step chalata hai → fail par 2 retry → app band
  karke kholne par pending kaam khud resume.
- Chat tools: `task_create`, `task_status`, `video_create` — chat se hi kaam queue hota hai.
- Video studio (`#/video`, Connections se khulta hai): prompt → script → animated scenes → WebM
  `Movies/JARVIS` me auto-save. Vertical 9:16, square, landscape — teen sizes.
- Connections: YouTube Data API key test + in-app YouTube search, WhatsApp/Instagram/X share sheet,
  caption copy, device health (notifications, install permission, free storage).
- Updater: naya `jarvis-v*` release aate hi banner; tap karo → APK download → install notification.

**Seedit baat (limits)**

- Video AI footage nahi hai — text scenes + animation ka WebM. Real footage ke liye Veo/Runway jaisi
  paid API chahiye, tabhi sach me footage banega.
- Social "manage" ka matlab abhi: content banao, gallery me save, caption copy, share sheet se post.
  Bina tap auto-post nahi hota — YouTube upload ke liye OAuth + audit chahiye.
- App online brain (Gemini/OpenAI-compatible) use karta hai. Phone band ho to kaam rukta hai;
  foreground service sirf process zinda rakhta hai.

---

## 2. Optional: Termux / dev setup (Android 16, OPPO/ARM64)

> Sirf development, tests aur local llama.cpp ke liye. Normal use ke liye section 1.5 ka APK kaafi hai.

```bash
pkg update && pkg install python git termux-api
# optional: llama.cpp lane ke liye
pkg install clang cmake
```

Repo pehle se clone hai to:

```bash
cd /root/OpenJarvis        # ya jahan repo hai
git pull
python3 tools/jarvis_audit.py --project . --out "$HOME/jarvis-audit"   # read-only audit (optional)
```

Koi `pip install` nahi chahiye. Python 3.9+ chahiye (`tomllib` 3.11+ hai; 3.9/3.10 par config file
padhne ke liye ek fallback chahiye — **isliye 3.11+ recommended**).

### Start

```bash
cd /root/OpenJarvis
bash automation/jarvis_start.sh            # foreground, 127.0.0.1:8787
bash automation/jarvis_start.sh --bg       # background + pidfile
bash automation/jarvis_start.sh --lan      # phone ke browser se khulne ke liye
bash automation/jarvis_start.sh status
bash automation/jarvis_start.sh stop
bash automation/jarvis_start.sh doctor
```

`--lan` sirf tab use karo jab wifi trusted ho: dashboard token se protected hai, lekin LAN par koi bhi
token guess nahi kar sakta — phir bhi public wifi par na kholo.

Chhota alias (chahe to `~/.bashrc` mein):

```bash
alias jarvis-start='bash /root/OpenJarvis/automation/jarvis_start.sh --bg --lan'
```

---

## 3. Model kaise lagayein

### Option A — Gemini free tier (sabse aasan)

1. <https://aistudio.google.com/apikey> se free key lo.
2. Dashboard → **Setup → API key** → Gemini chuno → paste → **Save key**.
3. Key `~/.openjarvis/secrets.env` mein 0600 permission ke saath jaati hai, `config.toml` mein kabhi nahi.
4. Turant provider switch ho jata hai; koi restart nahi.

CLI se bhi:

```bash
python3 run_jarvis.py --help           # commands list
# ya dashboard hi use karo — recommended
```

Verify: `/api/status` mein `provider.active = "gemini"`.

### Option B — local Qwen3 4B brain (offline, free, tumhare phone par)

Ye wahi cheez hai jo tumne maangi thi: **Qwen3 4B (Q4_K_M)** JARVIS ka dimaag ban jata hai, sab kuch
phone par, koi cloud nahi. Model file **2.5 GB** hai, RAM mein ~4 GB leta hai, licence Apache-2.0.

**Babal — 3 command**

```bash
python3 run_jarvis.py model list                  # 3 models, size + RAM
python3 run_jarvis.py model download              # default: Qwen3-4B-Instruct-2507 Q4_K_M (2.5 GB)
python3 run_jarvis.py model start                 # llama-server + auto-activate
```

Bas. `model start` khud `provider.mode = local` aur `local.fast_url = http://127.0.0.1:8081/v1` likh deta hai,
isliye dashboard ka Chat turant local brain se jawab dene lagta hai.

Dashboard se bhi ho jata hai: **Setup → Local brain (offline)** card → *Download* → *Start* → *Use*.
Download progress bar wahin dikhta hai (page band kar do to bhi download chalta rehta hai, server side job hai).

**llama-server chahiye** (ek baar ka kaam, Termux/Debian proot):

```bash
pkg install clang cmake git
git clone https://github.com/ggml-org/llama.cpp ~/llama.cpp
cd ~/llama.cpp && cmake -B build -DGGML_NATIVE=ON && cmake --build build -j4 --target llama-server
# JARVIS ise khud dhoondh leta hai: ~/llama.cpp/build/bin/llama-server
# ya batao: export JARVIS_LLAMA_SERVER=/path/to/llama-server
```

Build slow lage to Hugging Face/llama.cpp releases se ARM64 binary bhi le sakte ho — bas
`llama-server` naam se `PATH` mein ho. `python3 run_jarvis.py doctor` bata dega mila ya nahi.

**Model ke bare mein**

| id | file | size | RAM | kab |
|---|---|---|---|---|
| `qwen3-4b-instruct-q4` *(default)* | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2.5 GB | ~4.0 GB | normal chat + tool calling |
| `qwen3-4b-q4` | `Qwen3-4B-Q4_K_M.gguf` | 2.5 GB | ~4.5 GB | sochta hai pehle, phone par slow |
| `qwen3-1.7b-q4` | `Qwen3-1.7B-Q4_K_M.gguf` | ~1.1 GB | ~2.2 GB | kam RAM, halka kaam |

- **10 GB hard cap:** `config.toml` mein `[models] max_gb = 10.0`. Cap se bada download shuru hi nahi hota,
  aur agar server galat size bhejne lage to adhoora `.part` file delete kar diya jata hai. Cap 0.5–64 GB
  ke beech hi set ho sakta hai — 10 se zyada tabhi jab phone mein jagah ho.
- **Resume:** `.part` file rehti hai; dobara `model download` chalao, HTTP `Range` se wahin se shuru hota hai.
- **Context:** default `min(4096, model ka native)` — 4 GB phone par itna hi theek hai. `[models] context = 8192`
  se badha sakte ho (RAM bhi badhegi). `threads = 0` = CPU cores − 1.
- **Stop:** `model stop` — pehle SIGTERM, 4 second baad SIGKILL. Sirf wahi pid kill hota hai jo
  `/proc/<pid>/cmdline` mein `llama` dikhaye; stale pidfile ko chhu bhi nahi sakta.
- **Logs:** `~/.openjarvis/logs/llama-server.log`; `python3 run_jarvis.py model logs -n 40`.

> Sach: is sandbox (x86_64, no llama-server binary, no 2.5 GB download) mein asli Qwen3 inference **nahi**
> chala. Jo verify hua: catalog size, download cap/resume, fake llama-server ke saath start→activate→stop,
> stale-pid safety, aur CLI/HTTP paths. Asli model ka pehla run tumhare phone par hoga — `model start`
> fail ho to log tail turant bata dega (aksar `cmake` build missing ya RAM kam).

### Option C — pehle se bana local lane

Agar tumhare paas Nova ka lane already hai (`http://127.0.0.1:8081/v1`, `:8080/v1`), JARVIS use bhi
probe karta hai. `start` ke baad `[local] fast_url` likha jaata hai, isliye dono saath chal sakte hain.

### Bina key ke kya hota hai

Brain "offline mode" mein chalta hai: memory, tools, tasks, git, python — sab kaam karte hain, lekin
free-form jawab nahi. Wo saaf-saaf bolta hai ki model configured nahi hai — jhooth nahi bolta.

Provider order (`auto` mode): **Gemini → OpenRouter → OpenAI → Groq → DeepSeek → local lanes → offline**.

---

## 4. Dashboard tour

Phone-first dark UI, 6 tabs:

- **Chat** — streaming replies, tool events dikhte hain, "speak" button, mic button, approval banner.
  Chat history SQLite mein rehti hai (Setup se off kar sakte ho).
- **Tasks** — naya task (title, goal, steps), status chips, per-step detail, pause/resume/cancel/requeue,
  progress bar, aur pending approvals.
- **Memory** — search, add, edit, forget. Kya yaad hai wahi model ko prompt mein milta hai.
- **Tools** — har tool ka risk level aur "Run manually" (JSON args ke saath).
- **Skills** — 1,899 skills ki search, pack filter, native skill run, task result.
- **Setup** — provider/model, **Local brain card** (Qwen3 download/start/stop), API key, privacy toggle,
  audit log, token lock.

### Approvals ka matlab

`medium`/`high` risk tool turant nahi chalta:

1. App ek approval banata hai, jisme **exact arguments ka hash** hota hai.
2. Dashboard par approval card aata hai (tool + arguments).
3. **Approve & run** karne par wahi call chalti hai; arguments badal do to hash mismatch → block.
4. Approval **single-use** hai aur default 600s mein expire hoti hai.

Iska matlab: model koi aur file/command chupke se nahi chala sakta.

---

## 5. Skills — GitHub ki 1,889 skills

Skill library repo ke andar hi hai (`apps/jarvis-pocket/data`, 23 packs), download ki zaroorat nahi:

- **1,889 imported skills** — SKILL.md / agents / commands / rules / workflows / guides
  (ECC 395, claude-skills 362, agents 325, scientific-agent-skills 223, marketing 154, …)
- **10 native skills** — seedha phone ke tools chalate hain, model ke bina bhi:
  `phone checkup`, `repo report`, `daily plan`, `web research`, `python calc`, `save note`,
  `notify`, `speak`, `memory export`, `security check`.

Pehla sync ~1.4s leta hai aur DB mein ~10 MB (zlib compressed). Dashboard → **Skills** tab:
search, pack filter, details, **Run**. Sync dobara chahiye to Setup → *Re-sync skill library*.

**Kaise chalta hai**

- Native skill = steps ka JSON, har step ek asli tool (`system_info`, `git_status`, `fs_write`, …).
- Imported skill = instructions model ko di jaati hain (3-step task: load → plan → execute with tools).
  Bina API key ke imported skill honestly FAIL ho jati hai ("model required") — fake success nahi.
- Risky steps (file write, python, notify) **apni approval** maangte hain; task `PAUSED` hota hai.
  Approve karke **Run/Resume** dabao — wahi task wahin se aage chalta hai, naya kaam nahi banta.

CLI/API se bhi:

```bash
curl -s -H "x-jarvis-token: $(cat ~/.openjarvis/dashboard.token)" \
  "http://127.0.0.1:8787/api/skills?q=pdf&limit=5"
curl -s -X POST -H "x-jarvis-token: …" -H 'content-type: application/json' \
  -d '{"inputs":{}}' http://127.0.0.1:8787/api/skills/jarvis-phone-checkup/run
```

---

### 4b. Skills ko brain mein "sikhana" — sach kya hai

Tumne kaha tha "uske andar saari GitHub skills sikha dena". Finetuning nahi hui (wo 4 GB phone par
practical bhi nahi hai). Jo hua wo **retrieval** hai:

- brain ke system prompt mein ek **atlas** jaata hai — kitni skills hain, kaunse 24 packs, aur native
  skills ke naam. Isse model ko pata rehta hai ki uske paas kya hai aur wo "nahi kar sakta" jaldi nahi bolta.
- jab kaam padta hai, model `skill_search` → `skill_show` call karta hai aur us skill ke poore
  instructions padh kar waise hi karta hai. Yani **1,899 skills on-demand available** hain, weights ke andar
  yaad nahi ki gayi hain.
- native skills (phone checkup, memory export, etc.) asli tools chalate hain; imported skills knowledge
  hain — unhe chalane ke liye model chahiye, aur wo baat wahi saaf bolte hain.

Ye model ke saath kabhi gardan nahi modta: `skill_search` result khaali ho to model ko mana karna hi padega.

Atlas command se dekh sakte ho:

```bash
python3 run_jarvis.py skills --atlas
python3 run_jarvis.py skills --search "postgres backup" --limit 5
```

---

## 6. Bolo aur kaam shuru (Tony wala feel)

Chat tab par **hands-free** chip dabao:

1. Mic on, JARVIS sunta rehta hai; bolo *"Jarvis, phone checkup karo"*.
2. "Jarvis" / "hey Jarvis" wake word strip ho jata hai, baaki sentence chat mein chala jata hai.
3. Jawab aata hai, JARVIS bol kar sunata hai, phir wapas sunna shuru — loop chalta rehta hai.
4. Bina API key ke bhi ye commands **sach mein kaam karte hain**:

| Bolo | Kya hota hai |
|---|---|
| "phone checkup karo" | battery/storage/RAM check + memory note |
| "repo report do" | git status + last commits |
| "memory export karo" | approval → JSON backup file |
| "security check karo" | audit events review |
| "aaj ka plan banao" | open tasks + plan note |

Voice input/output browser ki Web Speech API se hai (Chrome/Android). Firefox mein mic nahi chalega —
tab likh kar bolo, kaam phir bhi hoga.

---

## 7. Online — duniya kahin se bhi (tunnel)

Server phone par hi rehta hai; tunnel sirf ek public HTTPS darwaza kholta hai. Data kahin upload nahi hota.

```bash
bash automation/jarvis_start.sh --bg          # server local
bash automation/jarvis_public.sh --check      # kaun sa tunnel tool installed hai
bash automation/jarvis_public.sh              # cloudflared / tailscale / ngrok
```

Cloudflared (free, account nahi chahiye, Debian proot mein):

```bash
curl -L -o /usr/local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
chmod +x /usr/local/bin/cloudflared
bash automation/jarvis_public.sh --tool cloudflared
```

Jo `https://xxxx.trycloudflare.com` URL mile, uske aage `?token=<dashboard.token>` lagao — bas.
(Phone browser mein bookmark bana lo; token dashboard ke Setup se lock/unlock kar sakte ho.)

**Security jo already lagi hai**

- har `/api` call par bearer token (header, cookie ya `?token=`), `hmac.compare_digest`
- ek IP se 12 galat token → 5 minute 429 (brute force slow)
- token logs mein redact hota hai
- `fs_*` project root ke andar pinned, `python_exec` sandboxed, destructive git blocked
- tunnel band karo → app turant offline (server local hi rehta hai)

> Public URL main yahan se nahi bana sakta (sandbox se bahar tunnel allowed nahi). Script, auth,
> rate-limit aur tests ready hain — phone par ek command chahiye.

---

## 8. Tools aur risk

| Tool | Risk | Kya karta hai |
|---|---|---|
| `remember` / `recall` | low | memory save/search |
| `forget` | medium | memory delete (id se) |
| `fs_list` / `fs_read` | low | project root ke andar padhna |
| `fs_write` | medium | file likhna, purani `.bak` bachti hai, extension allowlist |
| `system_info` | low | CPU/RAM/disk/battery/platform |
| `notify` / `speak` | medium | Termux:API notification / TTS |
| `web_search` / `web_fetch` | low | DuckDuckGo HTML + public page text (untrusted) |
| `git_status` / `git_log` / `git_diff` | low | read-only git; destructive flags blocked |
| `python_exec` | medium | isolated temp dir, `-I`, timeout, no network/shell |
| `skill_search` / `skill_show` | low | 1,899 skills mein dhoondo / poora text padho |
| `skill_run` | low | skill ko task bana kar chalao (andar ke risky steps apni approval maangte hain) |
| `tasks_list` / `audit_recent` | low | queue ka haal / recent audit events |
| `http_request` | medium | kisi bhi **public** HTTP API ko GET/POST/PUT/PATCH/DELETE/HEAD — JARVIS ke "online haath" |
| `download_file` | medium | public file project mein laao (default 20 MB cap, executables refuse) |

Sandbox rules jo code mein enforced hain:

- har path project root ke andar resolve hota hai (`../` escape → `blocked`)
- `fs_write` sirf allowlisted extensions, 400 KB limit, 2 MB se badi file overwrite nahi
- web fetch **aur** `http_request`/`download_file` private, loopback, link-local aur reserved hosts refuse karte hain (SSRF guard)
- `http_request` kabhi `authorization`, `cookie`, `host`, `proxy-authorization` header nahi bhejta; body 20 KB tak
- web response sirf 300 KB padha jaata hai, 120 KB model ko jaata hai, aur `untrusted: true` mark hota hai
- `download_file` `.exe/.apk/.so/.sh/.bin` refuse karta hai; purani file `.bak` ban jaati hai
- python snippet mein `socket`, `urllib`, `subprocess`, `os.system` → refuse
- tool output `untrusted` mark hota hai, prompt mein data ke roop mein jaata hai, instruction nahi
- keys/tokens output mein redact hote hain

---

## 9. Tasks: crash ke baad kya hota hai

- Status: `PENDING → RUNNING → DONE | FAILED | BLOCKED | CANCELLED`, beech mein `PAUSED`.
- Har state change pehle SQLite mein likhti hai, phir UI ko dikhti hai.
- Process band hote waqt jo task `RUNNING` tha, next start par **PAUSED** ho jata hai with reason
  ("Interrupted: process restarted…") — stuck nahi rehta, aur chupke se dobara nahi chalta.
- Retries bounded hain (`max_retries`, default 2). Terminal task `run` karne se restart nahi hota —
  pehle **Requeue** karna padta hai.
- `depends_on` wala task tab tak `BLOCKED` hai jab tak dependency `DONE` na ho.

---

## 10. Memory

- Kinds: `preference`, `project`, `decision`, `task`, `fact`, `note`.
- FTS5 available ho to full-text search, warna `LIKE` fallback (`stats.fts` batata hai).
- **Secret refusal**: API key / token / password jaisa text memory mein nahi jaata — error aata hai
  ("Refused: that looks like a credential").
- Web se aayi memory ki confidence kam (≤0.5) hoti hai.
- `~/.openjarvis/secrets.env` hi credentials ki jagah hai, memory nahi.

---

## 11. Data kahan rehta hai

```
~/.openjarvis/
├── config.toml          # settings, koi secret nahi (0600)
├── secrets.env          # API keys (0600)
├── dashboard.token      # bearer token (0600)
├── jarvis.db            # SQLite: memory, chats, tasks, approvals, audit
└── logs/server.log
```

Corrupt DB ho jaye to purani file `jarvis.db.corrupt-<ts>` ban jaati hai, naya DB ban jata hai —
data delete nahi hota.

`JARVIS_HOME` env se poora ghar kahin aur rakh sakte ho (tests isi ka use karte hain).

---

## 12. CLI

```bash
python3 run_jarvis.py doctor [--json]
python3 run_jarvis.py serve [--port 8787] [--host 0.0.0.0] [--lan]
python3 run_jarvis.py token                 # URL + token
python3 run_jarvis.py chat "aaj ka plan banao"
python3 run_jarvis.py tasks [--sweep] [--status RUNNING]
python3 run_jarvis.py tasks --action pause --task-id tsk_xxx
python3 run_jarvis.py memory [--search nova] [--add "yaad rakho ..."] [--forget 3]
python3 run_jarvis.py skills [--sync] [--atlas] [--search TEXT] [--limit 8]
python3 run_jarvis.py model list
python3 run_jarvis.py model status
python3 run_jarvis.py model download [qwen3-1.7b-q4] [--url ...]   # resume + 10 GB cap
python3 run_jarvis.py model start [--port 8081] [--context 4096] [--threads 3]
python3 run_jarvis.py model use qwen3-4b-instruct-q4                # lane switch
python3 run_jarvis.py model stop
python3 run_jarvis.py model logs [--lines 40]
```

`python3 -m jarvis ...` bhi wahi commands chalata hai.

---

## 13. Tests

```bash
python3 -m unittest tests.test_jarvis_app -v     # 83 tests, ~11s
```

Kya cover hota hai: config + secret permissions, DB migration/corruption, memory (CRUD, secret refusal,
FTS), approvals (pending/single-use/arg-binding/expiry), tool sandbox escapes, python timeout, task
lifecycle/retries/sweep/deps, Gemini streaming + breaker (fake server), brain tool loop + budget,
skill import/search/run/resume + Hinglish query normalisation, bilingual memory search, offline voice intents,
model catalog/cap/resume/stale-pid/start-stop
(fake llama-server), atlas prompt, online hands (SSRF, header block, size cap, path escape),
approval flow, aur poora HTTP server (401/429, chat SSE, skills API, model API, memory CRUD, tasks,
settings/secrets split).

UI ka apna smoke test jsdom se chalta hai (repo ke bahar, dev-only):

```bash
# 34/34 checks: token gate, chat stream, skills search+run, hands-free voice,
# memory, tasks, tools, local-brain card, settings, lock
JARVIS_TOKEN=$(cat ~/.openjarvis/dashboard.token) node /tmp/uitest/smoke.mjs

# 22/22 checks for the phone app UI (tabs, task queue + retries, chat tools,
# Connections, video studio + gallery save). Stubbed LLM, real jsdom DOM.
cd tools/pocket-smoke && npm install && npm test
```

---

## 14. Troubleshooting

| Problem | Fix |
|---|---|
| `401` dashboard par | URL mein `?token=...` lagao, ya Setup → token paste |
| `address already in use` | `bash automation/jarvis_start.sh status` → `stop`, ya `--port 8788` |
| Provider "offline" | Setup mein key daalo, ya `start_fast_lane.sh` chalao |
| Gemini 429 | free tier rate limit — thodi der baad, ya local lane |
| Termux tools fail | `pkg install termux-api` + Play Store se Termux:API app |
| Voice input nahi | Chrome/Android browser use karo (Web Speech API) |
| `tomllib` ImportError | Python 3.11+ chahiye |
| Task stuck `RUNNING` | restart — sweep use `PAUSED` kar dega, phir Resume |
| `model start` → "llama-server not found" | llama.cpp build karo ya `JARVIS_LLAMA_SERVER` set karo; doctor dekho |
| `model start` → "port ... busy" | `model stop`, ya `--port 8082` (aur `local.fast_url` khud badal jayega) |
| Download beech mein ruk gaya | wahi command dobara — `.part` se resume hoga, zero se nahi |
| "over the ... limit" | `[models] max_gb` badhao (max 64) ya chhota `qwen3-1.7b-q4` lo |
| Local model bahut slow | `--context 2048 --threads 2`, ya 1.7B model; phone garam hoga to break do |
| Model download ke baad bhi "offline" | `model use <id>` ya dashboard → Local brain → Use |

---

## 15. Kya abhi bhi baaki hai (honest backlog)

- Python 3.9/3.10 ke liye TOML fallback (abhi 3.11+ required).
- Real Gemini/OpenRouter ke saath live verification — sandbox mein key nahi thi, isliye sirf fake-server test hua.
- Public tunnel ka live URL — script tested hai, par is sandbox se bahar tunnel nahi khul sakta.
- Imported skills ko model ke saath end-to-end chalana — code path hai (plan → execute), key ke bina sirf failure path tested.
- Har imported skill ke liye custom native executor — abhi wo knowledge/instructions hain, script nahi.
- Model-driven multi-step planning ki quality (abhi steps aap/CLI dete ho, ya model single-step chalata hai).
- **Asli Qwen3 4B inference ka pehla run phone par hona baaki** — sandbox mein llama-server/2.5 GB model nahi tha.
- Fine-tuning ya LoRA — jaan-boojh kar nahi kiya; skills retrieval se aate hain (upar 4b dekho).
- Hindi/Hinglish search **map-based** hai (67 common Hindi words + 72 stopwords), poora translator nahi. "hindi" jaisi language-name query par 0 hits
  aa sakte hain — skills English mein likhi hain, isliye "translate" ya "hindi translation" search karo.
- `download_file` se resume nahi hota (model downloader mein hota hai) — chhoti files ke liye theek hai.
- Fine-tuned Hindi/Hinglish voice (browser TTS/STT par depend).
- Trading tools — jaan-boojh kar nahi banaye.
- PWA install prompt (dashboard local hai; browser tab/bookmark kaafi hai).
