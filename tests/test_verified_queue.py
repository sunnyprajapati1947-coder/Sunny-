from pathlib import Path
from tempfile import TemporaryDirectory

from tasks.task_state import TaskState
from tasks.task_queue import NovaTaskQueue
from tasks.verified_queue import NovaVerifiedQueue


with TemporaryDirectory() as tmp:
    state = TaskState(Path(tmp) / "state.json")
    queue = NovaTaskQueue(state)
    verified = NovaVerifiedQueue(queue)

    a = queue.enqueue("Task A")
    b = queue.enqueue("Task B")

    attempts = {}

    def executor(task):
        attempts[task.task_id] = attempts.get(task.task_id, 0) + 1

        if task.task_id == a.task_id and attempts[task.task_id] == 1:
            return {
                "success": False,
                "error": "temporary failure",
            }

        return {
            "success": True,
            "result": task.description,
        }

    def repair_args(args, verification):
        return args

    # Repair must not blindly retry when arguments are unchanged.
    # Therefore use a stateful executor repair signal instead.
    attempts.clear()

    def executor2(task):
        attempts[task.task_id] = attempts.get(task.task_id, 0) + 1

        if task.task_id == a.task_id and attempts[task.task_id] == 1:
            return {
                "success": False,
                "error": "temporary failure",
            }

        return {
            "success": True,
            "result": task.description,
        }

    # Repair callback changes arguments so the bounded repair runner
    # is allowed to perform the second attempt.
    def repair_fn(args, verification):
        args["retry"] = True
        return args

    verified.run_next(executor2, repair_fn)

    assert state.tasks[a.task_id].status == "COMPLETED"
    assert state.tasks[b.task_id].status == "COMPLETED"

print("NOVA VERIFIED AUTO-NEXT QUEUE: PASS")
