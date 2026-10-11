"""v7 brain wiring — reminder/file/storage/pdf intents + TIME_Q priority."""
from __future__ import annotations

import sys
import tempfile
from datetime import datetime
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import jarvis_brain as jb


class V7Env(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_v7_")
        self.files = Path(self.tmp) / "files"
        self.files.mkdir()
        (self.files / "maths notes.pdf").write_bytes(b"%PDF-1.4")
        envs = {
            "NOVA_REMINDERS_FILE": str(Path(self.tmp) / "rem.json"),
            "NOVA_FILE_ROOTS": str(self.files),
        }
        patcher = patch.dict("os.environ", envs)
        patcher.start()
        self.addCleanup(patcher.stop)


class ReminderIntentTest(V7Env):
    def test_add_reminder_intent(self):
        reply = jb._intents("mujhe kal subah 7 baje jagana")
        self.assertIsNotNone(reply)
        self.assertIn("Yaad rakh liya", reply)
        self.assertIn("kal subah 7 baje", reply)

    def test_add_reminder_minutes(self):
        reply = jb._intents("10 minute baad paani pina hai yaad dilana")
        self.assertIsNotNone(reply)
        self.assertIn("Yaad rakh liya", reply)

    def test_add_daily_reminder(self):
        reply = jb._intents("roz subah 6 baje jagana")
        self.assertIsNotNone(reply)
        self.assertIn("roz ka", reply)

    def test_add_without_time_asks_back(self):
        reply = jb._intents("mujhe yaad dilana ki padhna hai")
        self.assertIsNotNone(reply)
        self.assertIn("Kab yaad dilaun", reply)
        # kuch store nahi hua
        from core import reminders as rem
        self.assertEqual(rem.list_reminders()["count"], 0)

    def test_list_reminders_intent(self):
        jb._intents("mujhe kal subah 7 baje jagana")
        reply = jb._intents("mere reminders kya hain")
        self.assertIn("1 reminders", reply)
        self.assertIn("jagana", reply)

    def test_reminder_beats_time_intent(self):
        # "baje" word TIME_Q bhi match karta hai — reminder ko priority milti hai
        reply = jb._intents("mujhe kal subah 7 baje jagana")
        self.assertIn("Yaad rakh liya", reply)
        reply_none = jb._intents("kal subah 7 baje ka time batana nahi hai")  # nahi — reminder pattern nahi
        # yeReminder nahi banna chahiye (trigger words nahi) — TIME_Q/tool path
        from core import reminders as rem
        self.assertEqual(rem.list_reminders()["count"], 1)  # sirf pehla wala

    def test_time_still_works(self):
        reply = jb._intents("kya time hua hai")
        self.assertIsNotNone(reply)
        self.assertIn("baje", reply)


class FileIntentTest(V7Env):
    def test_file_search_intent(self):
        reply = jb._intents("maths notes pdf dhoondo")
        self.assertIsNotNone(reply)
        self.assertIn("maths notes.pdf", reply)

    def test_file_search_no_match(self):
        reply = jb._intents("physics notes file dhoondo")
        self.assertIsNotNone(reply)
        self.assertIn("nahi mili", reply)

    def test_storage_intent(self):
        reply = jb._intents("storage kitna khali hai")
        self.assertIsNotNone(reply)
        self.assertIn("khali", reply)

    def test_pdf_open_intent(self):
        # termux-open sandbox me nahi — par intent PDF_Q se handle hota hai (OPEN_Q se nahi)
        reply = jb._intents("maths notes pdf kholo")
        self.assertIsNotNone(reply)
        # ya khul gaya ya saaf error — "Ye nahi khul paya... Meri list me" (app-open) nahi
        self.assertNotIn("Meri list me", reply)

    def test_pdf_read_intent_without_pypdf(self):
        import builtins
        real_import = builtins.__import__

        def fake_import(name, *args, **kwargs):
            if name == "pypdf":
                raise ImportError("no pypdf")
            return real_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=fake_import):
            reply = jb._intents("maths notes pdf padho")
        self.assertIsNotNone(reply)
        self.assertIn("pypdf", reply)


class RespondSmokeTest(V7Env):
    def test_respond_reminder_via_tool(self):
        result = jb.respond("mujhe kal subah 7 baje jagana")
        self.assertTrue(result["success"])
        self.assertEqual(result.get("via"), "tool")

    def test_respond_time_still_via_tool(self):
        result = jb.respond("kya time hai")
        self.assertEqual(result.get("via"), "tool")


if __name__ == "__main__":
    unittest.main()
