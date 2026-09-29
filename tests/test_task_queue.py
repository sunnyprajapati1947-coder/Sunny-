from pathlib import Path
from tempfile import TemporaryDirectory

from tasks.task_state import TaskState
from tasks.task_queue import NovaTaskQueue


with TemporaryDirectory() as tmp:
    state = TaskState(Path(tmp) / "state.json")
    queue = NovaTaskQueue(state)

    a = queue.enqueue("Task A")
    b = queue.enqueue("Task B")

    runs = []

    def executor(task):
        runs.append(task.description)
        return {
            "success": True,
            "result": f"{task.description} completed",
        }

    queue.run_next(executor)

    assert runs == ["Task A", "Task B"]
    assert state.tasks[a.task_id].status == "COMPLETED"
    assert state.tasks[b.task_id].status == "COMPLETED"

print("NOVA AUTO-NEXT QUEUE: PASS")
