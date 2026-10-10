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

from core import conversation as conv


class ConversationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_chat_")
        self.history_path = Path(self.tmp) / "chat_history.json"
        self.env = patch.dict("os.environ", {
            "NOVA_CHAT_HISTORY": str(self.history_path),
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_add_and_load(self):
        conv.add("user", "Jarvis, 5 baje reminder dena")
        conv.add("assistant", "Noted Boss!")
        turns = conv.load()
        self.assertEqual(len(turns), 2)
        self.assertEqual(turns[0]["role"], "user")
        self.assertIn("reminder", turns[0]["content"])
        self.assertEqual(turns[1]["role"], "assistant")

    def test_context_is_bounded(self):
        for i in range(40):
            conv.add("user", f"message number {i}")
        ctx = conv.context()
        self.assertLessEqual(len(ctx), conv.CONTEXT_TURNS)
        # The newest message must be in the context window.
        self.assertIn("message number 39", ctx[-1]["content"])

    def test_long_turns_are_capped(self):
        conv.add("user", "x" * 5000)
        turns = conv.load()
        self.assertLessEqual(len(turns[0]["content"]), conv.MAX_TURN_CHARS)

    def test_reset(self):
        conv.add("user", "secret stuff")
        result = conv.reset()
        self.assertTrue(result["success"])
        self.assertEqual(conv.load(), [])

    def test_corrupt_file_tolerated(self):
        self.history_path.parent.mkdir(parents=True, exist_ok=True)
        self.history_path.write_text("{broken", encoding="utf-8")
        self.assertEqual(conv.load(), [])

    def test_roles_normalized(self):
        conv.add("system", "should be dropped as assistant-side noise")
        conv.add("assistant", "real reply")
        turns = conv.load()
        roles = {t["role"] for t in turns}
        self.assertTrue(roles.issubset({"user", "assistant"}))

    def test_summarize_load(self):
        conv.add("user", "hi")
        info = conv.summarize_load()
        self.assertTrue(info["success"])
        self.assertEqual(info["turns_stored"], 1)
        self.assertEqual(info["context_window"], conv.CONTEXT_TURNS)


if __name__ == "__main__":
    unittest.main()
