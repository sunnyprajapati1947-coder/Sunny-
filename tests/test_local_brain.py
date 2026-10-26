"""Tests for the local brain, plans, agent memory and focus mode."""
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

from jarvis import tools
from jarvis.agent import repo_map
from jarvis.intents import match
from jarvis.local_brain import CATALOG, LocalBrain, get_local_brain, recommended_models
from jarvis import memory as memory_module
from jarvis.memory import MemoryStore
from jarvis.plans import PlanManager


class LocalBrainTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_catalog_has_qwen_family(self):
        self.assertGreaterEqual(len(CATALOG), 8)
        for spec in CATALOG.values():
            self.assertIn("qwen", spec["ollama"].lower())
            self.assertIn("gguf", spec)

    def test_recommendations_scale_with_ram(self):
        small = recommended_models(3.0)
        large = recommended_models(32.0)
        self.assertEqual(small["deep"], "qwen3-1.7b")
        self.assertIn(large["deep"], {"qwen2.5-32b", "qwen2.5-14b"})
        self.assertNotEqual(small["deep"], large["deep"])

    def test_offline_status_is_honest(self):
        brain = LocalBrain()
        status = brain.status(force=True)
        self.assertFalse(status["online"])
        self.assertTrue(status["lanes"])
        self.assertIn("recommended", status)
        self.assertEqual(brain.chat([{"role": "user", "content": "hi"}], timeout=1)[0], None)

    def test_install_guide_never_downloads(self):
        guide = get_local_brain().install_guide()
        self.assertTrue(guide["ok"])
        self.assertTrue(guide["steps"])
        self.assertIn("never downloads", guide["note"])

    def test_lane_tasks_map_to_roles(self):
        brain = LocalBrain()
        specs = {spec["name"]: spec for spec in brain.lane_specs()}
        self.assertEqual(specs["coder"]["role"], "coder")
        self.assertIn("fast", specs)


class PlanTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.manager = PlanManager(Path(self.tmp.name) / "plans")

    def test_create_and_tick_steps(self):
        plan = self.manager.create("Ship local brain", steps="wire; test; document")
        self.assertEqual(len(plan["steps"]), 3)
        folder = Path(self.tmp.name) / "plans" / plan["id"]
        for name in ("task_plan.md", "findings.md", "progress.md"):
            self.assertTrue((folder / name).is_file(), name)
        self.manager.complete_step(plan["id"], 1)
        updated = self.manager.get(plan["id"])
        self.assertEqual(updated["progress_pct"], 33)
        self.assertIn("[x]", (folder / "task_plan.md").read_text())

    def test_close_plan(self):
        plan = self.manager.create("Close me")
        closed = self.manager.close(plan["id"])
        self.assertEqual(closed["status"], "complete")

    def test_duplicate_goals_get_unique_ids(self):
        first = self.manager.create("same goal")
        second = self.manager.create("same goal")
        self.assertNotEqual(first["id"], second["id"])

    def test_remove_plan(self):
        plan = self.manager.create("temporary")
        self.assertTrue(self.manager.remove(plan["id"]))
        self.assertIsNone(self.manager.get(plan["id"]))


class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = MemoryStore(Path(self.tmp.name) / "memory.jsonl")

    def test_add_and_search(self):
        self.store.add("Owner prefers local Qwen over cloud", kind="preference", tags=["qwen"])
        self.store.add("Deployed the HUD on port 7777", kind="decision")
        hits = self.store.search("qwen local")
        self.assertTrue(hits)
        self.assertIn("Qwen", hits[0]["text"])
        self.assertIn("score", hits[0])

    def test_secrets_are_refused(self):
        self.assertIsNone(self.store.add("my password is hunter2"))
        self.assertEqual(self.store.stats()["count"], 0)

    def test_dedupe_within_window(self):
        first = self.store.add("same observation")
        second = self.store.add("same observation")
        self.assertEqual(first.id, second.id)
        self.assertEqual(self.store.stats()["count"], 1)

    def test_stats_and_forget(self):
        item = self.store.add("delete me please")
        self.assertEqual(self.store.stats()["count"], 1)
        self.assertEqual(self.store.forget(item.id), 1)
        self.assertEqual(self.store.stats()["count"], 0)

    def test_compress_turns(self):
        turns = [
            {"role": "user", "text": "wire the local qwen lane"},
            {"role": "user", "text": "then test the agent loop", "tool": "agent_run"},
        ]
        item = self.store.compress_turns(turns)
        self.assertIsNotNone(item)
        self.assertEqual(item.kind, "episode")
        self.assertIn("agent_run", item.meta["tools"])


