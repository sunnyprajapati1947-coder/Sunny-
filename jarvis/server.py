"""Local dashboard + JSON API.

Standard library only: ThreadingHTTPServer, so it starts on a bare Termux
python3 with no pip install.

Security model
  * binds 127.0.0.1 by default (LAN only if explicitly enabled)
  * every /api route needs the bearer token from ~/.openjarvis/dashboard.token
  * the UI is same-origin static files; no CDN, no analytics
"""

from __future__ import annotations

import json
import mimetypes
import os
import threading
import time
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from . import __version__, config as config_module
from .approvals import ApprovalStore
from .brain import Brain
from .db import open_database
from .memory import MemoryStore, MemoryStoreError
from .providers import ProviderError, Router
from .skills import SkillLibrary, SkillRunner
from .skills.library import SkillError
from .tasks import TaskError, TaskStore
from .tools import ToolBox

STATIC = Path(__file__).resolve().parent / "static"
AUTH_WINDOW = 300.0      # seconds
AUTH_MAX_FAILS = 12      # per IP per window, then 429
_AUTH_LOCK = threading.Lock()
_AUTH_FAILS: dict[str, list[float]] = {}
PUBLIC_PATHS = {"/", "/index.html", "/app.css", "/app.js", "/favicon.svg", "/manifest.webmanifest"}


class App:
    """Wires every component once; the HTTP handler reuses it."""

    def __init__(self, settings):
        self.settings = settings
        self.db = open_database(settings.db_path)
        self.memory = MemoryStore(self.db)
        self.approvals = ApprovalStore(self.db, ttl=settings.approval_ttl)
        self.tasks = TaskStore(self.db)
        self.tools = ToolBox(settings, self.db, self.approvals, self.memory)
        self.skills = SkillLibrary(self.db, settings.project_root)
        self.skill_runner = SkillRunner(self.skills, self.tools, self.tasks, self.db)
        self.tools.attach_skills(self.skills, self.skill_runner)
        self.router = Router(settings)
        self.brain = Brain(settings, self.router, self.tools, self.memory, self.tasks, self.db,
                           skills=self.skills)
        self.recovered = self.tasks.sweep()
        self.started = time.time()
        self.skills_ready = threading.Event()
        self.skills_error = ""
        threading.Thread(target=self._sync_skills, name="skill-sync", daemon=True).start()

    def _sync_skills(self) -> None:
        """Builtins import instantly; the 16 MB pack library arrives in the background."""
        try:
            started = time.time()
            include_packs = os.environ.get("JARVIS_SKILL_PACKS", "1").lower() not in ("0", "false", "no")
            self.skills.sync(include_packs=include_packs)
            self.skills_error = ""
            print(f"skills ready: {self.skills.stats()['total']} in "
                  f"{int((time.time() - started) * 1000)} ms")
        except Exception as exc:
            self.skills_error = f"{type(exc).__name__}: {exc}"
        finally:
            self.skills_ready.set()

    def plan_step(self, task, step, prompt: str) -> dict:
        """Used by imported skills: one model step, honest failure when offline."""
        turn = self.brain.reply(prompt, history=[])
        if turn.provider == "offline" or (turn.error and not turn.text):
            return {"ok": False, "detail": turn.error or "model required for imported skills"}
        if turn.error and not turn.text:
            return {"ok": False, "detail": turn.error}
        return {"ok": True, "detail": (turn.text or "")[:600], "result": turn.text}

    # ------------------------------------------------------------- chats

    def chat_create(self, title: str = "New chat") -> str:
        chat_id = "cht_" + str(int(time.time() * 1000))[-9:] + str(int(time.time()))[-4:]
        now = time.time()
        self.db.execute("INSERT INTO chats(id, title, created, updated) VALUES(?,?,?,?)",
                        (chat_id, (title or "New chat")[:80], now, now))
        return chat_id

    def chat_list(self, limit: int = 40) -> list[dict]:
        rows = self.db.query(
            "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id) AS n "
            "FROM chats c ORDER BY c.updated DESC LIMIT ?", (limit,))
        return [{"id": r["id"], "title": r["title"], "updated": r["updated"], "messages": r["n"]}
                for r in rows]

    def chat_messages(self, chat_id: str) -> list[dict]:
        rows = self.db.query("SELECT * FROM messages WHERE chat_id=? ORDER BY id", (chat_id,))
        return [{"role": r["role"], "content": r["content"], "created": r["created"],
                 "meta": json.loads(r["meta"]) if r["meta"] else {}} for r in rows]

    def chat_append(self, chat_id: str, role: str, content: str, meta: dict | None = None) -> None:
        if not self.settings.store_chats:
            return
        self.db.execute(
            "INSERT INTO messages(chat_id, role, content, meta, created) VALUES(?,?,?,?,?)",
            (chat_id, role, content, json.dumps(meta or {}, ensure_ascii=False), time.time()))
        self.db.execute("UPDATE chats SET updated=? WHERE id=?", (time.time(), chat_id))
        first = self.db.one(
            "SELECT content FROM messages WHERE chat_id=? AND role='user' ORDER BY id LIMIT 1", (chat_id,))
        if first:
            self.db.execute("UPDATE chats SET title=? WHERE id=? AND title='New chat'",
                            (first["content"][:60], chat_id))

    def chat_delete(self, chat_id: str) -> None:
        self.db.execute("DELETE FROM messages WHERE chat_id=?", (chat_id,))
        self.db.execute("DELETE FROM chats WHERE id=?", (chat_id,))

    # ------------------------------------------------------------- status

    def status(self) -> dict:
        settings = self.settings
        provider = self.router.status()
        return {
            "version": __version__,
            "assistant": settings.assistant_name,
            "owner": settings.owner,
            "uptime": int(time.time() - self.started),
            "provider": provider,
            "memory": self.memory.stats(),
            "tasks": self.tasks.stats(),
            "tools": len(self.tools.list()),
            "skills": {**self.skills.stats(), "ready": self.skills_ready.is_set(),
                       "error": self.skills_error},
            "approvals": len(self.approvals.pending()),
            "recovered_tasks": self.recovered,
            "paths": settings.public()["paths"],
            "keys_present": {k: v for k, v in settings.public()["keys_present"].items() if v},
            "store_chats": settings.store_chats,
        }


