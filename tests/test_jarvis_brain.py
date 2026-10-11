from __future__ import annotations

import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import jarvis_brain as jb


class JarviewModelTest(unittest.TestCase):
    """Brain tests that patch the local lane (no server needed)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_jarvis_")
        # Isolate both the chat history and the personal profile.
        envs = {
            "NOVA_CHAT_HISTORY": str(Path(self.tmp) / "chat.json"),
            "NOVA_PROFILE_PATH": str(Path(self.tmp) / "profile.json"),
            "NOVA_PERSONAL_PROFILE_ENABLED": "true",
            "NOVA_JARVIS_ENABLED": "true",
        }
        patcher = patch.dict("os.environ", envs)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_greeting(self):
        result = jb.respond("hello jarvis")
        self.assertTrue(result["success"])
        self.assertEqual(result["via"], "smalltalk")
        self.assertIn("Boss", result["reply"])

    def test_how_are_you(self):
        result = jb.respond("kaise ho tum?")
        self.assertTrue(result["success"])
        self.assertIn("kaam", result["reply"].lower())

    def test_thanks(self):
        result = jb.respond("thanks boss kaam ho gaya")
        self.assertEqual(result["via"], "smalltalk")

    def test_exit_words(self):
        result = jb.respond("band karo")
        self.assertTrue(result["success"])
        self.assertTrue(result["exit"])
        result = jb.respond("so jao")
        self.assertTrue(result.get("exit"))

    def test_time_intent(self):
        result = jb.respond("kitne baje hain?")
        self.assertEqual(result["via"], "tool")
        self.assertIn("baje", result["reply"])

    def test_weather_intent_with_city(self):
        payload = {
            "current_condition": [{
                "temp_C": "33", "FeelsLikeC": "38", "humidity": "40",
                "windspeedKmph": "8", "weatherDesc": [{"value": "Sunny"}],
            }],
            "nearest_area": [{"areaName": [{"value": "Patna"}],
                              "region": [{"value": "Bihar"}]}],
        }
        from core import public_api_tools as pat
        with patch.object(pat, "_get_json", return_value=payload):
            result = jb.respond("Patna ka mausam kaisa hai?")
        self.assertEqual(result["via"], "tool")
        self.assertIn("33", result["reply"])
        self.assertIn("Sunny", result["reply"])

    def test_weather_intent_without_city_asks(self):
        result = jb.respond("mausam kaisa hai?")
        self.assertEqual(result["via"], "tool")
        self.assertIn("sheher", result["reply"])

    def test_remember_intent(self):
        result = jb.respond("yaad rakho mera birthday 15 August hai")
        self.assertEqual(result["via"], "tool")
        self.assertIn("Noted", result["reply"])
        # Verify it actually landed in the (isolated) profile.
        from core.personal_profile import personal_recall
        recall = personal_recall("birthday")
        self.assertEqual(recall["count"], 1)

    def test_recall_intent_empty(self):
        result = jb.respond("kya yaad hai mujhe?")
        self.assertTrue(result["success"])
        self.assertIn("yaad", result["reply"].lower())

    def test_model_reply_with_history_and_personality(self):
        with patch("core.fast_router.ask") as ask_mock:
            ask_mock.return_value = {"success": True, "lane": "fast", "answer": "Theek hai Boss, kar deta hu."}
            result = jb.respond("ek script likh do")
        self.assertTrue(result["success"])
        self.assertEqual(result["via"], "fast")
        self.assertIn("Theek hai", result["reply"])
        _, kwargs = ask_mock.call_args
        self.assertIn("system", kwargs)
        self.assertIn("history", kwargs)

    def test_configured_gemini_answers_before_local_model(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key", "NOVA_LLM_PROVIDER": "auto"}):
            with patch("core.gemini_client.ask", return_value={
                "success": True, "lane": "gemini", "answer": "Haan Boss, sun raha hu."
            }) as gemini_mock, patch("core.fast_router.ask") as local_mock:
                result = jb.respond("ek kahani sunao dragon ke baare me")
        self.assertTrue(result["success"])
        self.assertEqual(result["via"], "gemini")
        gemini_mock.assert_called_once()
        local_mock.assert_not_called()

    def test_gemini_failure_falls_back_to_local_model(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key", "NOVA_LLM_PROVIDER": "auto"}):
            with patch("core.gemini_client.ask", return_value={
                "success": False, "lane": "gemini", "answer": None, "error": "network_error"
            }), patch("core.fast_router.ask", return_value={
                "success": True, "lane": "fast", "answer": "Local model jawab."
            }):
                result = jb.respond("ek kahani sunao dragon ke baare me")
        self.assertTrue(result["success"])
        self.assertEqual(result["via"], "fast")
        self.assertIn("Local model", result["reply"])

    def test_model_offline_falls_back_honestly(self):
        with patch("core.fast_router.ask") as ask_mock:
            ask_mock.return_value = {"success": False, "lane": "fast", "answer": None}
            result = jb.respond("ek lamba essay likho quantum physics pe")
        self.assertTrue(result["success"])
        self.assertEqual(result["via"], "offline")
        self.assertIn("offline", result["reply"].lower())

    def test_empty_message(self):
        self.assertFalse(jb.respond("   ")["success"])


class JarvisHelperTest(unittest.TestCase):
    def test_extract_city_in(self):
        self.assertEqual(jb._extract_city("weather in Patna please"), "Patna")
        self.assertEqual(jb._extract_city("Dhanbad me mausam"), "Dhanbad")

    def test_extract_city_fallback_word(self):
        city = jb._extract_city("Delhi ka mausam")
        self.assertEqual(city, "Delhi")


class JarvisCleanReplyTest(unittest.TestCase):
    def test_clean_reply_strips_think_blocks(self):
        import jarvis
        raw = "<think>user ne time pucha, main friendly hu</think> Boss, 5 baje hain!"
        cleaned = jarvis.clean_reply(raw)
        self.assertNotIn("<think>", cleaned)
        self.assertNotIn("user ne", cleaned)
        self.assertIn("5 baje", cleaned)

    def test_clean_reply_plain(self):
        import jarvis
        self.assertEqual(jarvis.clean_reply("  simple   reply  "), "simple reply")


if __name__ == "__main__":
    unittest.main()
