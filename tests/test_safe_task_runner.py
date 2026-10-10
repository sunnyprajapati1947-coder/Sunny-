import unittest
from types import SimpleNamespace

from tasks.safe_task_runner import plan_safe_task, execute_safe_task


class SafeTaskRunnerTest(unittest.TestCase):
    def test_planner_only_allows_fixed_read_only_status_tasks(self):
        self.assertEqual(plan_safe_task("check battery status"), {
            "tool": "phone_battery", "arguments": {}
        })
        self.assertEqual(plan_safe_task("check youtube status"), {
            "tool": "youtube_status", "arguments": {}
        })
        self.assertIsNone(plan_safe_task("delete all files"))
        self.assertIsNone(plan_safe_task("run rm -rf something"))
        self.assertIsNone(plan_safe_task("send WhatsApp to my friend"))

    def test_executor_uses_registry_and_verifies_success(self):
        class FakeRegistry:
            def __init__(self):
                self.calls = []

            def execute(self, name, args):
                self.calls.append((name, args))
                return {
                    "success": True,
                    "tool": name,
                    "result": {
                        "success": True,
                        "data": {"percentage": 80},
                    },
                }

        registry = FakeRegistry()
        task = SimpleNamespace(description="check battery status")
        result = execute_safe_task(task, {}, registry)
        self.assertTrue(result["success"])
        self.assertEqual(registry.calls, [("phone_battery", {})])

    def test_executor_refuses_unsupported_task_without_calling_tools(self):
        class FakeRegistry:
            def __init__(self):
                self.calls = []

            def execute(self, name, args):
                self.calls.append((name, args))
                return {"success": True}

        registry = FakeRegistry()
        task = SimpleNamespace(
            description="open browser and run arbitrary command"
        )
        result = execute_safe_task(task, {}, registry)
        self.assertFalse(result["success"])
        self.assertEqual(registry.calls, [])


if __name__ == "__main__":
    unittest.main()
