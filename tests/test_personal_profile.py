from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import personal_profile as pp


class PersonalProfileTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_profile_")
        self.profile_path = Path(self.tmp) / "profile.json"
        self.env = patch.dict("os.environ", {
            "NOVA_PROFILE_PATH": str(self.profile_path),
            "NOVA_PERSONAL_PROFILE_ENABLED": "true",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_remember_and_recall(self):
        result = pp.personal_remember("Owner lives in Delhi", category="preference")
        self.assertTrue(result["success"])
        self.assertEqual(result["category"], "preference")

        result = pp.personal_remember("Goal: learn neural networks", category="goal")
        self.assertTrue(result["success"])

        recall = pp.personal_recall("delhi")
        self.assertTrue(recall["success"])
        self.assertEqual(recall["count"], 1)
        self.assertIn("Delhi", recall["facts"][0]["text"])

        recall_all = pp.personal_recall("")
        self.assertEqual(recall_all["count"], 2)

    def test_remember_is_idempotent(self):
        pp.personal_remember("Likes Hindi replies")
        result = pp.personal_remember("likes hindi replies")
        self.assertTrue(result["success"])
        self.assertTrue(result["already_known"])
        stored = json.loads(self.profile_path.read_text(encoding="utf-8"))
        self.assertEqual(len(stored["facts"]), 1)

    def test_unknown_category_becomes_note(self):
        result = pp.personal_remember("Random thought", category="whatever")
        self.assertEqual(result["category"], "note")

    def test_forget(self):
        pp.personal_remember("Temporary reminder about dentist")
        result = pp.personal_forget("dentist")
        self.assertTrue(result["success"])
        self.assertEqual(result["remaining"], 0)
        self.assertFalse(pp.personal_recall("dentist")["count"])

    def test_forget_no_match(self):
        pp.personal_remember("Keep this fact")
        result = pp.personal_forget("unrelated words here")
        self.assertFalse(result["success"])

    def test_briefing(self):
        pp.personal_remember("Goal: 100 subscribers", category="goal")
        pp.personal_remember("Reminder: water the plants", category="reminder")
        result = pp.personal_briefing(owner="Boss")
        self.assertTrue(result["success"])
        self.assertIn("Boss", result["briefing"])
        self.assertIn("100 subscribers", result["briefing"])
        self.assertIn("water the plants", result["briefing"])
        self.assertEqual(len(result["goals"]), 1)
        self.assertEqual(len(result["reminders"]), 1)

    def test_briefing_empty_profile(self):
        result = pp.personal_briefing()
        self.assertTrue(result["success"])
        self.assertIn("Nothing personal is stored yet", result["briefing"])

    def test_disabled(self):
        with patch.dict("os.environ", {"NOVA_PERSONAL_PROFILE_ENABLED": "false"}):
            self.assertFalse(pp.personal_remember("x")["success"])
            self.assertFalse(pp.personal_recall() ["success"])
            self.assertFalse(pp.personal_briefing()["success"])

    def test_corrupt_file_is_tolerated(self):
        self.profile_path.parent.mkdir(parents=True, exist_ok=True)
        self.profile_path.write_text("{not json", encoding="utf-8")
        result = pp.personal_recall()
        self.assertTrue(result["success"])
        self.assertEqual(result["count"], 0)


if __name__ == "__main__":
    unittest.main()