def _json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "JARVIS/" + __version__
    protocol_version = "HTTP/1.1"
    app: App = None  # type: ignore[assignment]
    token: str = ""

    # ------------------------------------------------------------- output

    def log_message(self, fmt: str, *args) -> None:  # quieter, safer logs
        text = fmt % args
        # never write a dashboard token (?token=...) into the log file
        text = _redact_query(text)
        try:
            (self.app.settings.log_dir).mkdir(parents=True, exist_ok=True)
            with (self.app.settings.log_dir / "server.log").open("a", encoding="utf-8") as handle:
                handle.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {self.address_string()} {text}\n")
        except Exception:
            pass

    def send_json(self, payload: Any, status: int = 200) -> None:
        body = _json_bytes(payload)
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message: str, status: int = 400, **extra) -> None:
        self.send_json({"ok": False, "error": message, **extra}, status)

    def send_file(self, path: Path) -> None:
        if not path.is_file():
            self.send_error_json("not found", 404)
            return
        body = path.read_bytes()
        mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("content-type", mime + ("; charset=utf-8" if mime.startswith("text/") or
                                                 mime in ("application/javascript", "application/json",
                                                          "image/svg+xml") else ""))
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    # --------------------------------------------------------------- auth

    # -- brute force guard (public tunnels make this worth having)

    def auth_blocked(self) -> bool:
        ip = self.client_address[0]
        now = time.time()
        with _AUTH_LOCK:
            rows = [ts for ts in _AUTH_FAILS.get(ip, []) if now - ts < AUTH_WINDOW]
            _AUTH_FAILS[ip] = rows
            return len(rows) >= AUTH_MAX_FAILS

    def auth_failed(self) -> None:
        ip = self.client_address[0]
        with _AUTH_LOCK:
            _AUTH_FAILS.setdefault(ip, []).append(time.time())

    def auth_ok(self) -> None:
        with _AUTH_LOCK:
            _AUTH_FAILS.pop(self.client_address[0], None)

    def reject_auth(self) -> None:
        if self.auth_blocked():
            body = _json_bytes({"ok": False, "error": "too many failed attempts, wait 5 minutes"})
            self.send_response(429)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.send_header("retry-after", "300")
            self.end_headers()
            self.wfile.write(body)
            return
        self.auth_failed()
        self.send_error_json("unauthorised", 401)

    def authorised(self, query: dict) -> bool:
        header = self.headers.get("x-jarvis-token", "")
        if header and _same(header, self.token):
            return True
        cookie = self.headers.get("cookie", "")
        for part in cookie.split(";"):
            name, _, value = part.strip().partition("=")
            if name == "jarvis_token" and _same(value, self.token):
                return True
        supplied = (query.get("token") or [""])[0]
        return bool(supplied) and _same(supplied, self.token)

    # ------------------------------------------------------------ routing

    def do_GET(self) -> None:  # noqa: N802
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path
            query = urllib.parse.parse_qs(parsed.query)

            if path in PUBLIC_PATHS or path.startswith("/static/"):
                name = "index.html" if path in ("/", "/index.html") else path.lstrip("/")
                if path.startswith("/static/"):
                    name = path[len("/static/"):]
                target = (STATIC / name).resolve()
                if STATIC.resolve() not in target.parents and target != STATIC.resolve():
                    self.send_error_json("bad path", 400)
                    return
                self.send_file(target)
                return

            if not self.authorised(query):
                self.reject_auth()
                return
            self.auth_ok()

            if path == "/api/health":
                self.send_json({"ok": True, "version": __version__})
                return
            if path == "/api/status":
                self.send_json({"ok": True, **self.app.status()})
                return
            if path == "/api/settings":
                self.send_json({"ok": True, "settings": self.app.settings.public()})
                return
            if path == "/api/tools":
                self.send_json({"ok": True, "tools": self.app.tools.list()})
                return
            if path == "/api/chats":
                self.send_json({"ok": True, "chats": self.app.chat_list()})
                return
            if path.startswith("/api/chats/"):
                chat_id = path.rsplit("/", 1)[-1]
                self.send_json({"ok": True, "messages": self.app.chat_messages(chat_id)})
                return
            if path == "/api/memory":
                kind = (query.get("kind") or [""])[0] or None
                search = (query.get("q") or [""])[0]
                rows = (self.app.memory.search(search) if search else
                        self.app.memory.list(kind=kind))
                self.send_json({"ok": True, "memories": [row.to_dict() for row in rows],
                                "stats": self.app.memory.stats()})
                return
            if path == "/api/tasks":
                status = (query.get("status") or [""])[0] or None
                self.send_json({"ok": True,
                                "tasks": [task.to_dict() for task in self.app.tasks.list(status)]})
                return
            if path.startswith("/api/tasks/"):
                task_id = path.rsplit("/", 1)[-1]
                task = self.app.tasks.get(task_id)
                if not task:
                    self.send_error_json("task not found", 404)
                    return
                self.send_json({"ok": True, "task": task.to_dict()})
                return
            if path == "/api/skills":
                query_args = {
                    "query": (query.get("q") or [""])[0],
                    "pack": (query.get("pack") or [""])[0],
                    "kind": (query.get("type") or [""])[0],
                    "limit": int((query.get("limit") or ["30"])[0] or 30),
                    "builtin_only": (query.get("builtin") or [""])[0] in ("1", "true", "yes"),
                }
                rows = self.app.skills.search(**query_args)
                self.send_json({"ok": True, "skills": rows, "packs": self.app.skills.packs(),
                                "stats": {**self.app.skills.stats(),
                                          "ready": self.app.skills_ready.is_set()}})
                return
            if path == "/api/skills/packs":
                self.send_json({"ok": True, "packs": self.app.skills.packs(),
                                "stats": self.app.skills.stats()})
                return
            if path.startswith("/api/skills/"):
                skill_id = urllib.parse.unquote(path.rsplit("/", 1)[-1])
                skill = self.app.skills.get(skill_id)
                if not skill:
                    self.send_error_json("skill not found", 404)
                    return
                self.send_json({"ok": True, "skill": skill})
                return
            if path == "/api/approvals":
                self.send_json({"ok": True,
                                "approvals": [row.to_dict() for row in self.app.approvals.pending()]})
                return
            if path == "/api/logs":
                rows = self.app.db.query(
                    "SELECT ts, event, detail FROM audit ORDER BY id DESC LIMIT 80")
                self.send_json({"ok": True, "events": [
                    {"ts": row["ts"], "event": row["event"], "detail": row["detail"]} for row in rows]})
                return

            self.send_error_json("not found", 404)
        except Exception as exc:
            traceback.print_exc()
            self.send_error_json(f"internal error: {type(exc).__name__}", 500)

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        path = parsed.path
        if not self.authorised(query):
            self.reject_auth()
            return
        self.auth_ok()
        try:
            if path.startswith("/api/chats/"):
                self.app.chat_delete(path.rsplit("/", 1)[-1])
                self.send_json({"ok": True})
                return
            if path.startswith("/api/memory/"):
                memory_id = int(path.rsplit("/", 1)[-1])
                self.send_json({"ok": self.app.memory.delete(memory_id)})
                return
            self.send_error_json("not found", 404)
        except (ValueError, MemoryStoreError) as exc:
            self.send_error_json(str(exc), 400)
        except Exception as exc:
            self.send_error_json(f"internal error: {type(exc).__name__}", 500)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        path = parsed.path
        if not self.authorised(query):
            self.reject_auth()
            return
        self.auth_ok()
        length = int(self.headers.get("content-length") or 0)
        if length > 2_000_000:
            self.send_error_json("payload too large", 413)
            return
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_error_json("invalid json", 400)
            return
        if not isinstance(body, dict):
            self.send_error_json("body must be an object", 400)
            return
        try:
            self.route_post(path, body)
        except (ToolErrorLike, TaskError, MemoryStoreError, ValueError) as exc:
            self.send_error_json(str(exc), 400)
        except Exception:
            traceback.print_exc()
            self.send_error_json("internal error", 500)

    # --------------------------------------------------------- post routes

    def route_post(self, path: str, body: dict) -> None:
        app = self.app
        if path == "/api/chat":
            self.handle_chat(body)
            return
        if path == "/api/memory":
            entry = app.memory.add(
                str(body.get("text") or ""),
                kind=str(body.get("kind") or "fact"),
                subject=str(body.get("subject") or ""),
                source="user",
            )
            self.send_json({"ok": True, "memory": entry.to_dict()})
            return
        if path.startswith("/api/memory/") and path.endswith("/update"):
            memory_id = int(path.split("/")[3])
            entry = app.memory.update(
                memory_id,
                text=body.get("text"),
                kind=body.get("kind"),
                subject=body.get("subject"),
            )
            if not entry:
                self.send_error_json("memory not found", 404)
                return
            self.send_json({"ok": True, "memory": entry.to_dict()})
            return
        if path == "/api/skills/sync":
            result = app.skills.sync(force=bool(body.get("force")), include_packs=True)
            self.send_json({"ok": True, **result})
            return
        if path.startswith("/api/skills/") and path.endswith("/run"):
            skill_id = urllib.parse.unquote(path[len("/api/skills/"):-len("/run")])
            result = app.skill_runner.start(
                skill_id,
                inputs=body.get("inputs") or {},
                auto_run=bool(body.get("auto_run", True)),
                planner=app.plan_step,
            )
            self.send_json({"ok": True, **result}, 200)
            return
        if path == "/api/tasks":
            task = app.tasks.create(
                str(body.get("title") or ""),
                goal=str(body.get("goal") or ""),
                steps=body.get("steps") or [],
                depends_on=str(body.get("depends_on") or ""),
                max_retries=int(body.get("max_retries") or 2),
            )
            self.send_json({"ok": True, "task": task.to_dict()})
            return
        if path.startswith("/api/tasks/"):
            parts = path.strip("/").split("/")
            if len(parts) == 4:
                task_id, action = parts[2], parts[3]
                mapping = {
                    "pause": app.tasks.pause,
                    "resume": app.tasks.resume,
                    "cancel": app.tasks.cancel,
                    "requeue": app.tasks.requeue,
                }
                if action in mapping:
                    task = mapping[action](task_id)
                    self.send_json({"ok": True, "task": task.to_dict()})
                    return
                if action == "run":
                    if app.skill_runner.bound_skill(task_id):
                        result = app.skill_runner.resume(task_id, planner=app.plan_step)
                        self.send_json({"ok": True, **result})
                        return
                    task = app.tasks.run(task_id, lambda task, step: self._task_step(task, step))
                    self.send_json({"ok": True, "task": task.to_dict()})
                    return
            self.send_error_json("unknown task action", 404)
            return
        if path.startswith("/api/approvals/"):
            parts = path.strip("/").split("/")
            if len(parts) == 4:
                approval_id, action = parts[2], parts[3]
                if action in ("approve", "deny"):
                    ok, message = app.approvals.decide(approval_id, action == "approve")
                    self.send_json({"ok": ok, "status": message}, 200 if ok else 400)
                    return
            self.send_error_json("unknown approval action", 404)
            return
        if path.startswith("/api/tools/"):
            name = path.rsplit("/", 1)[-1]
            result = app.tools.call(name, body.get("arguments") or {},
                                    approval_id=body.get("approval_id"))
            self.send_json(result, 200 if result.get("ok") or result.get("approval_required") else 400)
            return
        if path == "/api/settings":
            patch = body.get("patch") or {}
            if not isinstance(patch, dict):
                self.send_error_json("patch must be an object", 400)
                return
            app.settings = config_module.save_settings(app.settings, patch)
            self.send_json({"ok": True, "settings": app.settings.public()})
            return
        if path == "/api/secrets":
            name = str(body.get("name") or "")
            value = str(body.get("value") or "")
            config_module.save_secret(app.settings, name, value)
            app.router = Router(app.settings)
            app.brain.router = app.router
            self.send_json({"ok": True, "present": bool(value)})
            return
        self.send_error_json("not found", 404)

    def _task_step(self, task, step) -> dict:
        """A task step is planned by the model, then reported honestly."""
        prompt = (f"Task: {task.title}\nGoal: {task.goal}\n"
                  f"Step {task.cursor + 1}/{len(task.steps)}: {step.title}\n"
                  "Do just this step. Reply with the concrete result, or call one tool if needed.")
        turn = self.app.brain.reply(prompt, history=[])
        if turn.error and (not turn.text or turn.provider == "offline"):
            return {"ok": False, "detail": turn.error}
        return {"ok": True, "detail": (turn.text or "")[:600], "result": turn.text}

    # --------------------------------------------------------- streaming

    def handle_chat(self, body: dict) -> None:
        app = self.app
        text = str(body.get("message") or "").strip()
        if not text:
            self.send_error_json("message is required", 400)
            return
        chat_id = str(body.get("chat_id") or "").strip() or app.chat_create(text[:60])
        approval_id = body.get("approval_id") or None
        history = app.chat_messages(chat_id)[-14:]
        messages = [{"role": row["role"], "content": row["content"]} for row in history
                    if row["role"] in ("user", "assistant")]
        app.chat_append(chat_id, "user", text)

        self.send_response(200)
        self.send_header("content-type", "text/event-stream; charset=utf-8")
        self.send_header("cache-control", "no-cache")
        self.send_header("connection", "close")
        self.send_header("x-accel-buffering", "no")
        self.end_headers()
        self.close_connection = True

        def emit(event: dict) -> None:
            try:
                self.wfile.write(f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

        emit({"type": "start", "chat_id": chat_id})
        started = time.time()
        try:
            turn = app.brain.reply(text, history=messages,
                                   on_delta=lambda chunk: emit({"type": "delta", "text": chunk}),
                                   approval_id=approval_id)
        except Exception as exc:
            app.db.audit("chat_error", {"error": f"{type(exc).__name__}: {exc}"})
            emit({"type": "error", "error": f"{type(exc).__name__}: {exc}"})
            emit({"type": "done", "chat_id": chat_id, "latency_ms": int((time.time() - started) * 1000)})
            return

        meta = {"provider": turn.provider, "model": turn.model,
                "tools": turn.tool_events, "approvals": turn.approvals,
                "error": turn.error, "latency_ms": turn.latency_ms}
        if turn.text:
            app.chat_append(chat_id, "assistant", turn.text, meta)
        emit({
            "type": "done",
            "chat_id": chat_id,
            "text": turn.text,
            "provider": turn.provider,
            "model": turn.model,
            "tool_events": turn.tool_events,
            "approvals": turn.approvals,
            "error": turn.error,
            "latency_ms": turn.latency_ms,
        })


class ToolErrorLike(RuntimeError):
    """Alias so route_post can catch tool errors without importing the class twice."""


def _redact_query(text: str) -> str:
    import re
    return re.sub(r"(token=)[^&\s\"]+", r"\1<redacted>", str(text))


def _same(left: str, right: str) -> bool:
    import hmac
    return hmac.compare_digest(str(left or ""), str(right or ""))


def serve(settings, token_value: str | None = None, port: int | None = None,
          host: str | None = None) -> None:
    app = App(settings)
    Handler.app = app
    Handler.token = token_value or config_module.token(settings)
    bind_host = host or (settings.host if not settings.allow_lan else "0.0.0.0")
    bind_port = int(port or settings.port)
    httpd = ThreadingHTTPServer((bind_host, bind_port), Handler)
    httpd.daemon_threads = True
    url = f"http://{'127.0.0.1' if bind_host in ('0.0.0.0', '::') else bind_host}:{bind_port}/"
    print(f"JARVIS {__version__} listening on {bind_host}:{bind_port}")
    print(f"open: {url}?token={Handler.token}")
    print(f"db  : {settings.db_path}")
    if app.recovered:
        print(f"recovered {len(app.recovered)} interrupted task(s)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
    finally:
        httpd.server_close()
        app.db.close()
