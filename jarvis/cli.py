"""Command line entry for JARVIS.

    python3 run_jarvis.py doctor        self diagnostics (exit 2 = broken)
    python3 run_jarvis.py serve         start the dashboard (127.0.0.1:8787)
    python3 run_jarvis.py chat "hi"     one turn in the terminal
    python3 run_jarvis.py tasks         list tasks
    python3 run_jarvis.py memory        list memories
    python3 run_jarvis.py token         print the dashboard URL + token

Design notes:
  * every command works with the standard library only
  * `serve` prints the token URL exactly once per start; it is also on disk
  * nothing here needs root, systemd or a container
"""

from __future__ import annotations

import argparse
import json
import sys
import time

from . import __version__, config as config_module


def _fmt_ts(ts: float) -> str:
    return time.strftime("%H:%M", time.localtime(ts)) if ts else "-"


def cmd_doctor(args) -> int:
    from .doctor import run as run_doctor

    settings = config_module.load()
    return run_doctor(settings, as_json=args.json)


def cmd_serve(args) -> int:
    from .server import serve

    settings = config_module.load()
    if args.host:
        settings.host = args.host
    if args.port:
        settings.port = int(args.port)
    if args.lan:
        settings.allow_lan = True
    serve(settings, port=args.port, host=args.host)
    return 0


def cmd_token(args) -> int:
    settings = config_module.load()
    value = config_module.token(settings)
    host = "127.0.0.1" if not settings.allow_lan else "<phone-ip>"
    print(f"{host}:{settings.port}/?token={value}")
    return 0


def cmd_chat(args) -> int:
    from .brain import Brain
    from .db import open_database
    from .memory import MemoryStore
    from .providers import Router
    from .tasks import TaskStore
    from .tools import ToolBox
    from .approvals import ApprovalStore

    settings = config_module.load()
    db = open_database(settings.db_path)
    memory = MemoryStore(db)
    approvals = ApprovalStore(db, ttl=settings.approval_ttl)
    tools = ToolBox(settings, db, approvals, memory)
    router = Router(settings)
    brain = Brain(settings, router, tools, memory, TaskStore(db), db)

    message = " ".join(args.message).strip()
    if not message:
        print("usage: python3 run_jarvis.py chat \"tumhara sawaal\"")
        return 2
    turn = brain.reply(message, history=[])
    if turn.tool_events:
        for event in turn.tool_events:
            print(f"[tool] {event.get('tool')} -> {event.get('status') or event.get('summary', '')}")
    if turn.error and not turn.text:
        print(f"[error] {turn.error}")
        return 1
    print(turn.text)
    print(f"\n[{turn.provider}/{turn.model} · {turn.latency_ms} ms]")
    if turn.approvals:
        print("[approval needed] open the dashboard → Tasks tab to approve, then ask again.")
    db.close()
    return 0


def cmd_model(args) -> int:
    from .models import ModelError, cli as model_cli

    try:
        return model_cli(config_module.load(), args)
    except ModelError as exc:
        print(f"model error: {exc}")
        return 1


def cmd_skills(args) -> int:
    from .db import open_database
    from .skills import SkillLibrary

    settings = config_module.load()
    db = open_database(settings.db_path)
    library = SkillLibrary(db, settings.project_root)
    try:
        if args.sync:
            result = library.sync(force=args.force)
            print(f"synced: {result['new']} new · {result['total']} total · {result['packs']} packs")
        if args.atlas:
            print(library.atlas())
        if args.search:
            rows = library.search(args.search, limit=args.limit)
            for row in rows:
                print(f"{row['id']:<52} [{row['pack']}] {row['title'][:60]}")
            print(f"\n{len(rows)} results")
        if not (args.sync or args.atlas or args.search):
            stats = library.stats()
            print(f"{stats['total']} skills · {stats['imported']} imported · "
                  f"{stats['builtin']} native · {stats['packs']} packs")
            print("native:")
            for row in library.search("", builtin_only=True, limit=20):
                print(f"  {row['id']:<28} {row['title']}")
            print("\nuse --search TEXT, --atlas, --sync")
        return 0
    finally:
        db.close()


