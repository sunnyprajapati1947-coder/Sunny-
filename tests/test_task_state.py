from pathlib import Path
from tempfile import TemporaryDirectory

from tasks.task_state import TaskState

# Hermetic: use a throwaway state file so repeated runs never touch the real
# tasks/state.json and never depend on leftover data.
with TemporaryDirectory() as tmp:
    s = TaskState(Path(tmp) / "state.json")

    a = s.create("Task A")
    b = s.create("Task B")
    a.next_task_id = b.task_id
    s.save()

    s.update(
        a.task_id,
        status="RUNNING",
        current_step=1,
        completed_steps=["step-1"],
        checkpoint={"safe": True},
    )

    s.complete(a.task_id, {"verified": True})

    n = s.next_pending()

    assert n is not None
    assert n.task_id == b.task_id

    s.update(b.task_id, status="RUNNING")
    s.update(b.task_id, attempts=1)
    s.fail(b.task_id, "test failure")

    assert s.tasks[b.task_id].status == "FAILED"

    s.resume(b.task_id)
    assert s.tasks[b.task_id].status == "PENDING"

print("NOVA TASK STATE + RESUME: PASS")
