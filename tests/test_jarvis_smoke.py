from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class JarvisSmokeTest(unittest.TestCase):
    """End-to-end smoke runs of jarvis.py that must never crash on startup.

    Regression history: main() called subprocess.run for termux-wake-lock
    without importing subprocess at module level - it only crashed on devices
    where termux-api is installed, so CI never saw it. These tests simulate
    that environment with a fake termux-wake-lock on PATH.
    """

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_smoke_")
        # A fake termux-wake-lock so the wake-lock branch really executes.
        self.fake_bin = Path(self.tmp) / "bin"
        self.fake_bin.mkdir()
        wake = self.fake_bin / "termux-wake-lock"
        wake.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        wake.chmod(0o755)
        self.env = {
            "NOVA_CHAT_HISTORY": str(Path(self.tmp) / "chat.json"),
            "NOVA_PROFILE_PATH": str(Path(self.tmp) / "profile.json"),
            "PATH": f"{self.fake_bin}{os.pathsep}" + os.environ.get("PATH", ""),
        }

    def test_main_with_wake_lock_available_exits_cleanly(self):
        with patch.dict(os.environ, self.env), \
             patch("core.voice_interface.tts_available", return_value=False), \
             patch("core.voice_interface.stt_available", return_value=False), \
             patch("builtins.input", side_effect=["/exit"]):
            import jarvis
            rc = jarvis.main(["--text"])
        self.assertEqual(rc, 0)

    def test_main_conversation_then_exit(self):
        answers = ["hello jarvis", "kitne baje hain", "/exit"]
        with patch.dict(os.environ, self.env), \
             patch("core.voice_interface.tts_available", return_value=False), \
             patch("core.voice_interface.stt_available", return_value=False), \
             patch("builtins.input", side_effect=answers), \
             patch("core.fast_router.ask") as ask_mock:
            ask_mock.return_value = {"success": False, "lane": "fast", "answer": None}
            import jarvis
            rc = jarvis.main(["--text"])
            # Assert while the isolated env is still active.
            from core.conversation import load
            self.assertGreaterEqual(len(load()), 2)
        self.assertEqual(rc, 0)


if __name__ == "__main__":
    unittest.main()
