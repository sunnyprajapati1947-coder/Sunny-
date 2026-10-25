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
| Authenticated dashboard (401 without token) | **WORKING** | `ServerTests` (8 tests) + jsdom UI smoke 20/20 |
| Streaming chat (SSE) | **WORKING** | real HTTP test + browser UI |
| Provider chain: Gemini REST streaming, OpenAI-compatible, local llama.cpp, breaker | **WORKING (code)** — **live key ke bina untested** | `ProviderTests` against a fake Gemini server |
| Hindi / Hinglish replies | **PARTIAL** | prompt + language setting hai; quality model par depend karti hai |
| Voice input (browser STT) | **PARTIAL** | Chrome/Android par chalta hai, Firefox par nahi |
| Voice output (browser TTS) | **PARTIAL** | device ki voices par depend karta hai |
| Termux notification / TTS tools | **BLOCKED in sandbox** | code hai, `termux-api` package + app phone par chahiye |
| Local llama.cpp lanes | **NEEDS SETUP** | `automation/start_fast_lane.sh` + GGUF model |
| Auto task planning by model | **PARTIAL** | model ko step-by-step chalata hai; model offline ho to step honestly fail hota hai |
| Trading / real-money actions | **NOT IMPLEMENTED** (jaan-boojh kar) | — |

Koi bhi feature "working" sirf tab likha hai jab test ya real call se verify hua. Jo verify nahi hua,
wahan "untested" likha hai.

---

## 2. Install (Termux, Android 16, OPPO/ARM64)

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

### Option B — local llama.cpp (offline, free)

```bash
bash automation/start_fast_lane.sh     # existing Nova lane, port 8081
python3 run_jarvis.py doctor           # "local model lanes ... up" dikhna chahiye
```

`jarvis` khud `http://127.0.0.1:8081/v1` aur `:8080/v1` ko probe karta hai (Nova ke `config/nova.env`
se URLs bhi padh leta hai).

### Bina key ke kya hota hai

Brain "offline mode" mein chalta hai: memory, tools, tasks, git, python — sab kaam karte hain, lekin
free-form jawab nahi. Wo saaf-saaf bolta hai ki model configured nahi hai — jhooth nahi bolta.

Provider order (`auto` mode): **Gemini → OpenRouter → OpenAI → Groq → DeepSeek → local lanes → offline**.

---

## 4. Dashboard tour

Phone-first dark UI, 5 tabs:

- **Chat** — streaming replies, tool events dikhte hain, "speak" button, mic button, approval banner.
  Chat history SQLite mein rehti hai (Setup se off kar sakte ho).
- **Tasks** — naya task (title, goal, steps), status chips, per-step detail, pause/resume/cancel/requeue,
  progress bar, aur pending approvals.
- **Memory** — search, add, edit, forget. Kya yaad hai wahi model ko prompt mein milta hai.
- **Tools** — har tool ka risk level aur "Run manually" (JSON args ke saath).
- **Setup** — provider/model, API key, privacy toggle, audit log, token lock.

### Approvals ka matlab

`medium`/`high` risk tool turant nahi chalta:

1. App ek approval banata hai, jisme **exact arguments ka hash** hota hai.
2. Dashboard par approval card aata hai (tool + arguments).
3. **Approve & run** karne par wahi call chalti hai; arguments badal do to hash mismatch → block.
4. Approval **single-use** hai aur default 600s mein expire hoti hai.

Iska matlab: model koi aur file/command chupke se nahi chala sakta.

---

## 5. Tools aur risk

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

Sandbox rules jo code mein enforced hain:

- har path project root ke andar resolve hota hai (`../` escape → `blocked`)
- `fs_write` sirf allowlisted extensions, 400 KB limit, 2 MB se badi file overwrite nahi
- web fetch private/loopback hosts refuse karta hai
- python snippet mein `socket`, `urllib`, `subprocess`, `os.system` → refuse
- tool output `untrusted` mark hota hai, prompt mein data ke roop mein jaata hai, instruction nahi
- keys/tokens output mein redact hote hain

---

## 6. Tasks: crash ke baad kya hota hai

- Status: `PENDING → RUNNING → DONE | FAILED | BLOCKED | CANCELLED`, beech mein `PAUSED`.
- Har state change pehle SQLite mein likhti hai, phir UI ko dikhti hai.
- Process band hote waqt jo task `RUNNING` tha, next start par **PAUSED** ho jata hai with reason
  ("Interrupted: process restarted…") — stuck nahi rehta, aur chupke se dobara nahi chalta.
- Retries bounded hain (`max_retries`, default 2). Terminal task `run` karne se restart nahi hota —
  pehle **Requeue** karna padta hai.
- `depends_on` wala task tab tak `BLOCKED` hai jab tak dependency `DONE` na ho.

---

## 7. Memory

- Kinds: `preference`, `project`, `decision`, `task`, `fact`, `note`.
- FTS5 available ho to full-text search, warna `LIKE` fallback (`stats.fts` batata hai).
- **Secret refusal**: API key / token / password jaisa text memory mein nahi jaata — error aata hai
  ("Refused: that looks like a credential").
- Web se aayi memory ki confidence kam (≤0.5) hoti hai.
- `~/.openjarvis/secrets.env` hi credentials ki jagah hai, memory nahi.

---

## 8. Data kahan rehta hai

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

## 9. CLI

```bash
python3 run_jarvis.py doctor [--json]
python3 run_jarvis.py serve [--port 8787] [--host 0.0.0.0] [--lan]
python3 run_jarvis.py token                 # URL + token
python3 run_jarvis.py chat "aaj ka plan banao"
python3 run_jarvis.py tasks [--sweep] [--status RUNNING]
python3 run_jarvis.py tasks --action pause --task-id tsk_xxx
python3 run_jarvis.py memory [--search nova] [--add "yaad rakho ..."] [--forget 3]
```

`python3 -m jarvis ...` bhi wahi commands chalata hai.

---

## 10. Tests

```bash
python3 -m unittest tests.test_jarvis_app -v     # 44 tests, ~6s
```

Kya cover hota hai: config + secret permissions, DB migration/corruption, memory (CRUD, secret refusal,
FTS), approvals (pending/single-use/arg-binding/expiry), tool sandbox escapes, python timeout, task
lifecycle/retries/sweep/deps, Gemini streaming + breaker (fake server), brain tool loop + budget,
approval flow, aur poora HTTP server (401, chat SSE, memory CRUD, tasks, settings/secrets split).

UI ka apna smoke test jsdom se chalta hai (repo ke bahar, dev-only):

```bash
# 20/20 checks: token gate, chat stream, memory, tasks, tools, settings, lock
JARVIS_TOKEN=$(cat ~/.openjarvis/dashboard.token) node /tmp/uitest/smoke.mjs
```

---

## 11. Troubleshooting

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

---

## 12. Kya abhi bhi baaki hai (honest backlog)

- Python 3.9/3.10 ke liye TOML fallback (abhi 3.11+ required).
- Real Gemini/OpenRouter ke saath live verification — sandbox mein key nahi thi, isliye sirf fake-server test hua.
- Model-driven multi-step planning ki quality (abhi steps aap/CLI dete ho, ya model single-step chalata hai).
- Fine-tuned Hindi/Hinglish voice (browser TTS/STT par depend).
- Trading tools — jaan-boojh kar nahi banaye.
- PWA install prompt (dashboard local hai; browser tab/bookmark kaafi hai).
