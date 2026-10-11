"""v7 reminders — Hinglish time parsing, lifecycle, daily reschedule."""
from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import reminders as rem


class ParseWhenTest(unittest.TestCase):
    """Sab cases fixed `now` ke against — deterministic."""

    def setUp(self):
        self.now = datetime(2026, 10, 11, 14, 0)  # Sunday 2 PM

    def test_minutes_later(self):
        when, daily = rem.parse_when("mujhe 10 minute baad paani pina hai", self.now)
        self.assertEqual(when, self.now + timedelta(minutes=10))
        self.assertFalse(daily)

    def test_hours_later(self):
        when, _ = rem.parse_when("2 ghante baad medicine leni hai", self.now)
        self.assertEqual(when, self.now + timedelta(hours=2))

    def test_half_hour(self):
        when, _ = rem.parse_when("aadha ghanta baad call karna", self.now)
        self.assertEqual(when, self.now + timedelta(minutes=30))

    def test_kal_subah_7_baje(self):
        when, _ = rem.parse_when("kal subah 7 baje jagana", self.now)
        self.assertEqual(when, datetime(2026, 10, 12, 7, 0))

    def test_aaj_raat_9(self):
        when, _ = rem.parse_when("aaj raat 9 baje uthana", self.now)
        self.assertEqual(when, datetime(2026, 10, 11, 21, 0))

    def test_shaam_with_minutes(self):
        when, _ = rem.parse_when("shaam 5:30 baje yaad dilana", self.now)
        self.assertEqual(when, datetime(2026, 10, 11, 17, 30))

    def test_dopahar_pmv(self):
        when, _ = rem.parse_when("dopahar 3 baje lunch", self.now)
        self.assertEqual(when, datetime(2026, 10, 11, 15, 0))

    def test_exact_now_rolls_to_tomorrow(self):
        # abhi exactly 14:00 hai — "dopahar 2 baje" nikal chuka, kal ho jayega
        when, _ = rem.parse_when("dopahar 2 baje lunch", self.now)
        self.assertEqual(when, datetime(2026, 10, 12, 14, 0))

    def test_past_baje_rolls_to_tomorrow(self):
        # abhi 14:00 hai; "9 baje" nikal gaya -> kal 9 (subah maana jata hai number-only me)
        when, _ = rem.parse_when("9 baje yaad dilana", self.now)
        self.assertGreater(when, self.now)

    def test_daily_roz(self):
        when, daily = rem.parse_when("roz subah 6 baje jagana", self.now)
        self.assertTrue(daily)
        # aaj ka 6 AM nikal gaya (now 2 PM) -> kal 6 AM
        self.assertEqual(when, datetime(2026, 10, 12, 6, 0))

    def test_parso(self):
        when, _ = rem.parse_when("parso subah 8 baje", self.now)
        self.assertEqual(when, datetime(2026, 10, 13, 8, 0))

    def test_iso(self):
        when, _ = rem.parse_when("2026-10-12 07:00 jagana", self.now)
        self.assertEqual(when, datetime(2026, 10, 12, 7, 0))

    def test_iso_past_plus_day(self):
        when, _ = rem.parse_when("2026-10-11 09:00", self.now)
        self.assertEqual(when, datetime(2026, 10, 12, 9, 0))

    def test_weekday(self):
        when, _ = rem.parse_when("agle somvar subah 7 baje", self.now)
        # 11 Oct 2026 = Sunday; agle somvar = 12 Oct
        self.assertEqual(when, datetime(2026, 10, 12, 7, 0))

    def test_no_time_returns_none(self):
        self.assertIsNone(rem.parse_when("hello kaise ho", self.now))
        self.assertIsNone(rem.parse_when("", self.now))

    def test_strip_when_keeps_action(self):
        body = rem.strip_when("mujhe kal subah 7 baje jagana")
        self.assertIn("jagan", body.replace(" ", ""))
        self.assertNotIn("kal", body)


class ReminderLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_rem_")
        envs = {"NOVA_REMINDERS_FILE": str(Path(self.tmp) / "reminders.json")}
        patcher = patch.dict("os.environ", envs)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.now = datetime(2026, 10, 11, 14, 0)

    def test_add_list_dismiss(self):
        result = rem.add_reminder("jagana", self.now + timedelta(hours=2))
        self.assertTrue(result["success"])
        self.assertEqual(result["id"], "r1")
        lst = rem.list_reminders()
        self.assertEqual(lst["count"], 1)
        self.assertEqual(lst["reminders"][0]["text"], "jagana")
        gone = rem.dismiss_reminder("r1")
        self.assertTrue(gone["success"])
        self.assertEqual(rem.list_reminders()["count"], 0)
        missing = rem.dismiss_reminder("r1")
        self.assertFalse(missing["success"])

    def test_add_from_iso_string(self):
        result = rem.add_reminder("test", "2026-10-12T07:00:00")
        self.assertTrue(result["success"])
        bad = rem.add_reminder("test", "not-a-date")
        self.assertFalse(bad["success"])

    def test_empty_text_rejected(self):
        self.assertFalse(rem.add_reminder("", self.now)["success"])

    def test_due_oneshot_fires_once(self):
        rem.add_reminder("paani pina", self.now - timedelta(minutes=1))
        due = rem.due_reminders(now=self.now)
        self.assertEqual(due["count"], 1)
        # dobara call -> koi nahi (auto-delete ho gaya)
        self.assertEqual(rem.due_reminders(now=self.now)["count"], 0)
        self.assertEqual(rem.list_reminders()["count"], 0)

    def test_due_future_not_fired(self):
        rem.add_reminder("future", self.now + timedelta(hours=1))
        self.assertEqual(rem.due_reminders(now=self.now)["count"], 0)

    def test_daily_reschedules(self):
        rem.add_reminder("roz jagana", self.now - timedelta(hours=1), daily=True)
        due = rem.due_reminders(now=self.now)
        self.assertEqual(due["count"], 1)
        lst = rem.list_reminders()["reminders"]
        self.assertEqual(len(lst), 1)
        self.assertTrue(lst[0]["daily"])
        # agle din same time pe reschedule hua (now=14:00, original 13:00)
        self.assertEqual(datetime.fromisoformat(lst[0]["when"]),
                         datetime(2026, 10, 12, 13, 0))

    def test_corrupt_entries_do_not_crash(self):
        from pathlib import Path
        store = Path(self.tmp) / "reminders.json"
        store.write_text('[{"id": "x", "text": "bad", "when": "garbage"}]', encoding="utf-8")
        due = rem.due_reminders(now=self.now)
        self.assertEqual(due["count"], 0)
        self.assertEqual(rem.list_reminders()["count"], 1)  # corrupt entry list me dikhta hai, crash nahi

    def test_speak_due_lines(self):
        rem.add_reminder("paani", self.now - timedelta(minutes=1))
        lines = rem.speak_due(now=self.now)
        self.assertEqual(len(lines), 1)
        self.assertIn("paani", lines[0])
        self.assertIn("Boss", lines[0])

    def test_persistence_across_instances(self):
        rem.add_reminder("persist test", self.now + timedelta(days=1))
        # naya process jaisa — _load dobara file se padhta hai
        lst = rem.list_reminders()
        self.assertEqual(lst["count"], 1)
        self.assertEqual(lst["reminders"][0]["text"], "persist test")


class HumanWhenTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 11, 14, 0)

    def test_tomorrow_morning(self):
        self.assertEqual(rem.human_when(datetime(2026, 10, 12, 7, 0), self.now),
                         "kal subah 7 baje")

    def test_today_evening(self):
        self.assertEqual(rem.human_when(datetime(2026, 10, 11, 17, 30), self.now),
                         "aaj shaam 5:30")

    def test_date_fallback(self):
        text = rem.human_when(datetime(2026, 10, 20, 9, 15), self.now)
        self.assertIn("20 Oct", text)
        self.assertIn("9:15", text)


if __name__ == "__main__":
    unittest.main()
