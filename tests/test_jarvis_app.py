"""Tests for the JARVIS app (`jarvis/`).

Run with zero dependencies:

    python3 -m unittest tests.test_jarvis_app -v

Also collectable by pytest. Every test uses a throwaway home directory, so the
real `~/.openjarvis` is never touched and no API key is required — the network
provider path is exercised against a local fake Gemini server.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis import config as config_module  # noqa: E402
from jarvis.approvals import ApprovalStore  # noqa: E402
from jarvis.brain import Brain  # noqa: E402
from jarvis.db import open_database  # noqa: E402
from jarvis.memory import MemoryStore, MemoryStoreError  # noqa: E402
from jarvis.providers import Breaker, ProviderError, Reply, Router  # noqa: E402
from jarvis.tasks import TaskStore  # noqa: E402
from jarvis.tools import ToolBox  # noqa: E402


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class Base(unittest.TestCase):
    """Temp home + wired components, torn down after every test."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="jarvis-test-")
        self.home = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY",
                     "GROQ_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "TAVILY_API_KEY",
                     "JARVIS_GEMINI_BASE"):
            os.environ.pop(name, None)
        self.settings = config_module.load(self.home)
        self.settings.provider_mode = "offline"
        self.settings.retries = 0
        self.settings.timeout = 5
        self.settings.python_timeout = 3
        self.db = open_database(self.home / "test.db")
        self.addCleanup(self.db.close)
        self.memory = MemoryStore(self.db)
        self.approvals = ApprovalStore(self.db, ttl=600)
        self.tools = ToolBox(self.settings, self.db, self.approvals, self.memory)
        self.tasks = TaskStore(self.db)


# --------------------------------------------------------------------- config

class ConfigTests(Base):
    def test_home_created_with_safe_modes(self):
        self.assertTrue(self.settings.config_path.exists())
        self.assertTrue(self.settings.secrets_path.exists())
        self.assertEqual(self.settings.secrets_path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.settings.config_path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.home.stat().st_mode & 0o777, 0o700)

    def test_save_secret_alias_stores_env_name(self):
        config_module.save_secret(self.settings, "gemini", "test-key-123")
        self.addCleanup(lambda: os.environ.pop("GEMINI_API_KEY", None))
        text = self.settings.secrets_path.read_text()
        self.assertIn("GEMINI_API_KEY=test-key-123", text)
        self.assertEqual(self.settings.secrets_path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.settings.key_for("gemini"), "test-key-123")
        reloaded = config_module.load(self.home)
        self.assertTrue(reloaded.has_secret("GEMINI_API_KEY"))

    def test_save_secret_removes_and_rejects_junk(self):
        config_module.save_secret(self.settings, "gemini", "abc")
        config_module.save_secret(self.settings, "gemini", "")
        self.assertNotIn("GEMINI_API_KEY=abc", self.settings.secrets_path.read_text())
        with self.assertRaises(ValueError):
            config_module.save_secret(self.settings, "not a key", "x")

    def test_public_view_never_contains_secret_values(self):
        config_module.save_secret(self.settings, "gemini", "super-secret-value")
        self.addCleanup(lambda: os.environ.pop("GEMINI_API_KEY", None))
        self.settings = config_module.load(self.home)
        dump = json.dumps(self.settings.public())
        self.assertNotIn("super-secret-value", dump)
        self.assertTrue(self.settings.public()["keys_present"]["GEMINI_API_KEY"])

    def test_token_is_stable_and_private(self):
        first = config_module.token(self.settings)
        second = config_module.token(self.settings)
        self.assertEqual(first, second)
        self.assertGreaterEqual(len(first), 20)
        self.assertEqual(self.settings.token_path.stat().st_mode & 0o777, 0o600)

    def test_env_override(self):
        os.environ["JARVIS_OWNER"] = "Tester"
        self.addCleanup(lambda: os.environ.pop("JARVIS_OWNER", None))
        self.assertEqual(config_module.load(self.home).owner, "Tester")


# ------------------------------------------------------------------------- db

