import tempfile
import unittest
from pathlib import Path

from nova.memory import Memory


class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.mem = Memory(self.tmp / "nova.db")

    def tearDown(self):
        self.mem.close()

    def test_prefs_roundtrip_case_insensitive_and_forget(self):
        self.mem.set_pref("Name", "Sunny")
        self.assertEqual(self.mem.get_pref("name"), "Sunny")
        self.assertTrue(self.mem.forget_pref("NAME"))
        self.assertIsNone(self.mem.get_pref("name"))

    def test_empty_key_rejected(self):
        with self.assertRaises(ValueError):
            self.mem.set_pref("  ", "x")

    def test_history_respects_char_budget_and_order(self):
        for i in range(10):
            self.mem.add_message("s", "user", f"message {i} " + "x" * 100)
        recent = self.mem.recent_messages("s", char_budget=350)
        self.assertTrue(len(recent) >= 1)
        self.assertIn("message 9", recent[-1]["content"])
        self.assertEqual([m["content"].split()[1] for m in recent], sorted(m["content"].split()[1] for m in recent))
        self.assertEqual(self.mem.recent_messages("other", 1000), [])

    def test_history_is_redacted(self):
        fake_key = "sk-" + "Abc123Def456Ghi789Jkl0"  # assembled at runtime; not a real key
        self.mem.add_message("s", "user", "my key is " + fake_key)
        self.assertNotIn(fake_key, self.mem.recent_messages("s", 1000)[0]["content"])

    def test_tasks_steps_and_checkpoints(self):
        self.mem.create_task("t1", "goal", ["a", "b", "c"])
        self.assertEqual([s["status"] for s in self.mem.list_steps("t1")], ["pending"] * 3)
        self.mem.update_step("t1", 0, status="completed", verified=1, result="ok")
        self.mem.add_checkpoint("t1", 0, {"done": 1})
        cp = self.mem.last_checkpoint("t1")
        self.assertEqual(cp["step_idx"], 0)
        self.assertEqual(cp["state"], {"done": 1})
        self.assertEqual(self.mem.list_tasks(("queued",))[0]["id"], "t1")
        self.mem.set_task_status("t1", "interrupted", "boom")
        self.assertEqual(self.mem.list_tasks(("interrupted",))[0]["error"], "boom")

    def test_integrity_and_persistence_across_reopen(self):
        self.mem.set_pref("persist", "yes")
        self.mem.close()
        again = Memory(self.tmp / "nova.db")
        self.assertEqual(again.get_pref("persist"), "yes")
        self.assertTrue(again.integrity_ok()[0])
        self.mem = again


if __name__ == "__main__":
    unittest.main()
