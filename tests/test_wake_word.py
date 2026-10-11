"""v7 wake word — filter on/off, detection, strip."""
from __future__ import annotations

import sys
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import wake_word as ww


class WakeWordEnabledTest(unittest.TestCase):
    def test_default_on(self):
        with patch.dict("os.environ", {}, clear=False):
            import os
            os.environ.pop("NOVA_WAKE_WORD", None)
            self.assertTrue(ww.enabled())

    def test_off_values(self):
        for val in ("0", "off", "false", "no", "nahi", "band", "OFF"):
            with patch.dict("os.environ", {"NOVA_WAKE_WORD": val}):
                self.assertFalse(ww.enabled(), val)

    def test_on_values(self):
        for val in ("1", "on", "true", "yes", ""):
            with patch.dict("os.environ", {"NOVA_WAKE_WORD": val}):
                self.assertTrue(ww.enabled(), val)

    def test_set_enabled_toggle(self):
        with patch.dict("os.environ", {}, clear=False):
            ww.set_enabled(False)
            self.assertFalse(ww.enabled())
            ww.set_enabled(True)
            self.assertTrue(ww.enabled())


class IsWakeTest(unittest.TestCase):
    def test_wake_phrases(self):
        for text in (
            "Jarvis kya time hai",
            "hey jarvis mausam batao",
            "nova battery kitni hai",
            "jarwis ye kya hai",   # STT mis-hear
            "jervis batao",
            "Jarvis, are you there?",
            "जार्विस सुनो",
        ):
            self.assertTrue(ww.is_wake(text), text)

    def test_non_wake_ignored(self):
        for text in (
            "arre ye gaana achha hai",
            "kya mausam hai",
            "chalo ghumne chalte hain",
            "python kitna mushkil hai",
            "",
        ):
            self.assertFalse(ww.is_wake(text), text)

    def test_slash_commands_always_pass(self):
        for text in ("/status", "/reminders", "/wake on", "/exit"):
            self.assertTrue(ww.is_wake(text), text)


class StripWakeTest(unittest.TestCase):
    def test_strip_leading(self):
        self.assertEqual(ww.strip_wake("Jarvis kya time hai"), "kya time hai")
        self.assertEqual(ww.strip_wake("Nova, mausam batao"), "mausam batao")
        self.assertEqual(ww.strip_wake("hey jarvis battery batao"), "battery batao")

    def test_strip_mid_sentence_keeps_text(self):
        # beech me bola wake word — poora text rehta hai (sirf leading hata)
        self.assertIn("jarvis", ww.strip_wake("sun jarvis kya time hai").lower())

    def test_only_wake_word(self):
        self.assertEqual(ww.strip_wake("Jarvis"), "")
        self.assertEqual(ww.strip_wake("Nova?"), "")


if __name__ == "__main__":
    unittest.main()