def cmd_tasks(args) -> int:
    from .db import open_database
    from .tasks import TaskStore

    settings = config_module.load()
    db = open_database(settings.db_path)
    store = TaskStore(db)
    if args.sweep:
        recovered = store.sweep()
        print(f"recovered {len(recovered)} interrupted task(s)")
    if args.action and args.task_id:
        mapping = {
            "pause": store.pause, "resume": store.resume,
            "cancel": store.cancel, "requeue": store.requeue,
        }
        if args.action == "run":
            task = store.run(args.task_id, lambda task, step: {"ok": True, "detail": "manual run"})
        else:
            task = mapping[args.action](args.task_id)
        print(json.dumps(task.to_dict(), indent=2, ensure_ascii=False))
        db.close()
        return 0
    rows = store.list(args.status or None)
    if not rows:
        print("no tasks")
    for task in rows:
        print(f"{task.id}  {task.status:<9} {task.progress * 100:3.0f}%  {task.title}")
    db.close()
    return 0


def cmd_memory(args) -> int:
    from .db import open_database
    from .memory import MemoryStore, MemoryStoreError

    settings = config_module.load()
    db = open_database(settings.db_path)
    store = MemoryStore(db)
    try:
        if args.add:
            entry = store.add(args.add, kind=args.kind or "fact", subject=args.subject or "", source="cli")
            print(f"saved #{entry.id}")
        elif args.forget:
            print("deleted" if store.delete(int(args.forget)) else "not found")
        rows = store.search(args.search) if args.search else store.list()
        for row in rows:
            print(f"#{row.id:<3} [{row.kind:<10}] {row.text}  ({row.confidence})")
        print(f"\n{store.stats()['total']} memories")
    except MemoryStoreError as exc:
        print(f"refused: {exc}")
        return 1
    finally:
        db.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="run_jarvis.py", description=f"JARVIS {__version__}")
    sub = parser.add_subparsers(dest="command")

    doctor = sub.add_parser("doctor", help="self diagnostics")
    doctor.add_argument("--json", action="store_true", help="machine readable output")
    doctor.set_defaults(func=cmd_doctor)

    serve = sub.add_parser("serve", help="start the dashboard")
    serve.add_argument("--port", type=int, default=0)
    serve.add_argument("--host", default="")
    serve.add_argument("--lan", action="store_true", help="bind 0.0.0.0 (careful on shared wifi)")
    serve.set_defaults(func=cmd_serve)

    token = sub.add_parser("token", help="print dashboard URL + token")
    token.set_defaults(func=cmd_token)

    chat = sub.add_parser("chat", help="single terminal turn")
    chat.add_argument("message", nargs="*")
    chat.set_defaults(func=cmd_chat)

    model = sub.add_parser("model", help="local GGUF brain (download/start/stop)")
    model.add_argument("action", nargs="?", default="status",
                       choices=["list", "status", "download", "start", "stop", "use", "logs"])
    model.add_argument("model_id", nargs="?", default="")
    model.add_argument("--url", default="", help="custom GGUF URL instead of the catalog")
    model.add_argument("--port", type=int, default=0)
    model.add_argument("--context", type=int, default=0)
    model.add_argument("--threads", type=int, default=0)
    model.add_argument("--lines", type=int, default=60)
    model.set_defaults(func=cmd_model)

    skills = sub.add_parser("skills", help="skill library")
    skills.add_argument("--sync", action="store_true")
    skills.add_argument("--force", action="store_true")
    skills.add_argument("--atlas", action="store_true")
    skills.add_argument("--search", default="")
    skills.add_argument("--limit", type=int, default=10)
    skills.set_defaults(func=cmd_skills)

    tasks = sub.add_parser("tasks", help="task queue")
    tasks.add_argument("--status", default="")
    tasks.add_argument("--sweep", action="store_true")
    tasks.add_argument("--action", choices=["pause", "resume", "cancel", "requeue", "run"], default="")
    tasks.add_argument("--task-id", dest="task_id", default="")
    tasks.set_defaults(func=cmd_tasks)

    memory = sub.add_parser("memory", help="memory store")
    memory.add_argument("--add", default="")
    memory.add_argument("--kind", default="")
    memory.add_argument("--subject", default="")
    memory.add_argument("--search", default="")
    memory.add_argument("--forget", default="")
    memory.set_defaults(func=cmd_memory)

    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 0
    return int(args.func(args) or 0)


if __name__ == "__main__":
    sys.exit(main())
