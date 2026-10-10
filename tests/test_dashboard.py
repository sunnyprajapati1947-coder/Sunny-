from __future__ import annotations

import json
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import dashboard


def _get(url: str) -> tuple[int, bytes]:
    try:
        with urlopen(url, timeout=5) as r:
            return r.status, r.read()
    except Exception as exc:
        code = getattr(exc, "code", 0)
        return code, b""


def _post(url: str, payload: dict) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8")
    req = Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except Exception as exc:
        return getattr(exc, "code", 0), {}


class DashboardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="nova_hud_")
        cls.env = patch.dict("os.environ", {
            "NOVA_CHAT_HISTORY": str(Path(cls.tmp) / "chat.json"),
            "NOVA_PROFILE_PATH": str(Path(cls.tmp) / "profile.json"),
        })
        cls.env.start()
        cls.server = dashboard.create_server(0)
        cls.port = cls.server.server_address[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.env.stop()

    def test_home_serves_hud(self):
        code, body = _get(self.base + "/")
        self.assertEqual(code, 200)
        html = body.decode("utf-8")
        self.assertIn("J.A.R.V.I.S", html)
        self.assertIn("/api/chat", html)
        self.assertIn("reactor", html)

    def test_status_endpoint(self):
        code, body = _get(self.base + "/api/status")
        self.assertEqual(code, 200)
        status = json.loads(body.decode("utf-8"))
        self.assertTrue(status["success"])
        self.assertIn("fast_lane", status)
        self.assertIn("tools", status)
        self.assertIn("memory", status)

    def test_chat_endpoint(self):
        with patch("core.fast_router.ask") as ask_mock:
            ask_mock.return_value = {"success": True, "lane": "fast",
                                     "answer": "Ekdam mast Boss! Bolo kya kaam hai."}
            code, payload = _post(self.base + "/api/chat", {"text": "thoda motivation do"})
        self.assertEqual(code, 200)
        self.assertTrue(payload["success"])
        self.assertIn("mast Boss", payload["reply"])
        self.assertEqual(payload["via"], "fast")
        # Chat through the dashboard is persisted to memory.
        from core.conversation import load
        turns = load()
        self.assertTrue(any("motivation" in t["content"] for t in turns))

    def test_chat_intent_tool(self):
        # Deterministic intents work through the dashboard too.
        code, payload = _post(self.base + "/api/chat", {"text": "kitne baje hain"})
        self.assertEqual(code, 200)
        self.assertTrue(payload["success"])
        self.assertIn("baje", payload["reply"])

    def test_chat_empty_rejected(self):
        code, payload = _post(self.base + "/api/chat", {"text": "   "})
        self.assertEqual(code, 400)

    def test_tool_allowlist(self):
        code, payload = _post(self.base + "/api/tool", {"name": "phone_torch", "args": {"on": True}})
        # Either it ran (phone) or failed gracefully (no termux in CI) - but
        # it must NOT be rejected by the allowlist.
        self.assertNotEqual(code, 400)
        self.assertNotIn("allowed nahi", json.dumps(payload))

    def test_tool_blocked_outside_allowlist(self):
        code, payload = _post(self.base + "/api/tool", {"name": "phone_whatsapp", "args": {"number": "919876543210"}})
        self.assertEqual(code, 200)  # JSON response, but operation refused
        self.assertFalse(payload["success"])
        self.assertIn("allowed nahi", payload["error"])

        code, payload = _post(self.base + "/api/tool", {"name": "market_analyze", "args": {}})
        self.assertFalse(payload["success"])

    def test_update_starts_background(self):
        with patch("subprocess.run") as run_mock:
            code, payload = _post(self.base + "/api/update", {})
        self.assertEqual(code, 200)
        self.assertTrue(payload["success"])
        self.assertTrue(payload["started"])
        run_mock.assert_called_once()

    def test_unknown_route_404(self):
        code, _ = _get(self.base + "/nope")
        self.assertEqual(code, 404)

    def test_server_binds_localhost_only(self):
        self.assertEqual(dashboard.HOST, "127.0.0.1")


if __name__ == "__main__":
    unittest.main()
