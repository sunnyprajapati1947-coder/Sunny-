from __future__ import annotations

from typing import Callable, Any
from tasks.task_state import TaskState, Task


class NovaTaskQueue:
    """Runs authorized pending tasks sequentially."""

    def __init__(self, state: TaskState | None = None):
        self.state = state or TaskState()

    def enqueue(
        self,
        description: str,
        next_task_id: str | None = None,
    ) -> Task:
        task = self.state.create(description)

        if next_task_id:
            self.state.update(
                task.task_id,
                next_task_id=next_task_id,
            )

        return task

    def run_next(
        self,
        executor: Callable[[Task], Any],
    ) -> Task | None:

        task = self.state.next_pending()

        if task is None:
            return None

        self.state.update(
            task.task_id,
            status="RUNNING",
            attempts=task.attempts + 1,
        )

        try:
            result = executor(task)

            if isinstance(result, dict) and result.get("success") is True:
                self.state.complete(
                    task.task_id,
                    checkpoint=result,
                )

                # Automatically continue with the next authorized task.
                return self.run_next(executor)

            error = (
                result.get("error", "Task execution failed.")
                if isinstance(result, dict)
                else "Task execution failed."
            )

            self.state.fail(task.task_id, str(error))
            return task

        except Exception as exc:
            self.state.fail(
                task.task_id,
                f"{type(exc).__name__}: {exc}",
            )
            return task

    def pending(self) -> list[Task]:
        return [
            t for t in self.state.tasks.values()
            if t.status == "PENDING"
        ]
