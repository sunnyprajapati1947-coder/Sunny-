"""Test helpers: isolated config, scripted LLM, and a real local OpenAI-compatible mock server."""

from __future__ import annotations

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from nova.config import Config  # noqa: E402
from nova.context import Context  # noqa: E402
from nova.llm import ChatReply  # noqa: E402
from nova.memory import Memory  # noqa: E402
from nova.tools import build_registry  # noqa: E402


def make_config(tmp: Path, **llm_overrides) -> Config:
    home = tmp / "home"
    cfg = Config(home=home, workspace=home / "workspace", project_root=ROOT)
    cfg.web.allow_private_hosts = True  # tests talk to 127.0.0.1 mock servers
    cfg.web.timeout = 5
    cfg.llm.timeout = 10
    cfg.llm.base_url = "http://127.0.0.1:9/v1"  # unreachable by default
    for key, value in llm_overrides.items():
        setattr(cfg.llm, key, value)
    return cfg


class ScriptedRouter:
    """Stands in for Router: returns queued replies (strings) and records every request."""

    def __init__(self, replies: list[str], error_after: bool = False):
        self.replies = list(replies)
        self.calls: list[list[dict]] = []
        self.error_after = error_after
        self.local = _FakeHealth()

    def chat(self, messages):
        from nova.llm import LLMError
        self.calls.append([dict(m) for m in messages])
        if not self.replies:
            raise LLMError("connect", "scripted router exhausted")
        return ChatReply(text=self.replies.pop(0), lane="local", model="scripted")

    def status(self):
        return {"local": {"ok": False, "detail": "scripted"}}


class _FakeHealth:
    base_url = "scripted"

    def health(self, timeout: float = 1.0):
        return False, "scripted"


def make_ctx(tmp: Path, approve: bool = False, **llm) -> tuple[Config, Memory, Context]:
    cfg = make_config(tmp, **llm)
    cfg.workspace.mkdir(parents=True, exist_ok=True)
    cfg.home.mkdir(parents=True, exist_ok=True)
    mem = Memory(cfg.db_path)
    ctx = Context(config=cfg, memory=mem, approver=(lambda t, r, why: True) if approve else (lambda t, r, why: False))
    return cfg, mem, ctx


class MockOpenAIServer:
    """Real HTTP server speaking the OpenAI chat-completions shape.

    handler(path, payload) -> (status_code, body_dict_or_str). Records payloads in .requests."""

    def __init__(self, handler=None):
        self.requests: list[dict] = []
        self.headers: list[dict] = []
        self.handler = handler or (lambda path, payload: (200, reply_body("{\"final\": \"ok\"}")))
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):  # keep test output quiet
                pass

            def _send(self, code, body, ctype="application/json"):
                data = body if isinstance(body, bytes) else (body if isinstance(body, str) else json.dumps(body)).encode()
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                outer.headers.append(dict(self.headers))
                if self.path.endswith("/models"):
                    return self._send(200, {"object": "list", "data": [{"id": "mock"}]})
                code, body = outer.handler(self.path, None)
                return self._send(code, body, "text/html" if isinstance(body, str) and "<" in body else "application/json")

            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(length)
                payload = json.loads(raw or b"{}")
                outer.requests.append(payload)
                outer.headers.append(dict(self.headers))
                code, body = outer.handler(self.path, payload)
                return self._send(code, body)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()


def reply_body(content: str) -> dict:
    return {"id": "x", "object": "chat.completion", "choices": [{"index": 0, "finish_reason": "stop",
                                                                 "message": {"role": "assistant", "content": content}}]}


def build_agent(ctx: Context, replies: list[str]):
    from nova.agent import Agent
    router = ScriptedRouter(replies)
    registry = build_registry()
    return Agent(ctx, registry, router), router, registry
