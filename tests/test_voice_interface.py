from __future__ import annotations

import sys
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import voice_interface as vi


class VoiceInterfaceTest(unittest.TestCase):
    def test_clean_for_speech_strips_markdown(self):
        raw = "**Jarvis** online `ready` [link](http://x.com) :) *bold* #tag"
        cleaned = vi.clean_for_speech(raw)
        self.assertNotIn("**", cleaned)
        self.assertNotIn("[link]", cleaned)
        self.assertNotIn("http", cleaned)
        self.assertNotIn(":)", cleaned)
        self.assertIn("Jarvis", cleaned)

    def test_speak_falls_back_to_print_without_termux(self):
        with patch.object(vi, "tts_available", return_value=False):
            result = vi.speak("Hello Boss")
        self.assertTrue(result["success"])
        self.assertFalse(result["spoken"])
        self.assertEqual(result["engine"], "text")

    def test_speak_rejects_empty(self):
        self.assertFalse(vi.speak("   ")["success"])

    def test_speak_uses_termux_command(self):
        with patch.object(vi, "tts_available", return_value=True), \
             patch("subprocess.run") as run:
            run.return_value.returncode = 0
            result = vi.speak("Namaste Boss")
        self.assertTrue(result["success"])
        self.assertTrue(result["spoken"])
        command = run.call_args[0][0]
        self.assertEqual(command[0], "termux-tts-speak")
        self.assertIn("Namaste Boss", command)

    def test_speak_with_language_option(self):
        with patch.dict("os.environ", {"NOVA_TTS_LANGUAGE": "hin"}), \
             patch.object(vi, "tts_available", return_value=True), \
             patch("subprocess.run") as run:
            run.return_value.returncode = 0
            vi.speak("kaise ho")
        command = run.call_args[0][0]
        self.assertIn("-l", command)
        self.assertIn("hin", command)

    def test_listen_typed_fallback(self):
        with patch.object(vi, "stt_available", return_value=False), \
             patch("builtins.input", return_value="  kaam kar do  "):
            result = vi.listen()
        self.assertTrue(result["success"])
        self.assertEqual(result["text"], "kaam kar do")
        self.assertEqual(result["source"], "typed")

    def test_listen_typed_empty(self):
        with patch.object(vi, "stt_available", return_value=False), \
             patch("builtins.input", return_value="   "):
            result = vi.listen()
        self.assertFalse(result["success"])

    def test_listen_speech(self):
        with patch.object(vi, "stt_available", return_value=True), \
             patch("subprocess.run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = "kya time hua hai\n"
            result = vi.listen()
        self.assertTrue(result["success"])
        self.assertEqual(result["text"], "kya time hua hai")
        self.assertEqual(result["source"], "speech")

    def test_status_shape(self):
        result = vi.status()
        self.assertTrue(result["success"])
        self.assertIn(result["mode"], {"voice", "text"})
        self.assertIn("tts_available", result)
        self.assertIn("stt_available", result)


if __name__ == "__main__":
    unittest.main()
