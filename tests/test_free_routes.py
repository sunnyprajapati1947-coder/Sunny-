"""Free AI routes: a real local gateway stands in for FreeLLMAPI / OmniRoute.

The fake server speaks the same OpenAI surface both routers expose, so these
tests check the actual HTTP path Jarvis uses: ``GET /v1/models``,
``POST /v1/chat/completions`` and the ``X-Routed-Via`` header that tells you
which upstream provider really answered.
"""
from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

from jarvis import routes, tools
from jarvis.brain import Brain
from jarvis.config import Settings
from jarvis.intents import match
from jarvis.skills import ai_routes

REAL_PRESETS = routes.PRESETS  # captured before RouteTestCase blanks them


class FakeGateway:
    """A tiny OpenAI-compatible endpoint with switchable failure modes."""

    def __init__(self, *, model: str = "free-large", fail: bool = False, delay: float = 0.0) -> None:
        self.model = model
        self.fail = fail
        self.delay = delay
        self.requests: list[dict] = []
        gateway = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args):  # silence
                pass

            def _send(self, status: int, payload: dict, extra: dict | None = None) -> None:
                body = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                for key, value in (extra or {}).items():
                    self.send_header(key, value)
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self) -> None:  # noqa: N802
                gateway.requests.append({"method": "GET", "path": self.path, "headers": dict(self.headers)})
                if self.path.rstrip("/").endswith("/models"):
                    if gateway.fail:
                        self._send(500, {"error": {"message": "catalog unavailable"}})
                        return
                    self._send(200, {"object": "list", "data": [
                        {"id": gateway.model}, {"id": "free-fast"}, {"id": "free-smart"},
                    ]})
                    return
                self._send(404, {"error": "not found"})

            def do_POST(self) -> None:  # noqa: N802
                import time

                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length)
                gateway.requests.append({
                    "method": "POST",
                    "path": self.path,
                    "headers": dict(self.headers),
                    "body": json.loads(raw or b"{}"),
                })
                if gateway.delay:
                    time.sleep(gateway.delay)
                if gateway.fail:
                    self._send(500, {"error": {"message": "all providers rate-limited"}})
                    return
                body = json.loads(raw or b"{}")
                self._send(
                    200,
                    {
                        "id": "chatcmpl-test",
                        "model": body.get("model") or gateway.model,
                        "choices": [{"index": 0, "message": {"role": "assistant", "content": "ONLINE"}}],
                        "usage": {"prompt_tokens": 9, "completion_tokens": 2, "total_tokens": 11},
                    },
                    {"X-Routed-Via": f"test/{gateway.model}"},
                )

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        self.base_url = f"http://127.0.0.1:{self.port}/v1"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self) -> "FakeGateway":
        self.thread.start()
        return self

    def __exit__(self, *_exc) -> None:
        self.server.shutdown()
        self.server.server_close()

    def chats(self) -> list[dict]:
        return [item for item in self.requests if item["method"] == "POST"]


class RouteTestCase(unittest.TestCase):
    """Point the route store at a temp file and drop the built-in presets."""

    def setUp(self) -> None:
        import tempfile

        self.tmp = Path(tempfile.mkdtemp(prefix="jarvis-routes-"))
        self.routes_file = self.tmp / "routes.json"
        self.patches = [
            mock.patch.object(routes, "ROUTES_FILE", self.routes_file),
            mock.patch.object(routes, "PRESETS", ()),
        ]
        for item in self.patches:
            item.start()
        routes.invalidate()
        self.addCleanup(self._cleanup)

    def _cleanup(self) -> None:
        for item in reversed(self.patches):
            item.stop()
        routes.invalidate()
        import shutil

        shutil.rmtree(self.tmp, ignore_errors=True)

    def add(self, route_id: str, base_url: str, *, model: str = "auto", key: str = "", priority: int = 10) -> dict:
        result = routes.save_route(route_id, base_url=base_url, model=model, api_key=key, priority=priority)
        self.assertTrue(result["ok"], result)
        return result["route"]


