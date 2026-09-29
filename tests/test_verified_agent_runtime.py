from pathlib import Path
from tempfile import TemporaryDirectory

from core.tool_registry import NovaTool, NovaToolRegistry
from tasks.task_state import TaskState
from tasks.task_queue import NovaTaskQueue
from tasks.verified_queue import NovaVerifiedQueue
from core.github_agent_runtime import NovaGitHubToolBridge


with TemporaryDirectory() as tmp:
    state = TaskState(Path(tmp) / "state.json")
    queue = NovaTaskQueue(state)
    verified = NovaVerifiedQueue(queue)

    registry = NovaToolRegistry()

    registry.register(
        NovaTool(
            name="test_tool",
            category="test",
            description="safe test tool",
            run=lambda value: {
                "success": True,
                "result": value,
            },
        )
    )

    bridge = NovaGitHubToolBridge(
        registry,
        verified_queue=verified,
    )

    result = bridge.execute(
        "test_tool",
        {"value": "Nova runtime verified"},
    )

    assert result.data["success"] is True
    assert result.data["verified"] is True

    tasks = list(state.tasks.values())
    assert len(tasks) == 1
    assert tasks[0].status == "COMPLETED"

print("NOVA VERIFIED AGENT RUNTIME: PASS")
