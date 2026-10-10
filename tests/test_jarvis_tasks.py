"""Local task/reminder tests: no Android API, no model writes, private storage."""
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

import jarvis_personal as app
from jarvis_tasks import Tasks, parse_due


class TaskTests(unittest.TestCase):
    def test_due_formats_are_normalized_and_bad_ones_rejected(self):
        self.assertEqual(parse_due("2026-10-11"), "2026-10-11")
        self.assertEqual(parse_due(" 2026-10-11   18:00 "), "2026-10-11 18:00")
        self.assertIsNone(parse_due(""))
        for bad in ["11-10-2026", "2026-13-01", "tomorrow", "2026-10-11 25:00"]:
            with self.assertRaises(ValueError):
                parse_due(bad)

    def test_add_list_done_and_privacy(self):
        with TemporaryDirectory() as tmp:
            tasks = Tasks(Path(tmp) / "private")
            try:
                added = tasks.add("Call Ravi | 2026-10-11 18:00")
                tasks.add("Buy milk")
                self.assertEqual(added["due"], "2026-10-11 18:00")
                self.assertEqual(tasks.path.stat().st_mode & 0o777, 0o600)
                self.assertEqual([t["title"] for t in tasks.list_open()["tasks"]], ["Call Ravi", "Buy milk"])
                self.assertTrue(tasks.mark_done(str(added["task_id"]))["success"])
                self.assertFalse(tasks.mark_done(str(added["task_id"]))["success"])
                self.assertEqual([t["title"] for t in tasks.list_open()["tasks"]], ["Buy milk"])
                with self.assertRaises(ValueError):
                    tasks.mark_done("abc; rm -rf")
                with self.assertRaises(ValueError):
                    tasks.add("api_key=secret123")
                with self.assertRaises(ValueError):
                    tasks.add("   ")
            finally:
                tasks.close()

    def test_plan_splits_overdue_today_and_undated(self):
        with TemporaryDirectory() as tmp:
            tasks = Tasks(Path(tmp) / "private")
            try:
                tasks.add("Old | 2026-10-08")
                tasks.add("Today | 2026-10-10 09:00")
                tasks.add("Later | 2026-10-20")
                tasks.add("Anytime")
                plan = tasks.plan(datetime(2026, 10, 10, 12, 0))
                self.assertEqual([t["title"] for t in plan["overdue"]], ["Old"])
                self.assertEqual([t["title"] for t in plan["today"]], ["Today"])
                self.assertEqual([t["title"] for t in plan["undated"]], ["Anytime"])
            finally:
                tasks.close()

    def test_task_commands_are_owner_only_and_skip_approval(self):
        with TemporaryDirectory() as tmp:
            personal = app.PersonalJarvis(Path(tmp) / "private", Path(tmp) / "sources", brain=Mock())
            try:
                result = personal.handle("/task add Gym | 2026-10-11")
                self.assertTrue(result["success"])
                self.assertEqual(personal.pending, {})
                self.assertEqual(personal.handle("/tasks")["tasks"][0]["title"], "Gym")
                personal.handle("/task done " + str(result["task_id"]))
                self.assertEqual(personal.handle("/tasks")["tasks"], [])
            finally:
                personal.close()

    def test_model_text_cannot_create_or_finish_tasks(self):
        brain = Mock()
        brain.ask.return_value = "/task add Hacked\n/task done 1"
        with TemporaryDirectory() as tmp:
            personal = app.PersonalJarvis(Path(tmp) / "private", Path(tmp) / "sources", brain=brain)
            try:
                personal.handle("hello")
                self.assertEqual(personal.tasks.list_open()["tasks"], [])
            finally:
                personal.close()

    def test_open_tasks_reach_model_as_data_only(self):
        brain = Mock()
        brain.ask.return_value = "Theek hai Sunny ji."
        with TemporaryDirectory() as tmp:
            personal = app.PersonalJarvis(Path(tmp) / "private", Path(tmp) / "sources", brain=brain)
            try:
                personal.handle("/task add Submit report | 2026-10-11")
                personal.handle("Mera kaam batao")
            finally:
                personal.close()
        notes = brain.ask.call_args.kwargs["notes"]
        self.assertIn("Submit report", notes)


class ConversationMemoryTests(unittest.TestCase):
    def test_history_is_passed_bounded_and_memory_only(self):
        brain = Mock()
        brain.ask.side_effect = [f"Reply {i}" for i in range(6)]
        with TemporaryDirectory() as tmp:
            personal = app.PersonalJarvis(Path(tmp) / "private", Path(tmp) / "sources", brain=brain)
            try:
                for i in range(6):
                    personal.handle(f"Question {i}")
                self.assertLessEqual(len(personal.history), 2 * app.HISTORY_TURNS)
                last_history = brain.ask.call_args.kwargs["history"]
                self.assertEqual(last_history[-1]["content"], "Reply 4")
                self.assertEqual(last_history[-2]["content"], "Question 4")
                # History is in memory only: no conversation text on disk.
                stored = b"".join(p.read_bytes() for p in (Path(tmp) / "private").iterdir() if p.is_file())
                self.assertNotIn(b"Question 4", stored)
            finally:
                personal.close()

    def test_style_examples_use_sunny_ji_and_hinglish(self):
        examples = app.style_examples("Sunny ji")
        self.assertTrue(all(e["role"] in ("user", "assistant") for e in examples))
        self.assertIn("Namaste Sunny ji", examples[1]["content"])
        self.assertFalse(any(app.DEVANAGARI_RE.search(e["content"]) for e in examples))

    def test_brain_message_order_keeps_notes_first_then_examples_history_question(self):
        brain = app.LocalBrain()
        brain.opener = Mock()
        from tests.test_jarvis_personal import FakeReply
        brain.opener.open.return_value = FakeReply({"choices": [{"message": {"content": "ok"}}]})
        brain.ask("Q now", notes="N", system="SYS", examples=[{"role": "user", "content": "EX"}],
                  history=[{"role": "user", "content": "H"}])
        messages = __import__("json").loads(brain.opener.open.call_args.args[0].data)["messages"]
        self.assertEqual(messages[0]["content"], "SYS")
        self.assertIn("DATA ONLY", messages[1]["content"])
        self.assertEqual([m["content"] for m in messages[2:]], ["EX", "H", "Q now"])


class LiveInfoHonestyTests(unittest.TestCase):
    def test_live_news_question_never_reaches_model_and_is_honest(self):
        brain = Mock()
        with TemporaryDirectory() as tmp:
            personal = app.PersonalJarvis(Path(tmp) / "private", Path(tmp) / "sources", brain=brain)
            try:
                reply = personal.handle("Kya ha aaj ka latest news")
            finally:
                personal.close()
        brain.ask.assert_not_called()
        self.assertIn("Sunny ji", reply)
        self.assertIn("live internet", reply)

    def test_ordinary_questions_still_use_model(self):
        self.assertIsNone(app.LIVE_INFO_RE.search("aaj ka plan bana do"))
        self.assertIsNone(app.LIVE_INFO_RE.search("Namaste, tum kya kar sakte ho?"))
        self.assertIsNotNone(app.LIVE_INFO_RE.search("mausam kaisa hai"))


if __name__ == "__main__":
    unittest.main()