class ProbeTests(RouteTestCase):
    def test_online_gateway_reports_models_and_latency(self) -> None:
        with FakeGateway() as gateway:
            route = self.add("freellmapi", gateway.base_url)
            info = routes.probe(route, fresh=True)
        self.assertTrue(info["online"])
        self.assertEqual(info["models"], 3)
        self.assertIn("free-large", info["sample"])
        self.assertIsNotNone(info["latency_ms"])
        self.assertEqual(info["error"], "")

    def test_offline_gateway_is_honest(self) -> None:
        route = self.add("deadbox", "http://127.0.0.1:9/v1")
        info = routes.probe(route, fresh=True)
        self.assertFalse(info["online"])
        self.assertTrue(info["error"])
        self.assertIsNone(info["latency_ms"])

    def test_http_error_is_reported_not_hidden(self) -> None:
        with FakeGateway(fail=True) as gateway:
            route = self.add("broken", gateway.base_url)
            info = routes.probe(route, fresh=True)
        self.assertFalse(info["online"])
        self.assertIn("catalog unavailable", info["error"])

    def test_models_lists_real_ids(self) -> None:
        with FakeGateway() as gateway:
            self.add("freellmapi", gateway.base_url)
            result = routes.models("freellmapi")
        self.assertTrue(result["ok"])
        self.assertEqual(result["routes"][0]["count"], 3)
        self.assertIn("free-fast", result["routes"][0]["models"])

    def test_api_key_is_sent_as_bearer(self) -> None:
        with FakeGateway() as gateway:
            self.add("omniroute", gateway.base_url, key="secret-omniroute")
            routes.probe(routes.get("omniroute"), fresh=True)
            headers = gateway.requests[-1]["headers"]
        self.assertEqual(headers.get("Authorization"), "Bearer secret-omniroute")


class ChatTests(RouteTestCase):
    def test_chat_returns_text_and_routed_via(self) -> None:
        with FakeGateway() as gateway:
            route = self.add("freellmapi", gateway.base_url)
            text, meta = routes.chat(route, [{"role": "user", "content": "ping"}], max_tokens=16)
        self.assertEqual(text, "ONLINE")
        self.assertEqual(meta["routed_via"], "test/free-large")
        self.assertEqual(meta["tokens"], 11)
        self.assertEqual(meta["route"], "freellmapi")

    def test_chat_uses_configured_model(self) -> None:
        with FakeGateway() as gateway:
            route = self.add("freellmapi", gateway.base_url, model="auto:smart")
            routes.chat(route, [{"role": "user", "content": "hi"}])
            body = gateway.chats()[-1]["body"]
        self.assertEqual(body["model"], "auto:smart")
        self.assertFalse(body["stream"])

    def test_failed_chat_returns_error(self) -> None:
        with FakeGateway(fail=True) as gateway:
            route = self.add("broken", gateway.base_url)
            text, meta = routes.chat(route, [{"role": "user", "content": "hi"}])
        self.assertIsNone(text)
        self.assertIn("rate-limited", meta["error"])

    def test_route_chat_falls_through_to_the_next_route(self) -> None:
        with FakeGateway(fail=True) as broken, FakeGateway(model="second-best") as good:
            self.add("aaa-broken", broken.base_url, priority=1)
            self.add("zzz-good", good.base_url, priority=2)
            text, provider, meta = routes.route_chat([{"role": "user", "content": "hi"}])
        self.assertEqual(text, "ONLINE")
        self.assertEqual(provider, "route:zzz-good")
        self.assertEqual(meta["routed_via"], "test/second-best")

    def test_no_route_answer_is_offline_not_a_guess(self) -> None:
        self.add("dead", "http://127.0.0.1:9/v1")
        text, provider, meta = routes.route_chat([{"role": "user", "content": "hi"}], timeout=2)
        self.assertIsNone(text)
        self.assertEqual(provider, "offline")
        self.assertTrue(meta["errors"])

    def test_disabled_route_is_skipped(self) -> None:
        with FakeGateway() as gateway:
            self.add("sleepy", gateway.base_url, priority=1)
            routes.set_enabled("sleepy", False)
            text, provider, _meta = routes.route_chat([{"role": "user", "content": "hi"}])
        self.assertIsNone(text)
        self.assertEqual(provider, "offline")
        self.assertEqual(gateway.chats(), [])


