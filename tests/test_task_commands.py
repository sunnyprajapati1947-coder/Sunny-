from __future__ import annotations

import os
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

from tasks.jarvis_task_commands import handle_task_command


class JarvisTaskCommandsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="jarvis_tasks_")
        self.state = str(Path(self.tmp.name) / "tasks.json")
        self.env = {"NOVA_TASK_STATE_PATH": self.state}

    def tearDown(self):
        self.tmp.cleanup()

    def test_add_and_list_persist(self):
        with patch.dict(os.environ, self.env):
            added = handle_task_command("task add: make science revision notes", "Boss")
            self.assertIn("Task save kar diya", added)
            self.assertIn("automatic execution abhi enabled nahi hai", added)
            listed = handle_task_command("pending tasks", "Boss")
            self.assertIn("make science revision notes", listed)
            self.assertIn("PENDING", listed)

    def test_status_and_resume_failed_task(self):
        with patch.dict(os.environ, self.env):
            added = handle_task_command("task add: test a saved task", "Boss")
            task_id = added.split("ID ", 1)[1].split(".", 1)[0]
            from tasks.task_state import TaskState
            state = TaskState(path=Path(self.state))
            state.update(task_id, status="FAILED", error="test failure")
            status = handle_task_command(f"task status {task_id}", "Boss")
            self.assertIn("FAILED", status)
            resumed = handle_task_command(f"task resume {task_id}", "Boss")
            self.assertIn("PENDING", resumed)
            self.assertIn("verified task runner", resumed)

    def test_unrelated_text_is_not_consumed(self):
        with patch.dict(os.environ, self.env):
            self.assertIsNone(handle_task_command("hello Jarvis", "Boss"))


if __name__ == "__main__":
    unittest.main()
