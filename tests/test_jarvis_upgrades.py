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
from core import termux_tools as tt
from core.identity import JARVIS_PERSONALITY


class OpenAppTest(unittest.TestCase):
    def test_known_apps_whitelist(self):
        self.assertIn("instagram", tt.KNOWN_APPS)
        self.assertIn("whatsapp", tt.KNOWN_APPS)
        self.assertIn("youtube", tt.KNOWN_APPS)

    def test_open_app_rejects_unknown(self):
        result = tt.open_app("calculator plus pro")
        self.assertFalse(result["success"])
        self.assertIn("instagram", result.get("known", ""))

    def test_open_app_rejects_weird_scheme(self):
        # Dangerous schemes must never be launched.
        result = tt.open_app("javascript:alert(1)")
        self.assertFalse(result["success"])

    def test_open_app_uses_am_start(self):
        import tempfile
        from pathlib import Path as P
        # Simulate /system/bin/am with a real file so Path.exists() passes.
        fake_am = P(tempfile.mkdtemp(prefix="nova_am_")) / "am"
        fake_am.write_text("#!/bin/sh\n", encoding="utf-8")
        with patch.object(tt, "AM_BIN", str(fake_am)), \
             patch("subprocess.run") as run:
            run.return_value.returncode = 0
            result = tt.open_app("instagram kholo")
        self.assertTrue(result["success"])
        self.assertEqual(result["opened"], "instagram")
        command = run.call_args[0][0]
        self.assertEqual(command[0], str(fake_am))
        self.assertIn("instagram://app", command)

    def test_open_app_am_missing_uses_termux_open_url(self):
        with patch.object(tt, "AM_BIN", "/nonexistent/am"), \
             patch.object(tt, "_run") as run_mock:
            run_mock.return_value = {"success": True}
            result = tt.open_app("youtube")
        self.assertTrue(result["success"])
        launched = run_mock.call_args[0][0]
        self.assertEqual(launched[0], "termux-open-url")

    def test_open_app_falls_back_to_termux_open_url(self):
        with patch("shutil.which", side_effect=lambda name: None), \
             patch.object(tt, "_run") as run_mock:
            run_mock.return_value = {"success": True}
            result = tt.open_app("youtube")
        self.assertTrue(result["success"])
        launched = run_mock.call_args[0][0]
        self.assertEqual(launched[0], "termux-open-url")

    def test_open_app_direct_url(self):
        with patch("shutil.which", return_value=None), \
             patch.object(tt, "_run") as run_mock:
            run_mock.return_value = {"success": True}
            result = tt.open_app("https://example.com")
        self.assertTrue(result["success"])
        self.assertEqual(result["mode"], "url")


class JarvisIntentUpgradeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_jarvis2_")
        envs = {
            "NOVA_CHAT_HISTORY": str(Path(self.tmp) / "chat.json"),
            "NOVA_PROFILE_PATH": str(Path(self.tmp) / "profile.json"),
            "NOVA_PERSONAL_PROFILE_ENABLED": "true",
        }
        patcher = patch.dict("os.environ", envs)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_battery_intent_parses_percentage(self):
        battery_payload = {
            "success": True,
            "returncode": 0,
            "data": {
                "percentage": 88, "status": "CHARGING",
                "temperature": 34.2, "technology": "Li-ion",
            },
        }
        # Patch at the binding the registry actually uses.
        with patch("core.tool_bridge.battery_status", return_value=battery_payload):
            result = jb.respond("battery kitni hai?")
        self.assertEqual(result["via"], "tool")
        self.assertIn("88 percent", result["reply"])
        self.assertIn("charge ho rahi", result["reply"])
        # Raw dict must never be spoken.
        self.assertNotIn("{", result["reply"])

    def test_open_intent(self):
        with patch("core.tool_bridge.open_app", return_value={
                "success": True, "opened": "instagram", "mode": "app"}):
            result = jb.respond("jarvis instagram kholo")
        self.assertEqual(result["via"], "tool")
        self.assertIn("instagram", result["reply"].lower())
        self.assertIn("Khol diya", result["reply"])

    def test_open_intent_unknown_app(self):
        with patch("core.tool_bridge.open_app", return_value={
                "success": False, "error": "no", "known": "instagram, youtube"}):
            result = jb.respond("tiktok kholo")
        self.assertTrue(result["success"])
        self.assertIn("instagram", result["reply"])

    def test_news_intent_reads_headlines(self):
        search_payload = {
            "success": True,
            "results": [
                {"title": "India wins the match", "url": "https://x.com/1", "snippet": ""},
                {"title": "Markets rise sharply", "url": "https://x.com/2", "snippet": ""},
                {"title": "Rain in Bihar", "url": "https://x.com/3", "snippet": ""},
            ],
        }
        with patch.object(jb, "_registry") as fake_registry:
            fake_registry.return_value.execute.return_value = {
                "success": True,
                "result": {"trust": "untrusted", "content": search_payload},
            }
            result = jb.respond("aaj ki news batao")
        self.assertEqual(result["via"], "tool")
        self.assertIn("India wins", result["reply"])
        self.assertIn("Markets rise", result["reply"])
        # No raw URLs spoken.
        self.assertNotIn("http", result["reply"])

    def test_news_intent_offline(self):
        with patch.object(jb, "_registry") as fake_registry:
            fake_registry.return_value.execute.return_value = {
                "success": False, "result": None}
            result = jb.respond("khabar kya hai")
        self.assertTrue(result["success"])

    def test_model_chat_uses_warmer_settings(self):
        with patch("core.fast_router.ask") as ask_mock:
            ask_mock.return_value = {"success": True, "lane": "fast",
                                     "answer": "Boss, mera manna hai ki aise karo."}
            result = jb.respond("career advice do thoda detail me")
        self.assertTrue(result["success"])
        _, kwargs = ask_mock.call_args
        self.assertEqual(kwargs.get("temperature"), 0.7)
        self.assertGreaterEqual(kwargs.get("max_tokens"), 800)
        self.assertIn("Hinglish", kwargs.get("system", ""))

    def test_anti_repeat_regenerates(self):
        # History me same reply pada hai; model wahi dobara bolta hai.
        from core import conversation as conv
        conv.add("user", "hello")
        conv.add("assistant", "Hello! What can I do for you?")
        with patch("core.fast_router.ask") as ask_mock:
            ask_mock.side_effect = [
                {"success": True, "lane": "fast", "answer": "Hello! What can I do for you?"},
                {"success": True, "lane": "fast", "answer": "Bol Boss, kya kaam karwana hai?"},
            ]
            result = jb.respond("aur batao")
        # The regenerated, different reply must win.
        self.assertEqual(result["reply"], "Bol Boss, kya kaam karwana hai?")
        self.assertEqual(ask_mock.call_count, 2)
        self.assertIn("Dobara wahi jawab mat do", ask_mock.call_args_list[1][0][0])


class PersonalityTest(unittest.TestCase):
    def test_personality_has_examples_and_rules(self):
        self.assertIn("Hinglish", JARVIS_PERSONALITY)
        self.assertIn("NEVER reply in pure English", JARVIS_PERSONALITY)
        self.assertIn("EXAMPLES", JARVIS_PERSONALITY)
        # Few-shot examples make small models obey.
        self.assertGreaterEqual(JARVIS_PERSONALITY.count(":"), 4)


class SpeechSweetnessTest(unittest.TestCase):
    def test_emoji_stripped_for_tts(self):
        from core.voice_interface import clean_for_speech
        cleaned = clean_for_speech("Hello Boss! 😊🎉 Done ho gaya ✅")
        self.assertNotIn("😊", cleaned)
        self.assertNotIn("🎉", cleaned)
        self.assertIn("Done ho gaya", cleaned)


if __name__ == "__main__":
    unittest.main()