class DatabaseTests(Base):
    def test_schema_and_fts(self):
        self.assertEqual(self.db.one("SELECT value FROM meta WHERE key='schema'")["value"], "2")
        self.assertTrue(self.db.has_fts)
        tables = {row["name"] for row in self.db.query(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        for name in ("memories", "chats", "messages", "tasks", "approvals", "audit"):
            self.assertIn(name, tables)

    def test_corrupt_database_is_quarantined_not_lost(self):
        path = self.home / "broken.db"
        path.write_bytes(b"this is not sqlite" * 40)
        db = open_database(path)
        try:
            self.assertTrue(db.one("SELECT value FROM meta WHERE key='schema'"))
        finally:
            db.close()
        self.assertTrue(list(self.home.glob("broken.db.corrupt-*")), "old file kept aside")


# --------------------------------------------------------------------- memory

class MemoryTests(Base):
    def test_add_search_delete(self):
        entry = self.memory.add("Project ka database Postgres hai", kind="project", subject="nova")
        self.assertEqual(entry.kind, "project")
        self.assertEqual(len(self.memory.search("Postgres")), 1)
        self.assertTrue(self.memory.search("database"))
        self.assertIn("Postgres", self.memory.context_block("database ka kya scene hai"))
        self.assertTrue(self.memory.delete(entry.id))
        self.assertEqual(self.memory.search("Postgres"), [])

    def test_secret_is_refused(self):
        with self.assertRaises(MemoryStoreError):
            self.memory.add("key AIzaSyD1234567890abcdefghijklmnopqrstu", kind="fact")
        with self.assertRaises(MemoryStoreError):
            self.memory.add("GEMINI_API_KEY=abcdef1234567890abcdef")
        self.assertEqual(self.memory.stats()["total"], 0)

    def test_untrusted_source_gets_low_confidence(self):
        entry = self.memory.add("web page boli ki price 10 hai", kind="note", source="web_fetch")
        self.assertLessEqual(entry.confidence, 0.5)

    def test_stats_and_kinds(self):
        self.memory.add("user ka favourite colour neela hai", kind="fact")
        self.memory.add("jawab Hindi mein do", kind="preference")
        stats = self.memory.stats()
        self.assertEqual(stats["total"], 2)
        self.assertEqual(stats["by_kind"]["fact"], 1)


# ----------------------------------------------------------------- approvals

class ApprovalTests(Base):
    def test_pending_cannot_run(self):
        request = self.approvals.request("fs_write", {"path": "a.txt", "content": "hi"}, risk="medium")
        allowed, reason = self.approvals.consume(request.id, "fs_write", {"path": "a.txt", "content": "hi"})
        self.assertFalse(allowed)
        self.assertIn("pending", reason.lower())

    def test_single_use_and_argument_binding(self):
        request = self.approvals.request("fs_write", {"path": "a.txt", "content": "hi"}, risk="medium")
        ok, _ = self.approvals.decide(request.id, True)
        self.assertTrue(ok)
        allowed, reason = self.approvals.consume(request.id, "fs_write", {"path": "B.txt", "content": "hi"})
        self.assertFalse(allowed)
        self.assertIn("argument", reason.lower())
        allowed, _ = self.approvals.consume(request.id, "fs_write", {"path": "a.txt", "content": "hi"})
        self.assertTrue(allowed)
        again, reason = self.approvals.consume(request.id, "fs_write", {"path": "a.txt", "content": "hi"})
        self.assertFalse(again)
        self.assertIn("used", reason.lower())

    def test_expiry(self):
        store = ApprovalStore(self.db, ttl=30)
        store.ttl = 0.2
        request = store.request("notify", {"title": "x"}, risk="medium")
        store.decide(request.id, True)
        time.sleep(0.35)
        allowed, reason = store.consume(request.id, "notify", {"title": "x"})
        self.assertFalse(allowed)
        self.assertIn("expired", reason.lower())


# ---------------------------------------------------------------------- tools

class ToolTests(Base):
    def setUp(self):
        super().setUp()
        self.assertEqual(self.tools.root, ROOT)      # default root is the repo
        self.tools.root = self.home.resolve()        # keep test files out of git
        (self.home / "files").mkdir()

    def test_fs_is_pinned_to_root(self):
        outside = self.tools.call("fs_read", {"path": "../../etc/passwd"})
        self.assertFalse(outside["ok"])
        self.assertTrue(outside.get("blocked"))
        (self.home / "files" / "demo.txt").write_text("hello")
        listing = self.tools.call("fs_list", {"path": "files"})
        self.assertTrue(listing["ok"])
        names = {row["name"] for row in listing["result"]["entries"]}
        self.assertIn("demo.txt", names)
        read = self.tools.call("fs_read", {"path": "files/demo.txt"})
        self.assertTrue(read["ok"])
        self.assertIn("hello", json.dumps(read["result"]))

    def test_fs_write_needs_approval_then_backs_up(self):
        first = self.tools.call("fs_write", {"path": "files/out.txt", "content": "one"})
        self.assertTrue(first.get("approval_required"))
        self.assertFalse((self.home / "files" / "out.txt").exists())
        self.approvals.decide(first["approval"]["id"], True)
        written = self.tools.call("fs_write", {"path": "files/out.txt", "content": "one"},
                                  approval_id=first["approval"]["id"])
        self.assertTrue(written["ok"], written)
        target = self.home / "files" / "out.txt"
        self.assertEqual(target.read_text(), "one")

        second = self.tools.call("fs_write", {"path": "files/out.txt", "content": "two"})
        self.approvals.decide(second["approval"]["id"], True)
        self.tools.call("fs_write", {"path": "files/out.txt", "content": "two"},
                        approval_id=second["approval"]["id"])
        backup = self.home / "files" / "out.txt.bak"
        self.assertTrue(backup.exists())
        self.assertEqual(backup.read_text(), "one")
        self.assertEqual(target.read_text(), "two")

    def test_fs_write_extension_policy(self):
        for name in ("files/binary.exe", "files/.bashrc", "files/noext"):
            request = self.tools.call("fs_write", {"path": name, "content": "x"})
            self.approvals.decide(request["approval"]["id"], True)
            result = self.tools.call("fs_write", {"path": name, "content": "x"},
                                     approval_id=request["approval"]["id"])
            self.assertFalse(result["ok"], name)
            self.assertTrue(result.get("blocked"), name)
        # scripts stay possible, but every write is approval-gated
        request = self.tools.call("fs_write", {"path": "files/tool.sh", "content": "echo hi"})
        self.assertTrue(request.get("approval_required"))

    def test_python_exec_runs_and_is_sandboxed(self):
        request = self.approvals.request("python_exec", {"code": "print(6*7)"})
        self.approvals.decide(request.id, True)
        result = self.tools.call("python_exec", {"code": "print(6*7)"}, approval_id=request.id)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["result"]["stdout"].strip(), "42")
        self.assertNotIn(str(self.home), result["result"]["stdout"])

        for bad in ("import socket\nsocket.socket()", "import subprocess\nsubprocess.run(['ls'])",
                    "import urllib.request\nurllib.request.urlopen('http://x')"):
            req = self.approvals.request("python_exec", {"code": bad})
            self.approvals.decide(req.id, True)
            blocked = self.tools.call("python_exec", {"code": bad}, approval_id=req.id)
            self.assertFalse(blocked["ok"], bad)

    def test_python_exec_timeout(self):
        self.settings.python_timeout = 2
        code = "while True:\n    pass"
        req = self.approvals.request("python_exec", {"code": code})
        self.approvals.decide(req.id, True)
        result = self.tools.call("python_exec", {"code": code}, approval_id=req.id)
        self.assertFalse(result["ok"])
        self.assertIn("time", str(result).lower())

    def test_unknown_and_risk_levels(self):
        self.assertFalse(self.tools.call("nope", {})["ok"])
        schemas = {tool["name"]: tool for tool in self.tools.list()}
        self.assertIn("fs_write", schemas)
        self.assertEqual(schemas["fs_write"]["risk"], "medium")
        self.assertEqual(schemas["remember"]["risk"], "low")
        self.assertEqual(schemas["notify"]["risk"], "medium")

    def test_memory_tools_round_trip(self):
        saved = self.tools.call("remember", {"text": "meeting kal 5 baje", "kind": "note"})
        self.assertTrue(saved["ok"], saved)
        found = self.tools.call("recall", {"query": "meeting"})
        self.assertTrue(found["ok"])
        self.assertTrue(found["result"]["memories"])


# ---------------------------------------------------------------------- tasks

class TaskTests(Base):
    def test_lifecycle_pause_resume_cancel(self):
        task = self.tasks.create("Long job", goal="test", steps=["a", "b", "c"])
        self.assertEqual(task.status, "PENDING")
        self.assertEqual(self.tasks.pause(task.id).status, "PAUSED")
        self.assertEqual(self.tasks.resume(task.id).status, "PENDING")
        self.assertEqual(self.tasks.cancel(task.id).status, "CANCELLED")
        self.assertEqual(self.tasks.run(task.id, lambda task, step: {"ok": True}).status, "CANCELLED")

    def test_run_marks_steps_and_completes(self):
        task = self.tasks.create("Two steps", steps=["one", "two"])
        seen = []

        def executor(current, step):
            seen.append(step.title)
            return {"ok": True, "detail": f"did {step.title}"}

        done = self.tasks.run(task.id, executor)
        self.assertEqual(done.status, "DONE")
        self.assertEqual(seen, ["one", "two"])
        self.assertEqual(done.progress["percent"], 100)

    def test_retries_are_bounded(self):
        task = self.tasks.create("Always fails", steps=["boom"], max_retries=1)
        for _ in range(3):
            self.tasks.run(task.id, lambda current, step: {"ok": False, "detail": "nope"})
        final = self.tasks.get(task.id)
        self.assertEqual(final.status, "FAILED")
        self.assertEqual(final.attempts, 2)
        # a terminal task never restarts silently; requeue is explicit
        self.assertEqual(self.tasks.run(task.id, lambda c, s: {"ok": True}).status, "FAILED")
        self.assertEqual(self.tasks.requeue(task.id).status, "PENDING")

    def test_crash_recovery_sweeps_running_to_paused(self):
        task = self.tasks.create("Interrupted", steps=["x"])
        self.db.execute("UPDATE tasks SET status='RUNNING' WHERE id=?", (task.id,))
        recovered = self.tasks.sweep()
        self.assertIn(task.id, recovered)
        self.assertEqual(self.tasks.get(task.id).status, "PAUSED")

    def test_dependency_blocks(self):
        parent = self.tasks.create("Parent", steps=["p"])
        child = self.tasks.create("Child", steps=["c"], depends_on=parent.id)
        blocked = self.tasks.run(child.id, lambda current, step: {"ok": True})
        self.assertEqual(blocked.status, "BLOCKED")
        self.tasks.run(parent.id, lambda current, step: {"ok": True})
        unblocked = self.tasks.run(child.id, lambda current, step: {"ok": True})
        self.assertEqual(unblocked.status, "DONE")


# ------------------------------------------------------------------ providers

class FakeGemini(BaseHTTPRequestHandler):
    """Small fake of streamGenerateContent?alt=sse."""

    chunks: list[str] = []
    status = 200
    calls: list[dict] = []

    def log_message(self, *args):  # silence
        pass

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("content-length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        FakeGemini.calls.append({"path": self.path, "key": self.headers.get("x-goog-api-key"), "body": body})
        if FakeGemini.status != 200:
            payload = json.dumps({"error": {"message": "boom"}}).encode()
            self.send_response(FakeGemini.status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        for text in FakeGemini.chunks:
            chunk = {"candidates": [{"content": {"parts": [{"text": text}]}}]}
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
            self.wfile.flush()
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()


class ProviderTests(Base):
    def setUp(self):
        super().setUp()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeGemini)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.shutdown)
        self.addCleanup(self.server.server_close)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        os.environ["JARVIS_GEMINI_BASE"] = self.base
        os.environ["GEMINI_API_KEY"] = "test-key"
        self.addCleanup(lambda: os.environ.pop("JARVIS_GEMINI_BASE", None))
        self.addCleanup(lambda: os.environ.pop("GEMINI_API_KEY", None))
        FakeGemini.calls = []
        FakeGemini.status = 200
        FakeGemini.chunks = ["Namaste", ", main ", "JARVIS hoon."]
        self.settings.provider_mode = "gemini"
        self.settings.model = "gemini-2.5-flash"
        self.router = Router(self.settings)

    def test_gemini_streaming_and_shape(self):
        deltas = []
        reply = self.router.complete("system", [{"role": "user", "content": "hi"}], on_delta=deltas.append)
        self.assertEqual(reply.text, "Namaste, main JARVIS hoon.")
        self.assertEqual("".join(deltas), reply.text)
        self.assertEqual(reply.provider, "gemini")
        call = FakeGemini.calls[-1]
        self.assertIn("streamGenerateContent", call["path"])
        self.assertIn("alt=sse", call["path"])
        self.assertEqual(call["key"], "test-key")
        self.assertEqual(call["body"]["contents"][0]["parts"][0]["text"], "hi")
        self.assertIn("systemInstruction", call["body"])

    def test_failure_is_reported_and_breaker_opens(self):
        FakeGemini.status = 500
        for _ in range(3):
            with self.assertRaises(ProviderError):
                self.router.complete("s", [{"role": "user", "content": "hi"}])
        self.assertIn("gemini", self.router.breaker.state()["open"])
        self.assertNotIn("gemini", [p.name for p in self.router.chain()])

    def test_offline_chain_is_empty(self):
        self.settings.provider_mode = "offline"
        self.assertEqual(Router(self.settings).chain(), [])

    def test_breaker_recovers_after_cooldown(self):
        breaker = Breaker(threshold=2, window=10, cooldown=0.2)
        breaker.record_failure("x")
        breaker.record_failure("x")
        self.assertFalse(breaker.available("x"))
        time.sleep(0.3)
        self.assertTrue(breaker.available("x"))


# ---------------------------------------------------------------------- brain

class FakeRouter:
    """Deterministic model: queues replies, records the messages it was sent."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.seen = []

    def chain(self):
        return ["fake"]

    def complete(self, system, messages, on_delta=None):
        self.seen.append({"system": system, "messages": list(messages)})
        text = self.replies.pop(0) if self.replies else "Done."
        if on_delta:
            on_delta(text)
        return Reply(text=text, provider="fake", model="fake-1", latency_ms=1)


class BrainTests(Base):
    def make_brain(self, replies):
        router = FakeRouter(replies)
        brain = Brain(self.settings, router, self.tools, self.memory, self.tasks, self.db)
        return brain, router

    def test_tool_tag_runs_real_tool(self):
        brain, router = self.make_brain([
            '<tool>{"name": "remember", "arguments": {"text": "Mera naam Sunny hai", "kind": "fact"}}</tool>',
            "Yaad rakh liya, Sunny.",
        ])
        turn = brain.reply("mera naam Sunny hai, yaad rakho")
        self.assertEqual(turn.text, "Yaad rakh liya, Sunny.")
        self.assertEqual(len(turn.tool_events), 1)
        self.assertTrue(turn.tool_events[0]["ok"])
        self.assertEqual(self.memory.search("Sunny")[0].text, "Mera naam Sunny hai")
        untrusted = router.seen[-1]["messages"][-1]["content"]
        self.assertIn("<tool_result>", untrusted)
        self.assertIn("Mera naam Sunny hai", untrusted)

    def test_risky_tool_asks_for_approval_and_does_not_write(self):
        brain, _ = self.make_brain([
            '<tool>{"name": "fs_write", "arguments": {"path": "hack.txt", "content": "x"}}</tool>',
            "Approval chahiye.",
        ])
        turn = brain.reply("hack.txt bana do")
        self.assertTrue(turn.approvals)
        self.assertFalse(turn.tool_events[0]["ok"])
        self.assertFalse((ROOT / "hack.txt").exists())

    def test_tool_loop_is_bounded(self):
        tag = '<tool>{"name": "recall", "arguments": {"query": "loop"}}</tool>'
        brain, _ = self.make_brain([tag] * 20)
        turn = brain.reply("loop karo")
        self.assertLessEqual(len(turn.tool_events), self.settings.max_tool_steps)
        self.assertTrue(turn.text is not None)

    def test_offline_answer_is_honest(self):
        brain = Brain(self.settings, Router(self.settings), self.tools, self.memory, self.tasks, self.db)
        turn = brain.reply("namaste")
        self.assertEqual(turn.provider, "offline")
        self.assertIn("offline", turn.text.lower())
        self.assertTrue(turn.error)

    def test_language_and_memory_in_prompt(self):
        self.memory.add("User ko Hindi mein jawab pasand hai", kind="preference", subject="user")
        self.settings.language = "hinglish"
        brain, router = self.make_brain(["theek hai"])
        brain.reply("kya haal")
        system = router.seen[0]["system"]
        self.assertIn("Hinglish", system)
        self.assertIn("Hindi mein jawab", system)
        self.assertIn("fs_write (medium)", system)


# --------------------------------------------------------------------- server

class ServerTests(Base):
    """End-to-end HTTP test against a real subprocess server."""

    def setUp(self):
        super().setUp()
        self.port = free_port()
        env = dict(os.environ)
        env["JARVIS_HOME"] = str(self.home)
        env.pop("GEMINI_API_KEY", None)
        env["JARVIS_PROVIDER"] = "offline"
        self.proc = subprocess.Popen(
            [sys.executable, str(ROOT / "run_jarvis.py"), "serve", "--port", str(self.port)],
            cwd=str(ROOT), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        self.addCleanup(self.stop)
        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=0.3):
                    break
            except OSError:
                if self.proc.poll() is not None:
                    self.fail("server exited: " + self.proc.stdout.read().decode()[-500:])
                time.sleep(0.1)
        else:
            self.fail("server did not start")
        self.token = config_module.token(self.settings)

    def stop(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        if self.proc.stdout:
            self.proc.stdout.close()

    def get(self, path, token=True):
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}")
        if token:
            request.add_header("x-jarvis-token", self.token)
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read().decode() or "{}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()
            try:
                return exc.code, json.loads(body)
            except json.JSONDecodeError:
                return exc.code, {"raw": body}

    def post(self, path, payload, token=True):
        data = json.dumps(payload).encode()
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, method="POST")
        request.add_header("content-type", "application/json")
        if token:
            request.add_header("x-jarvis-token", self.token)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.status, json.loads(response.read().decode() or "{}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()
            try:
                return exc.code, json.loads(body)
            except json.JSONDecodeError:
                return exc.code, {"raw": body}

    def test_auth_is_required(self):
        status, payload = self.get("/api/status", token=False)
        self.assertEqual(status, 401)
        self.assertFalse(payload["ok"])
        self.assertEqual(self.get("/api/status")[0], 200)

    def test_static_shell_is_public(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/", timeout=5) as response:
            html = response.read().decode()
        self.assertIn("JARVIS", html)
        self.assertIn("/app.js", html)
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/app.js", timeout=5) as response:
            js = response.read().decode()
        self.assertIn("x-jarvis-token", js)

    def test_status_payload(self):
        status, payload = self.get("/api/status")
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["version"], "1.0.0")
        self.assertGreaterEqual(payload["tools"], 10)
        self.assertIn("provider", payload)
        self.assertEqual(payload["keys_present"], {})          # no key configured
        self.assertNotIn(self.token, json.dumps(payload))

    def test_memory_crud_over_http(self):
        status, created = self.post("/api/memory", {"text": "HTML test memory", "kind": "note"})
        self.assertEqual(status, 200, created)
        memory_id = created["memory"]["id"]
        status, listed = self.get("/api/memory?q=HTML")
        self.assertEqual(status, 200)
        self.assertEqual([row["id"] for row in listed["memories"]], [memory_id])
        status, updated = self.post(f"/api/memory/{memory_id}/update", {"text": "HTML changed"})
        self.assertEqual(status, 200)
        self.assertEqual(updated["memory"]["text"], "HTML changed")
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/memory/{memory_id}", method="DELETE")
        request.add_header("x-jarvis-token", self.token)
        with urllib.request.urlopen(request, timeout=10) as response:
            self.assertEqual(json.loads(response.read())["ok"], True)

    def test_approval_round_trip_over_http(self):
        status, first = self.post("/api/tools/python_exec", {"arguments": {"code": "print(2+2)"}})
        self.assertEqual(status, 200)   # 200 + approval_required, not an error
        self.assertTrue(first["approval_required"])
        approval_id = first["approval"]["id"]
        self.assertEqual(self.post(f"/api/approvals/{approval_id}/approve", {})[0], 200)
        status, result = self.post("/api/tools/python_exec",
                                   {"arguments": {"code": "print(2+2)"}, "approval_id": approval_id})
        self.assertEqual(status, 200)
        self.assertEqual(result["result"]["stdout"].strip(), "4")

    def test_chat_streams_and_persists(self):
        data = json.dumps({"message": "namaste"}).encode()
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/chat", data=data, method="POST")
        request.add_header("content-type", "application/json")
        request.add_header("x-jarvis-token", self.token)
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode()
        events = [json.loads(line[6:]) for line in raw.splitlines() if line.startswith("data: ")]
        self.assertEqual(events[0]["type"], "start")
        done = events[-1]
        self.assertEqual(done["type"], "done")
        self.assertEqual(done["provider"], "offline")
        self.assertTrue(done["text"])
        self.assertTrue(done["chat_id"])
        status, chats = self.get("/api/chats")
        self.assertEqual(status, 200)
        self.assertTrue(any(chat["id"] == done["chat_id"] for chat in chats["chats"]))
        status, messages = self.get(f"/api/chats/{done['chat_id']}")
        self.assertEqual(messages["messages"][0]["role"], "user")

    def test_task_create_and_actions_over_http(self):
        status, created = self.post("/api/tasks", {"title": "HTTP task", "steps": ["a", "b"]})
        self.assertEqual(status, 200, created)
        task_id = created["task"]["id"]
        self.assertEqual(self.post(f"/api/tasks/{task_id}/pause", {})[1]["task"]["status"], "PAUSED")
        self.assertEqual(self.post(f"/api/tasks/{task_id}/resume", {})[1]["task"]["status"], "PENDING")
        self.assertEqual(self.post(f"/api/tasks/{task_id}/cancel", {})[1]["task"]["status"], "CANCELLED")

    def test_token_never_lands_in_the_log(self):
        self.get("/api/status")
        time.sleep(0.2)
        log = self.home / "logs" / "server.log"
        self.assertTrue(log.exists())
        self.assertNotIn(self.token, log.read_text(errors="replace"))

    def test_settings_and_secrets_are_split(self):
        status, payload = self.post("/api/settings", {"patch": {"provider": {"mode": "offline"}}})
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["settings"]["provider"]["mode"], "offline")
        status, payload = self.post("/api/secrets", {"name": "gemini", "value": "test-key"})
        self.addCleanup(lambda: os.environ.pop("GEMINI_API_KEY", None))
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["present"])
        self.assertIn("GEMINI_API_KEY=test-key", self.settings.secrets_path.read_text())
        self.assertNotIn("test-key", json.dumps(self.get("/api/settings")[1]))


class LogRedactionTests(unittest.TestCase):
    def test_query_token_is_redacted(self):
        from jarvis.server import _redact_query
        self.assertNotIn("abc123", _redact_query("GET /?token=abc123 HTTP/1.1"))
        self.assertIn("redacted", _redact_query("GET /?token=abc123 HTTP/1.1"))
        self.assertEqual(_redact_query("GET /api/status HTTP/1.1"), "GET /api/status HTTP/1.1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