class StorageTests(RouteTestCase):
    def test_save_and_remove_round_trip(self) -> None:
        result = routes.save_route("mybox", base_url="http://192.168.1.20:3001/v1", model="llama3", api_key="k-123456")
        self.assertTrue(result["ok"])
        self.assertTrue(self.routes_file.exists())
        self.assertEqual(self.routes_file.stat().st_mode & 0o777, 0o600)
        saved = routes.get("mybox")
        self.assertEqual(saved["model"], "llama3")
        self.assertEqual(routes.mask(saved), "•••3456")
        removed = routes.remove_route("mybox")
        self.assertTrue(removed["ok"])
        self.assertIsNone(routes.get("mybox"))

    def test_bad_url_and_bad_id_are_rejected(self) -> None:
        self.assertFalse(routes.save_route("ok-id", base_url="ftp://nope")["ok"])
        self.assertFalse(routes.save_route("BAD ID!", base_url="http://x.test/v1")["ok"])

    def test_chat_completions_suffix_is_normalised(self) -> None:
        route = routes.save_route("lmstudio", base_url="http://127.0.0.1:1234/v1/chat/completions")["route"]
        self.assertEqual(route["base_url"], "http://127.0.0.1:1234/v1")

    def test_env_key_is_used_when_file_has_none(self) -> None:
        with mock.patch.dict("os.environ", {"JARVIS_ROUTE_ENVGW_KEY": "env-key-999"}):
            route = routes.save_route("envgw", base_url="http://127.0.0.1:9/v1")["route"]
            reloaded = routes.get("envgw")
        self.assertEqual(route["api_key"], "env-key-999")
        self.assertEqual(reloaded["api_key"], "env-key-999")


class BrainTests(RouteTestCase):
    def _brain(self, mode: str = "route") -> Brain:
        settings = Settings(brain_mode=mode, llm_enabled=True, gemini_key="")
        brain = Brain()
        brain._settings = lambda: settings  # type: ignore[method-assign]
        return brain

    def setUp(self) -> None:
        super().setUp()
        self.local_patch = mock.patch("jarvis.brain.get_local_brain", return_value=mock.Mock(
            status=lambda: {"online": False, "lanes": []},
            available=lambda: False,
            last_error="not running",
        ))
        self.local_patch.start()
        self.addCleanup(self.local_patch.stop)

    def test_route_mode_answers_from_a_free_route(self) -> None:
        with FakeGateway() as gateway:
            self.add("freellmapi", gateway.base_url, priority=1)
            brain = self._brain()
            text, provider = brain.complete("You are Jarvis.", "Say ONLINE")
        self.assertEqual(text, "ONLINE")
        self.assertEqual(provider, "route:freellmapi")
        self.assertEqual(brain.last_provider, "route:freellmapi")
        self.assertIn("routed_via", brain.last_route)

    def test_json_mode_is_asked_for_json(self) -> None:
        with FakeGateway() as gateway:
            self.add("freellmapi", gateway.base_url, priority=1)
            brain = self._brain()
            brain.complete("sys", "plan this", json_mode=True)
            prompt = gateway.chats()[-1]["body"]["messages"][-1]["content"]
        self.assertIn("JSON", prompt)

    def test_auto_mode_uses_routes_when_nothing_local_answers(self) -> None:
        with FakeGateway() as gateway:
            self.add("freellmapi", gateway.base_url, priority=1)
            brain = self._brain("auto")
            text, provider = brain.complete("sys", "hello")
        self.assertEqual(text, "ONLINE")
        self.assertEqual(provider, "route:freellmapi")

    def test_offline_mode_never_calls_a_route(self) -> None:
        with FakeGateway() as gateway:
            self.add("freellmapi", gateway.base_url, priority=1)
            brain = self._brain("offline")
            text, provider = brain.complete("sys", "hello")
        self.assertIsNone(text)
        self.assertEqual(provider, "offline")
        self.assertEqual(gateway.chats(), [])

    def test_failed_route_is_backed_off(self) -> None:
        with FakeGateway(fail=True) as gateway:
            self.add("broken", gateway.base_url, priority=1)
            brain = self._brain()
            first = brain.complete("sys", "one")
            calls_after_first = len(gateway.chats())
            second = brain.complete("sys", "two")
            calls_after_second = len(gateway.chats())
        self.assertIsNone(first[0])
        self.assertIsNone(second[0])
        self.assertEqual(calls_after_first, calls_after_second, "backoff must skip the known-bad route")

    def test_status_reports_route_lane(self) -> None:
        with FakeGateway() as gateway:
            self.add("freellmapi", gateway.base_url, priority=1)
            brain = self._brain()
            status = brain.status()
        self.assertEqual(status["routes"]["online"], 1)
        self.assertEqual(status["routes"]["count"], 1)
        self.assertEqual(status["routes"]["best"], "freellmapi")
        self.assertEqual(status["routes"]["models"], 3)


