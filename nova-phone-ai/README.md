# Nova Phone AI

A local, tool-using personal assistant for **Termux on Android**. It talks Hinglish/English, uses your
**existing local llama.cpp model**, and does real work: reads and writes files in a sandboxed workspace,
searches and reads web pages, runs tests and approved commands, keeps memory, and resumes unfinished tasks
after a restart.

- **Cost:** ₹0 by default. Local model, keyless web search, no subscriptions.
- **Dependencies:** Python standard library only. Nothing large to download.
- **Privacy:** local-first. Online models are off unless you turn them on and add your own key.

> Nova does **not** control other Android apps or your screen. Termux:API covers battery, notifications,
> speech, text-to-speech and clipboard. See [What Nova cannot do](#what-nova-cannot-do).

---

## 1. Requirements

| Item | Needed for | Notes |
|---|---|---|
| Termux (F-Droid build) | everything | Install from F-Droid |
| Termux:API **app** | battery, notify, speak, voice, clipboard | Install from F-Droid or the GitHub releases, then grant permissions |
| `python` (3.11+) and `git` | everything | `install-termux.sh` installs them with `pkg` if missing |
| llama.cpp `llama-server` + your GGUF model | the local brain | You already have this (`~/NovaAI/models/Qwen3.5-0.8B-Q4_0.gguf`). Nova does not download models. |

Debian proot works the same way; the installer detects it and skips `pkg`.

## 2. Install (Termux, step by step)

```bash
pkg update && pkg upgrade -y          # optional but recommended
pkg install -y git                     # python is installed by the script if missing
git clone https://github.com/sunnyprajapati1947-coder/Sunny-.git
cd Sunny-/nova-phone-ai
./install-termux.sh
```

The installer:

- creates `~/.nova-phone/` (database, logs, backups, workspace) if missing,
- copies `nova.toml` and `secrets.env` templates **only if they do not exist** (your edits are never overwritten),
- installs a `nova` command, runs `nova init`, and prints an offline `doctor` report.

It never touches `~/NovaAI`, `/root/OpenJarvis`, or any other project, and downloads no model.

Then:

```bash
./start.sh        # checks your llama.cpp server, starts the background daemon
./doctor.sh       # health report: PASS / FAIL / WARN / NOT TESTED
nova chat         # talk to Nova
```

If your llama.cpp server is **not** running, start it yourself the way you already do, for example:

```bash
~/llama.cpp/build/bin/llama-server -m ~/NovaAI/models/Qwen3.5-0.8B-Q4_0.gguf \
  --host 127.0.0.1 --port 8081 -c 2048 -t 4
```

Or let Nova start it: `NOVA_START_LLAMA=1 NOVA_LLAMA_SERVER_BIN=~/llama.cpp/build/bin/llama-server ./start.sh`.
Nova will only stop a llama-server that it started itself (`./stop.sh`).

## 3. Using Nova

| Command | What it does |
|---|---|
| `nova chat` | Interactive chat. `/tools`, `/status`, `/memory`, `/task <goal>`, `/listen` (voice), `/exit` |
| `nova ask "<text>"` | One question or request, e.g. `nova ask "list files"` |
| `nova task add "<goal>" [--steps "a \| b"] --run` | Multi-step task with per-step verification |
| `nova task list` / `show <id>` / `run <id>` / `resume` | Progress and recovery |
| `nova memory show` / `set KEY VALUE` / `forget KEY` | Long-term memory |
| `nova tools` | Lists every tool and whether it needs approval |
| `nova doctor [--offline]` | Health checks |
| `nova status` | Lanes, task counts, daemon heartbeat |
| `nova listen [--ask]` / `nova speak "<text>"` | Voice input / output via Termux:API |
| `nova update check` / `apply --yes` / `rollback` | Safe updates (see §7) |
| `nova config` | Effective settings, with secrets hidden |

### Rules phrases (work even when the model is offline)

- `what time is it` / `aaj ki date kya hai`
- `battery kitni hai` (needs Termux:API)
- `list files` / `read notes.txt` / `read https://example.com/article`
- `create file hello.txt with content namaste duniya`
- `search for python release notes` / `search karo latest AI news`
- `remember my name is Sunny` then `what is my name`
- `run tests` / `run tests in proj/tests`

Anything else goes to the model.

### Example session

```text
You → create file plan.txt with content Aaj: 1) email 2) gym
Nova [rules] → wrote plan.txt (27 bytes, verified)
You → read plan.txt
Nova [rules] → Aaj: 1) email 2) gym
$ nova task add "Check plan" --steps "read plan.txt | list files" --run
task task-...: COMPLETED
  [PASS] step 1: read plan.txt
  [PASS] step 2: list files
```

Steps that are plain words, such as `/task Summarise plan.txt`, go to the model. The model plans the steps and
writes the answer. With a weak model it may fail; Nova then reports FAILED with the reason, and you can retry
with `nova task run <id>`.

## 4. Safety model

- **Workspace sandbox.** File tools only write inside `~/.nova-phone/workspace`. Reads can also cover the project's
  `docs/` and `README.md`. Symlinks that escape are refused.
- **Never writes its own code, config, secrets or database.** The protected list is enforced by the write tools.
- **Secrets files are unreadable to the assistant.** `.env`, `secrets.env`, `*.pem`, `id_rsa*`, `client_secret*`
  and similar names are refused.
- **Command policy.** Commands run with no shell. Read-only commands run directly (`ls`, `git status`,
  `gh repo view`, `python -m unittest`). Everything else needs your approval. Destructive or secret-exposing
  commands (`rm -rf /`, `sudo`, `curl … | sh`, `gh auth token`, `printenv`, `/etc/…`) are blocked.
- **Approval.** In `nova chat` or `nova task run` you are asked `[y/N]`. Background daemon runs deny anything
  that needs approval.
- **Code execution needs approval** (`run_python`, `run_tests`). In the daemon it stays denied unless you set
  `allow_code_exec_in_daemon = true`.
- **Redaction.** API-key-like strings and any value in `secrets.env` are masked in logs, memory and output.
- **Honest results.** A file write is read back and hashed. A task step counts as verified only when its tool
  calls succeeded. The model's claim alone is never treated as proof.

## 5. Memory, tasks and recovery

- Everything lives in `~/.nova-phone/nova.db` (SQLite, WAL). Check it with `nova doctor`.
- Chat history is kept per session and trimmed to a character budget that fits the model's context.
- Each completed step writes a **checkpoint**. After a crash, Ctrl-C, or phone reboot, the daemon (or
  `nova task resume`) continues from the first unfinished step. Completed steps are not re-run.
- Failed steps are retried a bounded number of times (`max_step_retries`). Then the task is marked FAILED
  with the reason, and `nova task run <id>` retries it.
- A task that stops because the model is offline is marked INTERRUPTED and resumes automatically later.

## 6. Online models (optional, OFF by default)

Nova can fall back to any **OpenAI-compatible** endpoint when the local model is unreachable. Free tiers exist
but have rate limits and terms that change; check your provider's current page before relying on one.
Your prompts leave the phone when this is enabled.

Setup:

1. Create a key in your provider's dashboard. **Do not paste it in chat or commit it.**
2. Put it in the private file:
   ```bash
   nano ~/.nova-phone/secrets.env        # set NOVA_ONLINE_API_KEY=...
   chmod 600 ~/.nova-phone/secrets.env   # install-termux.sh creates it with this mode
   ```
3. Enable in `~/.nova-phone/nova.toml`:
   ```toml
   [online]
   enabled = true
   base_url = "https://api.groq.com/openai/v1"   # example OpenAI-compatible endpoint
   model = "your-provider-model-id"              # check the provider's current list
   ```
4. Run `./doctor.sh`. The key is shown only as "present (value hidden)".

Nova uses the online lane only if the local lane fails. The key is sent only in the `Authorization` header to
the configured `base_url`.

## 7. Updates, backups and rollback

```bash
./update.sh                 # check only: shows commits behind, fast-forward status, local changes
./update.sh apply --yes     # refuses unless the remote is trusted and the update is a fast-forward
./update.sh rollback        # returns to the commit before the last applied update
```

Steps `apply` takes: verify the remote is in `update.trusted_remotes` → refuse if you have local edits to
`nova-phone-ai/` → fetch → export the candidate to a temporary folder → run its unit tests there → back up your
current `nova-phone-ai/` as a tarball in `~/.nova-phone/backups/` → fast-forward → verify HEAD. If any step
fails, nothing in your installation changes.

The candidate's tests run code from the upstream commit. That is why `--yes` is required and why the
remote must be one you trust.

## 8. Configuration

Example files: [`config/nova.example.toml`](config/nova.example.toml) and
[`config/secrets.example.env`](config/secrets.example.env). Key settings:

| Setting | Default | Meaning |
|---|---|---|
| `llm.base_url` | `http://127.0.0.1:8081/v1` | Your llama.cpp server |
| `llm.model_path` | `~/NovaAI/models/Qwen3.5-0.8B-Q4_0.gguf` | Checked by doctor only |
| `llm.context_chars` | `5000` | Character budget for history |
| `agent.max_steps` | `6` | Model turns per request |
| `agent.max_step_retries` | `2` | Retries per task step |
| `workspace` | `~/.nova-phone/workspace` | The only folder file-writing tools touch |
| `web.searxng_url` | empty | Optional self-hosted SearXNG; empty = keyless Wikipedia search |

Environment overrides: `NOVA_HOME`, `NOVA_LLM_URL`, `NOVA_LLM_MODEL`, `NOVA_ONLINE_BASE_URL`, `NOVA_SEARXNG_URL`,
`NOVA_START_LLAMA`, `NOVA_LLAMA_SERVER_BIN`, `NOVA_WAKE_LOCK`.

## 9. Scripts

| Script | Purpose |
|---|---|
| `install-termux.sh` | Safe, repeatable install (no overwrites, no model download) |
| `start.sh` | Uses your llama.cpp server if healthy; optionally starts it; starts the daemon |
| `stop.sh` | Stops the daemon and any llama-server Nova started. Leaves yours running. |
| `doctor.sh` | Health checks. `--offline` skips network and model calls. |
| `update.sh` | Check, apply, or roll back updates from a trusted remote |

## 10. Voice, background and Termux:API

- **Voice input:** `nova listen --ask` or `/listen` in chat. Needs Termux:API and microphone permission.
  Nova never starts listening on its own.
- **Voice output:** `nova speak "..."`, or set `voice_tts = true` in `nova.toml`.
- **Background:** `./start.sh` runs `nova daemon` (resumes tasks every `daemon_interval` seconds).
  Android may still stop Termux. Set Termux to unrestricted battery use if you need it to keep running.
- **Notifications and battery:** `phone_notify` and `phone_battery` tools, when Termux:API is installed.

## 11. What Nova cannot do

- Control other apps, tap the screen, or read other apps' content (Android does not allow this to Termux).
- Run a model that does not exist on your phone. It uses the model you run through llama.cpp.
- Guarantee answer quality on a 0.8B model. Tool results are verified; the model's reasoning is not.
- Access the internet through a paid key. Free web search is keyless but rate-limited and may be unavailable.
- YouTube automation (planned for later, not included).

## 12. Testing

```bash
python3 -m unittest discover -s tests -t .
```

The suite covers the security boundary, memory, tools, the agent loop, a real local HTTP model mock,
task recovery after a simulated crash, the daemon, the doctor, the CLI, the update state machine (with real git
repositories), and the shell scripts. A real llama-server test runs when `NOVA_LLAMA_SERVER_BIN` and
`NOVA_TINY_GGUF` are set (see `tests/llama_smoke/make_tiny_gguf.py`).

Status of each feature on real hardware is in [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## 13. Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). Start with `./doctor.sh`.

## 14. Project layout

```
bin/nova                 launcher (symlinked as `nova`)
nova/                    Python package (cli, agent, rules, tasks, tools/, memory, llm, doctor, update, daemon)
config/                  example nova.toml and secrets.env
scripts / *.sh           install-termux.sh, start.sh, stop.sh, doctor.sh, update.sh
tests/                   unit, integration and script tests
docs/                    RESEARCH.md, TROUBLESHOOTING.md, TEST_REPORT.md
```
