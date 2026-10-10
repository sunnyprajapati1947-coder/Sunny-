from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from tasks.safe_task_runner import plan_safe_task, execute_safe_task


def test_planner_only_allows_fixed_read_only_status_tasks():
    assert plan_safe_task("check battery status") == {
        "tool": "phone_battery", "arguments": {}
    }
    assert plan_safe_task("check youtube status") == {
        "tool": "youtube_status", "arguments": {}
    }
    assert plan_safe_task("delete all files") is None
    assert plan_safe_task("run rm -rf something") is None
    assert plan_safe_task("send WhatsApp to my friend") is None


def test_executor_uses_registry_and_verifies_success():
    class FakeRegistry:
        def __init__(self):
            self.calls = []

        def execute(self, name, args):
            self.calls.append((name, args))
            return {"success": True, "tool": name,
                    "result": {"success": True, "data": {"percentage": 80}}}

    registry = FakeRegistry()
    task = SimpleNamespace(description="check battery status")
    result = execute_safe_task(task, {}, registry)
    assert result["success"] is True
    assert registry.calls == [("phone_battery", {})]


def test_executor_refuses_unsupported_task_without_calling_tools():
    class FakeRegistry:
        def __init__(self):
            self.calls = []

        def execute(self, name, args):
            self.calls.append((name, args))
            return {"success": True}

    registry = FakeRegistry()
    task = SimpleNamespace(description="open browser and run arbitrary command")
    result = execute_safe_task(task, {}, registry)
    assert result["success"] is False
    assert registry.calls == []


if __name__ == "__main__":
    test_planner_only_allows_fixed_read_only_status_tasks()
    test_executor_uses_registry_and_verifies_success()
    test_executor_refuses_unsupported_task_without_calling_tools()
    print("NOVA SAFE TASK RUNNER: PASS")
