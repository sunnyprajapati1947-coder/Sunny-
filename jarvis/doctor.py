"""Self diagnostics: `python3 run_jarvis.py doctor`.

Exit codes: 0 all good · 1 warnings · 2 something is broken.
Nothing here is fatal — each check is isolated and reports its own failure.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import sys
import time
from pathlib import Path

CHECKS = []


def check(name, critical=False):
    def wrapper(fn):
        CHECKS.append((name, fn, critical))
        return fn

    return wrapper


@check("python version", critical=True)
def _python(settings):
    version = sys.version_info
    ok = version >= (3, 9)
    return ok, f"{version.major}.{version.minor}.{version.micro}", "" if ok else "need python 3.9+"


@check("home directory", critical=True)
def _home(settings):
    home = settings.home
    if not home.exists():
        return False, str(home), "missing (created on first run of load())"
    mode = oct(home.stat().st_mode & 0o777)
    return True, f"{home} ({mode})", "" if mode in ("0o700", "0o750", "0o755") else "loose permissions"


@check("config file")
def _config(settings):
    if not settings.config_path.exists():
        return False, "missing", "will be created on next start"
    try:
        import tomllib
        tomllib.loads(settings.config_path.read_text(encoding="utf-8"))
        return True, str(settings.config_path), ""
    except Exception as exc:
        return False, str(settings.config_path), f"invalid TOML: {exc}"


@check("secrets file permissions")
def _secrets(settings):
    path = settings.secrets_path
    if not path.exists():
        return True, "not created yet", ""
    mode = oct(path.stat().st_mode & 0o777)
    return mode == "0o600", f"{path} ({mode})", "" if mode == "0o600" else "should be 0600"


@check("database", critical=True)
def _database(settings):
    from .db import open_database

    try:
        db = open_database(settings.db_path)
        row = db.one("SELECT value FROM meta WHERE key='schema'")
        db.close()
        return True, f"{settings.db_path} (schema {row['value'] if row else '?'})", ""
    except Exception as exc:
        return False, str(settings.db_path), f"{type(exc).__name__}: {exc}"


@check("memory store")
def _memory(settings):
    from .db import open_database
    from .memory import MemoryStore

    try:
        store = MemoryStore(open_database(settings.db_path))
        stats = store.stats()
        ok = store.context_block("", budget=200) is not None
        return ok, f"{stats['total']} memories (fts={stats['fts']})", ""
    except Exception as exc:
        return False, "unavailable", f"{type(exc).__name__}: {exc}"


@check("task queue")
def _tasks(settings):
    from .db import open_database
    from .tasks import TaskStore

    try:
        db = open_database(settings.db_path)
        store = TaskStore(db)
        swept = store.sweep()
        stats = store.stats()
        return True, f"{json.dumps(stats)} recovered={len(swept)}", ""
    except Exception as exc:
        return False, "unavailable", f"{type(exc).__name__}: {exc}"


@check("tool registry")
def _tools(settings):
    from .approvals import ApprovalStore
    from .db import open_database
    from .memory import MemoryStore
    from .tools import ToolBox

    try:
        db = open_database(settings.db_path)
        box = ToolBox(settings, db, ApprovalStore(db), MemoryStore(db))
        return True, f"{len(box.list())} tools", ""
    except Exception as exc:
        return False, "unavailable", f"{type(exc).__name__}: {exc}"


@check("provider chain")
def _providers(settings):
    from .providers import Router

    try:
        router = Router(settings)
        status = router.status()
        chain = status["chain"]
        if not chain:
            return False, "no provider configured", "add a key in Settings or start llama-server"
        return True, " -> ".join(chain), ""
    except Exception as exc:
        return False, "unavailable", f"{type(exc).__name__}: {exc}"


@check("gemini api key")
def _gemini_key(settings):
    present = bool(settings.key_for("gemini"))
    return present, "present" if present else "absent", "" if present else "free key: aistudio.google.com/apikey"


@check("local model lanes")
def _lanes(settings):
    from .providers import LocalProvider

    provider = LocalProvider(settings)
    rows = []
    any_up = False
    for url, _ in provider._lanes():
        up = provider.healthy(url, timeout=1.5)
        any_up = any_up or up
        rows.append(f"{url}={'up' if up else 'down'}")
    return any_up, " ".join(rows), "" if any_up else "bash automation/start_fast_lane.sh"


@check("internet")
def _net(settings):
    try:
        socket.setdefaulttimeout(4)
        with socket.create_connection(("github.com", 443), timeout=4):
            return True, "reachable", ""
    except Exception as exc:
        return False, "unreachable", type(exc).__name__


@check("git")
def _git(settings):
    binary = shutil.which("git")
    if not binary:
        return False, "not installed", "needed for git tools"
    if not (settings.project_root / ".git").exists():
        return False, "git missing in project", "run inside the cloned repo"
    return True, binary, ""


@check("termux api")
def _termux(settings):
    bits = [name for name in ("termux-notification", "termux-tts-speak", "termux-battery-status")
            if shutil.which(name)]
    if not os.environ.get("TERMUX_VERSION") and not bits:
        return True, "not a Termux environment", ""
    return bool(bits), f"{len(bits)}/3 commands", "" if bits else "install the Termux:API app + pkg termux-api"


@check("dashboard port")
def _port(settings):
    bind = "0.0.0.0" if settings.allow_lan else settings.host
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind((bind, settings.port))
        return True, f"{bind}:{settings.port} free", ""
    except OSError as exc:
        return False, f"{bind}:{settings.port} busy", f"{exc.errno}: already running?"
    finally:
        sock.close()


@check("disk space")
def _disk(settings):
    usage = shutil.disk_usage(str(settings.home))
    free_gb = usage.free / 2**30
    return free_gb > 0.2, f"{free_gb:.1f} GB free", "" if free_gb > 0.2 else "low storage"


def run(settings, as_json: bool = False) -> int:
    results = []
    failures = 0
    warnings = 0
    for name, fn, critical in CHECKS:
        started = time.time()
        try:
            ok, detail, hint = fn(settings)
        except Exception as exc:
            ok, detail, hint = False, f"check crashed: {type(exc).__name__}", str(exc)[:120]
        results.append({
            "check": name, "ok": bool(ok), "critical": critical,
            "detail": detail, "hint": hint, "ms": int((time.time() - started) * 1000),
        })
        if not ok:
            if critical:
                failures += 1
            else:
                warnings += 1

    if as_json:
        print(json.dumps({"ok": failures == 0, "results": results}, indent=2, ensure_ascii=False))
    else:
        print(f"JARVIS doctor — {settings.assistant_name} on {settings.project_root.name}")
        print("-" * 68)
        for row in results:
            mark = "PASS" if row["ok"] else ("FAIL" if row["critical"] else "WARN")
            print(f"[{mark:4}] {row['check']:<26} {row['detail']}")
            if not row["ok"] and row["hint"]:
                print(f"       -> {row['hint']}")
        print("-" * 68)
        print(f"{len(results)} checks · {failures} fail · {warnings} warn")
        if failures:
            print("fix the FAIL rows above before starting the server")
        elif warnings:
            print("server can start; the WARN rows are optional features")
        else:
            print("everything checks out")
    return 2 if failures else (1 if warnings else 0)
