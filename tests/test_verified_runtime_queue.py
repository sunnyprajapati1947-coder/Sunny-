from pathlib import Path
from tempfile import TemporaryDirectory

from tasks.task_state import TaskState
from tasks.task_queue import NovaTaskQueue
from tasks.verified_queue import NovaVerifiedQueue


with TemporaryDirectory() as tmp:
    state = TaskState(Path(tmp) / "state.json")
    queue = NovaTaskQueue(state)
    verified = NovaVerifiedQueue(queue)

    task = queue.enqueue("runtime tool execution")

    calls = []

    def executor(task, args):
        calls.append(dict(args))
        if len(calls) == 1:
            return {"success": False, "error": "temporary failure"}
        return {"success": True, "result": "tool completed"}

    def repair_args(args, verification):
        args["retry"] = True
        return args

    report = verified.run_task(
        task,
        executor,
        arguments={"tool": "github_agent_status"},
        repair_args=repair_args,
    )

    assert report.success is True
    assert len(calls) == 2
    assert calls[1]["retry"] is True
    assert state.tasks[task.task_id].status == "COMPLETED"

print("NOVA VERIFIED RUNTIME QUEUE: PASS")