class HonestReplyTests(RouteTestCase):
    def test_status_with_nothing_online_offers_setup(self) -> None:
        result = ai_routes.route_status()
        self.assertIn("No free route is answering", result["text"])
        rows = " ".join(result["cards"][0]["rows"])
        self.assertIn("free route setup", rows)

    def test_setup_lists_both_projects(self) -> None:
        with mock.patch.object(routes, "PRESETS", REAL_PRESETS):
            result = ai_routes.route_setup()
        rows = " ".join(result["cards"][0]["rows"])
        self.assertIn("freellmapi", rows.lower())
        self.assertIn("omniroute", rows.lower())
        self.assertIn("docker", rows.lower())
        self.assertIn("npm install -g omniroute", rows)

    def test_models_connected_always_lists_sources(self) -> None:
        result = ai_routes.models_connected()
        rows = " ".join(result["cards"][0]["rows"]).lower()
        self.assertIn("gemini", rows)
        self.assertIn("local qwen", rows)

    def test_test_tool_names_the_provider(self) -> None:
        with FakeGateway() as gateway:
            self.add("freellmapi", gateway.base_url)
            result = ai_routes.route_test("freellmapi")
        self.assertTrue(result["data"]["ok"])
        self.assertIn("test/free-large", result["text"])
        rows = " ".join(result["cards"][0]["rows"])
        self.assertIn("served by: test/free-large", rows)

    def test_use_free_models_switches_mode(self) -> None:
        with mock.patch("jarvis.skills.ai_routes.update_settings", return_value=(Settings(brain_mode="route"), [])) as updater:
            result = ai_routes.route_use("route")
        self.assertTrue(result["data"]["ok"])
        updater.assert_called_once_with({"brain_mode": "route"})
        self.assertIn("free routes", result["text"])

    def test_bad_mode_is_refused(self) -> None:
        result = ai_routes.route_use("telepathy")
        self.assertFalse(result["data"]["ok"])
        self.assertIn("Pick one", result["text"])


class CoreReadyTests(unittest.TestCase):
    """The core must consider a free route a real brain, not just Gemini/Qwen."""

    def _core(self, *, llm_enabled: bool = True, **flags):
        from jarvis.core import JarvisCore

        brain = mock.Mock()
        brain.gemini_available.return_value = flags.get("gemini", False)
        brain.qwen_available.return_value = flags.get("qwen", False)
        brain.routes_available.return_value = flags.get("routes", False)
        settings = Settings(llm_enabled=llm_enabled, llm_tools=True)
        patcher = mock.patch("jarvis.config.get_settings", return_value=settings)
        patcher.start()
        self.addCleanup(patcher.stop)
        return JarvisCore(brain=brain)

    def test_route_online_makes_the_brain_ready(self) -> None:
        self.assertTrue(self._core(routes=True)._brain_ready())
        self.assertFalse(self._core()._brain_ready())
        self.assertTrue(self._core(gemini=True)._brain_ready())
        self.assertTrue(self._core(qwen=True)._brain_ready())

    def test_disabled_llm_stays_offline(self) -> None:
        self.assertFalse(self._core(llm_enabled=False, routes=True)._brain_ready())


class RegistryTests(RouteTestCase):
    def test_tools_registered_in_brain_category(self) -> None:
        for name in (
            "route_status", "route_setup", "route_models", "route_test",
            "route_use", "route_add", "route_remove", "models_connected",
        ):
            tool = tools.get(name)
            self.assertIsNotNone(tool, name)
            self.assertEqual(tool.category, "brain")
        self.assertGreaterEqual(len(tools.TOOLS), 123)

    def test_intents_route_to_the_right_tools(self) -> None:
        cases = {
            "free route": "route_status",
            "routes": "route_status",
            "omniroute status": "route_status",
            "free route setup": "route_setup",
            "connect free models": "route_setup",
            "which models are connected": "models_connected",
            "models on freellmapi": "route_models",
            "route test omniroute": "route_test",
            "use free models": "route_use",
            "use local qwen": "route_use",
            "go offline": "route_use",
            "remove route mybox": "route_remove",
        }
        for phrase, expected in cases.items():
            intent = match(phrase)
            self.assertIsNotNone(intent, phrase)
            self.assertEqual(intent.name, expected, phrase)

    def test_add_route_intent_keeps_the_endpoint(self) -> None:
        intent = match("add route mybox at http://192.168.1.20:3001/v1")
        self.assertEqual(intent.name, "route_add")
        self.assertEqual(intent.args["base_url"], "http://192.168.1.20:3001/v1")
        self.assertEqual(intent.args["route_id"], "mybox")

    def test_existing_intents_still_win_their_own_phrases(self) -> None:
        self.assertEqual(match("brain status").name, "brain_status")
        self.assertEqual(match("brain setup").name, "brain_setup")
        self.assertEqual(match("switch to chrome").name, "desktop_focus")
        self.assertEqual(match("what is 2 plus 2").name, "calculate")
        self.assertEqual(match("phone check").name, "phone_check")


if __name__ == "__main__":
    unittest.main()
