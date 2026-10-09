# Troubleshooting

Start with `./doctor.sh`. Each line is PASS, FAIL, WARN or NOT TESTED, with a hint.

| Symptom | Cause | Fix |
|---|---|---|
| `local model OFFLINE` | llama.cpp server is not running on the URL in `nova.toml` | Start your existing server, or `NOVA_START_LLAMA=1 ./start.sh` with `NOVA_LLAMA_SERVER_BIN` set. Rules-based tools still work. |
| `prompt too large for the model's context window` | Chat history + system prompt exceed `-c` | Start a new `nova chat`, or restart llama-server with `-c 2048` or more. |
| `model did not produce a valid action JSON` | Small model ignored the JSON format | Ask a simpler request, or use a rules phrase (see README). The task stays FAILED with the reason; nothing is faked. |
| `NOT AVAILABLE: termux-battery-status not found` | Termux:API missing | Install the Termux:API app from F-Droid or GitHub releases, then `pkg install termux-api`. |
| Voice input returns nothing | Mic permission or Termux:API speech service missing | Grant microphone permission to Termux:API; test with `termux-speech-to-text` directly. |
| `not approved ... Nothing was executed` | Command or code needs approval and Nova is not interactive | Use `nova chat` or `nova task run` in a terminal and answer `y`. |
| `blocked by safety policy` | Destructive or secret-exposing command | Intended. Do the step manually if you really need it. |
| `update refused: remote ... not in update.trusted_remotes` | Repo origin differs from the trusted list | Edit `[update] trusted_remotes` in `nova.toml` only if you trust the new source. |
| `uncommitted local changes in nova-phone-ai` | You edited Nova's own files | Commit or stash them, then update. |
| `secrets.env` warning | File readable by other users | `chmod 600 ~/.nova-phone/secrets.env` |
| Daemon not running after reboot | Termux process stopped | Run `./start.sh` again. Unfinished tasks resume automatically. |
| Phone sleeps and daemon stops | Android battery optimisation | Set Termux to "Unrestricted" battery use; optionally `NOVA_WAKE_LOCK=1 ./start.sh` (uses more battery). |
| Database locked | Two Nova processes writing at once | Wait a few seconds; `./stop.sh` then `./start.sh`. |

## Collecting a useful report

```bash
./doctor.sh --offline > report.txt
tail -n 80 ~/.nova-phone/logs/nova.log >> report.txt
```
Secret values are never printed by Nova. Still check `report.txt` before sharing it.