class RepoMapTests(unittest.TestCase):
    def test_repo_map_skips_noise(self):
        data = repo_map(Path(__file__).resolve().parents[1])
        self.assertTrue(data["ok"])
        self.assertGreater(data["files_scanned"], 20)
        self.assertFalse(any(".git/" in entry for entry in data["tree"]))
        self.assertTrue(data["key_files"])

    def test_missing_path(self):
        self.assertFalse(repo_map("/definitely/not/here")["ok"])


class ToolAndIntentTests(unittest.TestCase):
    def test_new_tools_registered(self):
        for name in (
            "brain_status", "brain_setup", "brain_test", "brain_chat",
            "agent_run", "agent_status", "plan_create", "plan_show", "plan_update",
            "memory_search", "memory_save", "repo_map", "focus_mode",
        ):
            self.assertIn(name, tools.TOOLS)

    def test_intent_routing(self):
        cases = {
            "brain status": "brain_status",
            "install local brain": "brain_setup",
            "test local brain": "brain_test",
            "make a plan to ship 1.2": "plan_create",
            "show plans": "plan_show",
            "search memory for qwen": "memory_search",
            "map the repo": "repo_map",
            "adhd mode on": "focus_mode",
        }
        for text, name in cases.items():
            intent = match(text)
            self.assertIsNotNone(intent, text)
            self.assertEqual(intent.name, name, text)

    def test_memory_tool_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous = memory_module.get_memory()
            memory_module.set_memory(MemoryStore(Path(tmp) / "memory.jsonl"))
            try:
                result = tools.get("memory_save").run(text="temporary test observation")
                self.assertIn("Remembered", result["text"])
                found = tools.get("memory_search").run(query="temporary observation")
                self.assertEqual(len(found["data"]["results"]), 1)
                self.assertIn("temporary", found["data"]["results"][0]["text"])
            finally:
                memory_module.set_memory(previous)




class LaneContractTests(unittest.TestCase):
    """A fake OpenAI-compatible lane proves the local chat contract end to end."""

    @classmethod
    def setUpClass(cls):
        class Handler(BaseHTTPRequestHandler):
            def _send(self, payload):
                body = json.dumps(payload).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):  # noqa: N802
                if self.path.endswith("/v1/models"):
                    self._send({"data": [{"id": "qwen3:4b"}]})
                else:
                    self._send({})

            def do_POST(self):  # noqa: N802
                length = int(self.headers.get("Content-Length") or 0)
                payload = json.loads(self.rfile.read(length) or b"{}")
                content = payload.get("messages", [{}])[-1].get("content", "")
                if isinstance(content, list):
                    kinds = [part.get("type") for part in content if isinstance(part, dict)]
                    self._send({"choices": [{"message": {"content": "vision:" + ",".join(kinds)}}]})
                    return
                self._send({"choices": [{"message": {"content": f"echo:{content}"}}]})

            def log_message(self, *args):
                return

        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_address[1]}/v1/chat/completions"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_probe_and_chat(self):
        settings = SimpleNamespace(
            fast_qwen_url=self.url,
            qwen_url=self.url,
            coder_qwen_url=self.url,
            fast_qwen_model="qwen3:4b",
            qwen_model="qwen2.5:7b-instruct",
            coder_qwen_model="qwen2.5-coder:7b",
        )
        brain = LocalBrain(settings=settings)
        status = brain.status(force=True)
        self.assertTrue(status["online"])
        self.assertEqual(status["lanes"][0]["latency_ms"] is not None, True)
        text, provider = brain.chat([{"role": "user", "content": "ping"}], task="fast", timeout=5)
        self.assertEqual(text, "echo:ping")
        self.assertEqual(provider, "qwen-fast")

    def test_local_vision_payload(self):
        settings = SimpleNamespace(
            fast_qwen_url=self.url,
            qwen_url=self.url,
            coder_qwen_url=self.url,
            fast_qwen_model="qwen3:4b",
            qwen_model="qwen2.5:7b-instruct",
            coder_qwen_model="qwen2.5-coder:7b",
        )
        brain = LocalBrain(settings=settings)
        text, provider = brain.vision("data:image/png;base64,AAAA", "what is this?", timeout=5)
        self.assertEqual(provider, "qwen-vision")
        self.assertEqual(text, "vision:text,image_url")


if __name__ == "__main__":
    unittest.main()
