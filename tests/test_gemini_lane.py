from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import gemini_lane as gl
from core import jarvis_brain as jb


class KeyManagementTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_gem_")
        self.key_file = Path(self.tmp) / "gemini.key"
        envs = {"NOVA_GEMINI_KEY_FILE": str(self.key_file)}
        patcher = patch.dict("os.environ", envs)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_key_lifecycle(self):
        self.assertFalse(gl.has_key())
        result = gl.set_key("AIza" + "a1b2c3d4e5" * 4)
        self.assertTrue(result["success"])
        self.assertTrue(gl.has_key())
        self.assertTrue(self.key_file.exists())
        # File permissions are owner-only.
        self.assertEqual(self.key_file.stat().st_mode & 0o077, 0)
        self.assertTrue(gl.clear_key()["success"])
        self.assertFalse(gl.has_key())

    def test_rejects_short_key(self):
        result = gl.set_key("AIza123")
        self.assertFalse(result["success"])

    def test_key_file_is_gitignored(self):
        # The real repo .gitignore must protect the real key path.
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("config/gemini.key", gitignore)

    def test_disabled_by_env(self):
        gl.set_key("AIza" + "a1b2c3d4e5" * 4)
        with patch.dict("os.environ", {"NOVA_GEMINI_ENABLED": "false"}):
            self.assertFalse(gl.has_key())

    def test_model_from_registry_with_env_override(self):
        # Default comes from the SunnyAI Google model registry.
        self.assertTrue(gl._model().startswith("gemini-"))
        with patch.dict("os.environ", {"NOVA_GEMINI_MODEL": "gemini-test"}):
            self.assertEqual(gl._model(), "gemini-test")


class GeminiCallTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_gemcall_")
        envs = {
            "NOVA_GEMINI_KEY_FILE": str(Path(self.tmp) / "gemini.key"),
            "NOVA_CHAT_HISTORY": str(Path(self.tmp) / "chat.json"),
            "NOVA_PROFILE_PATH": str(Path(self.tmp) / "profile.json"),
        }
        patcher = patch.dict("os.environ", envs)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _fake_response(self, payload: dict):
        class FakeResponse:
            status = 200
            def __init__(self, data):
                self._data = json.dumps(data).encode("utf-8")
            def read(self):
                return self._data
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False
        return FakeResponse(payload)

    def test_ask_gemini_parses_response(self):
        gl.set_key("AIza" + "a1b2c3d4e5" * 4)
        payload = {"candidates": [{"content": {"parts": [{"text": "  Boss, ho gaya!  "}], "role": "model"}}]}
        with patch("core.gemini_lane.urlopen", return_value=self._fake_response(payload)) as u:
            result = gl.ask_gemini(
                "kya haal",
                history=[
                    {"role": "user", "content": "hello"},
                    {"role": "assistant", "content": "Namaste Boss!"},
                ],
                system="Tu Jarvis hai, Boss ka assistant.",
            )
        self.assertTrue(result["success"])
        self.assertEqual(result["answer"], "Boss, ho gaya!")
        self.assertEqual(result["lane"], "gemini")
        # Request contained history with model role + system instruction.
        body = json.loads(u.call_args[0][0].data.decode("utf-8"))
        roles = [c["role"] for c in body["contents"]]
        self.assertIn("model", roles)
        self.assertIn("system_instruction", body)
        # Key travels in the URL, never in the logged body.
        self.assertIn("key=", u.call_args[0][0].full_url)

    def test_ask_gemini_without_key_fails_cleanly(self):
        result = gl.ask_gemini("kuch bhi")
        self.assertFalse(result["success"])
        self.assertIn("key", result["error"].lower())

    def test_ask_gemini_network_error(self):
        gl.set_key("AIza" + "a1b2c3d4e5" * 4)
        with patch("core.gemini_lane.urlopen", side_effect=OSError("no internet")):
            result = gl.ask_gemini("test")
        self.assertFalse(result["success"])
        self.assertIn("fail", result["error"].lower())

    def test_ask_gemini_empty_candidates(self):
        gl.set_key("AIza" + "a1b2c3d4e5" * 4)
        payload = {"candidates": []}
        with patch("core.gemini_lane.urlopen", return_value=self._fake_response(payload)):
            result = gl.ask_gemini("test")
        self.assertFalse(result["success"])

    def test_brain_prefers_gemini_when_key_set(self):
        gl.set_key("AIza" + "a1b2c3d4e5" * 4)
        with patch("core.gemini_lane.ask_gemini", return_value={
                "success": True, "answer": "Gemini ka smart jawab Boss!",
                "model": "gemini-3.7-flash", "lane": "gemini"}) as gem, \
             patch("core.fast_router.ask") as local_ask:
            result = jb.respond("quantum physics detail me samjhao")
        self.assertTrue(result["success"])
        self.assertEqual(result["via"], "gemini")
        self.assertIn("smart jawab", result["reply"])
        # Local lane must NOT be called when Gemini succeeded.
        local_ask.assert_not_called()

    def test_brain_falls_back_to_local_when_gemini_fails(self):
        gl.set_key("AIza" + "a1b2c3d4e5" * 4)
        with patch("core.gemini_lane.ask_gemini", return_value={
                "success": False, "error": "Gemini call fail: OSError"}), \
             patch("core.fast_router.ask", return_value={
                "success": True, "lane": "fast", "answer": "Local jawab Boss."}):
            result = jb.respond("thoda motivation do")
        self.assertTrue(result["success"])
        self.assertEqual(result["via"], "fast")
        self.assertIn("Local jawab", result["reply"])

    def test_brain_local_only_without_key(self):
        # No key -> gemini lane skipped entirely.
        with patch("core.gemini_lane.has_key", return_value=False), \
             patch("core.gemini_lane.ask_gemini") as gem, \
             patch("core.fast_router.ask", return_value={
                "success": True, "lane": "fast", "answer": "local jawab"}):
            result = jb.respond("thoda motivation do")
        self.assertEqual(result["via"], "fast")
        gem.assert_not_called()

    def test_key_never_leaks_into_reply(self):
        gl.set_key("AIzaSUPERSECRETKEY" + "1234567890")
        with patch("core.gemini_lane.ask_gemini", return_value={
                "success": False, "error": "Gemini call fail: OSError"}), \
             patch("core.fast_router.ask", return_value={
                "success": True, "lane": "fast", "answer": "local jawab"}):
            result = jb.respond("test message")
        self.assertNotIn("SUPERSECRET", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
