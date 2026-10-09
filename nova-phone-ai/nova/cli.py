"""Command line interface: `nova chat | ask | task | tools | memory | doctor | status | daemon | listen | speak | update | config | init`."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys

from nova import __version__
from nova.agent import Agent
from nova.config import Config, load_config
from nova.context import Context, deny_approver, interactive_approver
from nova.llm import LLMError, Router
from nova.memory import Memory
from nova.tools import build_registry
from nova.util import redact

CHAT_SESSION = "chat"
HISTORY_CHARS = 3000


class App:
    """Wires config, memory, tools, router, agent and task runner for one process."""

    def __init__(self, config: Config, interactive: bool):
        self.config = config
        self.config.home.mkdir(parents=True, exist_ok=True)
        self.config.workspace.mkdir(parents=True, exist_ok=True)
        self.memory = Memory(config.db_path)
        self.ctx = Context(config=config, memory=self.memory,
                           approver=interactive_approver if interactive else deny_approver,
                           interactive=interactive)
        self.registry = build_registry()
        self.router = Router(config)
        self.agent = Agent(self.ctx, self.registry, self.router)
        from nova.tasks import TaskRunner
        self.tasks = TaskRunner(self.ctx, self.agent, self.router)

    def close(self) -> None:
        self.memory.close()

    def answer(self, text: str, session: str = CHAT_SESSION, verbose: bool = False) -> tuple[bool, str, dict]:
        history = self.memory.recent_messages(session, HISTORY_CHARS)
        result = self.agent.respond(text, history=history)
        self.memory.add_message(session, "user", text)
        if result.ok:
            self.memory.add_message(session, "assistant", result.answer)
        info = {"lane": result.lane, "ok": result.ok,
                "tools": [{"tool": c.tool, "ok": c.ok, "summary": redact(c.summary)[:200]} for c in result.tool_calls]}
        if result.ok:
            return True, result.answer, info
        if result.error.startswith("model unavailable"):
            hint = "Local model offline? Start it with ./start.sh or check: ./doctor.sh"
        elif result.error.startswith("prompt too large"):
            hint = "Tip: use /exit and start a fresh 'nova chat'."
        else:
            hint = ""
        return False, f"Sorry, kaam poora nahi hua: {result.error}. {hint}".strip(), info


def _print_tools(info: dict) -> None:
    for call in info.get("tools", []):
        mark = "ok" if call["ok"] else "FAILED"
        print(f"  [tool {call['tool']}: {mark}] {call['summary']}")


def cmd_chat(app: App, args) -> int:
    print(f"Nova {__version__} — Hinglish/English chat. Commands: /help /tools /status /task <goal> /memory /exit")
    print("Local model: ", end="")
    healthy, detail = app.router.local.health()
    print("READY" if healthy else f"OFFLINE ({detail}). Rules-based tools still work.")
    while True:
        try:
            text = input("\nYou → ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nNova → Bye.")
            return 0
        if not text:
            continue
        if text in {"/exit", "exit", "quit", "/quit"}:
            print("Nova → Bye.")
            return 0
        if text == "/help":
            print("Type normally. /tools lists tools, /status checks lanes, /task <goal> runs a multi-step task, "
                  "/memory shows saved facts, /listen speaks into the mic (Termux:API), /exit quits.")
            continue
        if text == "/tools":
            print(app.registry.describe())
            continue
        if text == "/status":
            print(json.dumps(app.router.status(), indent=2))
            continue
        if text == "/memory":
            print(app.registry.get("list_memory").fn({}, app.ctx).output)
            continue
        if text == "/listen":
            heard = listen_once()
            if not heard:
                print("Nova → Voice input nahi mila (Termux:API / mic permission check karo).")
                continue
            print(f"You (voice) → {heard}")
            text = heard
        if text.startswith("/task "):
            goal = text[len("/task "):].strip()
            task_id = app.tasks.create(goal)
            print(f"Nova → task {task_id} create hua. Chal raha hai…")
            task = app.tasks.run(task_id)
            print_task(task, app.memory.list_steps(task_id))
            continue
        ok, reply, info = app.answer(text)
        if info["lane"] != "rules":  # rules replies already are the tool output; avoid repeating it
            _print_tools(info)
        print(f"\nNova [{info['lane']}] → {reply}")
        if ok and app.config.voice_tts and shutil.which("termux-tts-speak"):
            subprocess.run(["termux-tts-speak", reply[:800]], check=False, timeout=60)


def print_task(task: dict, steps: list[dict]) -> None:
    print(f"task {task['id']}: {task['status'].upper()}" + (f" — {task['error']}" if task.get("error") else ""))
    for s in steps:
        mark = {"completed": "PASS" if s["verified"] else "UNVERIFIED", "failed": "FAIL"}.get(s["status"], s["status"].upper())
        print(f"  [{mark}] step {s['idx'] + 1}: {s['description']}")


def listen_once() -> str:
    if shutil.which("termux-speech-to-text") is None:
        return ""
    try:
        proc = subprocess.run(["termux-speech-to-text"], capture_output=True, text=True, timeout=40)
    except subprocess.TimeoutExpired:
        return ""
    return proc.stdout.strip() if proc.returncode == 0 else ""


def cmd_ask(app: App, args) -> int:
    ok, reply, info = app.answer(" ".join(args.text), verbose=True)
    if args.json:
        print(json.dumps({"ok": ok, "answer": reply, **info}, ensure_ascii=False, indent=2))
    else:
        _print_tools(info)
        print(reply)
    return 0 if ok else 1


def cmd_task(app: App, args) -> int:
    if args.action == "add":
        steps = [s.strip() for s in args.steps.split("|") if s.strip()] if args.steps else None
        task_id = app.tasks.create(args.goal, steps)
        print(f"created {task_id}")
        if args.run:
            task = app.tasks.run(task_id)
            print_task(task, app.memory.list_steps(task_id))
            return 0 if task["status"] == "completed" else 1
        return 0
    if args.action == "list":
        for t in app.memory.list_tasks():
            print(f"{t['id']}  {t['status']:<12} {t['goal'][:80]}")
        return 0
    if args.action == "show":
        task = app.memory.get_task(args.task_id)
        if not task:
            print("no such task")
            return 1
        print_task(task, app.memory.list_steps(args.task_id))
        return 0
    if args.action == "run":
        task = app.tasks.run(args.task_id)
        print_task(task, app.memory.list_steps(args.task_id))
        return 0 if task["status"] == "completed" else 1
    if args.action == "resume":
        tasks = app.tasks.resume_all()
        if not tasks:
            print("no unfinished tasks")
        for t in tasks:
            print_task(t, app.memory.list_steps(t["id"]))
        return 0
    return 2


def cmd_memory(app: App, args) -> int:
    if args.action == "show":
        print(app.registry.get("list_memory").fn({}, app.ctx).output)
    elif args.action == "set":
        app.memory.set_pref(args.key, args.value)
        print(f"saved {args.key.strip().lower()} (verified={app.memory.get_pref(args.key) == args.value[:2000]})")
    elif args.action == "forget":
        print("forgotten" if app.memory.forget_pref(args.key) else "nothing to forget")
    return 0


def cmd_doctor(app: App, args) -> int:
    from nova.doctor import exit_code, format_report, run_checks
    checks = run_checks(app.config, live=not args.offline)
    print(format_report(checks))
    return exit_code(checks)


def cmd_status(app: App, args) -> int:
    tasks = app.memory.list_tasks()
    counts: dict[str, int] = {}
    for t in tasks:
        counts[t["status"]] = counts.get(t["status"], 0) + 1
    heartbeat = app.config.run_dir / "heartbeat.json"
    out = {"version": __version__, "lanes": app.router.status(), "tasks": counts,
           "daemon_heartbeat": heartbeat.read_text() if heartbeat.exists() else "none",
           "home": str(app.config.home), "workspace": str(app.config.workspace)}
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


def cmd_daemon(app: App, args) -> int:
    from nova.daemon import run_daemon
    print(f"nova daemon started (interval {app.config.daemon_interval}s). Ctrl-C or stop.sh to stop.")
    return run_daemon(app.ctx, app.tasks, app.config.daemon_interval, once=args.once)


def cmd_listen(app: App, args) -> int:
    heard = listen_once()
    if not heard:
        print("NOT AVAILABLE: no speech result (install Termux:API + pkg install termux-api, grant mic permission)")
        return 1
    print(f"heard: {heard}")
    if args.ask:
        ok, reply, info = app.answer(heard)
        print(reply)
        return 0 if ok else 1
    return 0


def cmd_speak(app: App, args) -> int:
    if shutil.which("termux-tts-speak") is None:
        print("NOT AVAILABLE: termux-tts-speak not found (pkg install termux-api + Termux:API app)")
        return 1
    res = subprocess.run(["termux-tts-speak", " ".join(args.text)], capture_output=True, text=True, timeout=90)
    print("spoken" if res.returncode == 0 else f"failed: {res.stderr.strip()[:200]}")
    return res.returncode


def cmd_update(app: App, args) -> int:
    from nova import update
    try:
        if args.action == "check":
            info = update.check(app.config)
            print(json.dumps(info, indent=2))
            return 0
        if args.action == "apply":
            report = update.apply(app.config, confirm=args.yes)
        else:
            report = update.rollback(app.config)
    except update.UpdateError as exc:
        print(f"update refused: {exc}")
        return 1
    print(report.message)
    for step in report.steps:
        print(f"  - {step}")
    return 0 if report.ok else 1


def cmd_config(app: App, args) -> int:
    cfg = app.config
    print(json.dumps({
        "home": str(cfg.home), "workspace": str(cfg.workspace), "config_file": str(cfg.config_file),
        "llm": cfg.llm.__dict__, "online": {**cfg.online.__dict__, "api_key": "(hidden)" if cfg.online_api_key() else "(not set)"},
        "agent": cfg.agent.__dict__, "web": cfg.web.__dict__, "update": cfg.update.__dict__,
    }, indent=2, ensure_ascii=False))
    return 0


def cmd_init(app: App, args) -> int:
    print(f"NOVA_HOME ready: {app.config.home}")
    print(f"database: {app.config.db_path} (integrity: {app.memory.integrity_ok()[1]})")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="nova", description="Nova Phone AI — private assistant for Termux/Android.")
    p.add_argument("--version", action="version", version=__version__)
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("chat", help="interactive chat (Hinglish/English)")
    a = sub.add_parser("ask", help="answer one question")
    a.add_argument("text", nargs="+")
    a.add_argument("--json", action="store_true")
    t = sub.add_parser("task", help="multi-step tasks")
    tsub = t.add_subparsers(dest="action", required=True)
    ta = tsub.add_parser("add")
    ta.add_argument("goal")
    ta.add_argument("--steps", help="explicit steps separated by |")
    ta.add_argument("--run", action="store_true")
    tsub.add_parser("list")
    for name in ("show", "run"):
        tr = tsub.add_parser(name)
        tr.add_argument("task_id")
    tsub.add_parser("resume")
    m = sub.add_parser("memory", help="saved preferences")
    msub = m.add_subparsers(dest="action", required=True)
    msub.add_parser("show")
    ms = msub.add_parser("set")
    ms.add_argument("key")
    ms.add_argument("value")
    mf = msub.add_parser("forget")
    mf.add_argument("key")
    d = sub.add_parser("doctor", help="health checks")
    d.add_argument("--offline", action="store_true", help="skip live network/model checks")
    sub.add_parser("status", help="lanes, tasks, daemon heartbeat")
    dm = sub.add_parser("daemon", help="resume unfinished tasks in background")
    dm.add_argument("--once", action="store_true")
    ls = sub.add_parser("listen", help="voice input via Termux:API")
    ls.add_argument("--ask", action="store_true")
    sp = sub.add_parser("speak", help="speak text via Termux:API")
    sp.add_argument("text", nargs="+")
    up = sub.add_parser("update", help="check/apply/rollback updates from trusted remote")
    up.add_argument("action", choices=["check", "apply", "rollback"])
    up.add_argument("--yes", action="store_true", help="required to test and apply")
    sub.add_parser("config", help="show effective config (secrets hidden)")
    sub.add_parser("init", help="create NOVA_HOME, database and workspace")
    return p


HANDLERS = {"chat": cmd_chat, "ask": cmd_ask, "task": cmd_task, "memory": cmd_memory, "doctor": cmd_doctor,
            "status": cmd_status, "daemon": cmd_daemon, "listen": cmd_listen, "speak": cmd_speak,
            "update": cmd_update, "config": cmd_config, "init": cmd_init}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = load_config()
    if args.command == "doctor":
        # doctor opens the DB itself; avoid double-open issues by using App only for others
        from nova.doctor import exit_code, format_report, run_checks
        checks = run_checks(config, live=not args.offline)
        print(format_report(checks))
        return exit_code(checks)
    app = App(config, interactive=args.command in {"chat", "task", "listen", "ask"} and sys.stdin.isatty())
    try:
        return HANDLERS[args.command](app, args)
    except KeyboardInterrupt:
        print("\nstopped. Unfinished tasks can be resumed with: nova task resume")
        return 130
    except LLMError as exc:
        print(f"model error: {exc}")
        return 1
    finally:
        app.close()


if __name__ == "__main__":
    raise SystemExit(main())
