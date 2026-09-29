from __future__ import annotations
from typing import Any, Callable

from tasks.task_queue import NovaTaskQueue
from verifier.verify import NovaVerifier, Verification
from repair.repair import NovaRepair


class NovaVerifiedQueue:
    """Existing task queue + verification + bounded repair."""

    def __init__(
        self,
        queue: NovaTaskQueue | None = None,
        verifier: NovaVerifier | None = None,
        repair: NovaRepair | None = None,
    ):
        self.queue = queue or NovaTaskQueue()
        self.verifier = verifier or NovaVerifier()
        self.repair = repair or NovaRepair(self.verifier, max_attempts=2)

    def run_task(
        self,
        task,
        executor: Callable[[Any, dict[str, Any]], Any],
        *,
        arguments: dict[str, Any] | None = None,
        repair_args: Callable[
            [dict[str, Any], Verification], dict[str, Any] | None
        ] | None = None,
    ):
        args = dict(arguments or {})

        self.queue.state.update(
            task.task_id,
            status="RUNNING",
            attempts=task.attempts + 1,
        )

        def operation(current_args):
            return executor(task, current_args)

        report = self.repair.run(
            operation,
            arguments=args,
            repair=repair_args,
        )

        checkpoint = {
            "verified": report.success,
            "attempts": report.attempts + 1,
            "verification": report.verification.reason,
            "arguments": dict(args),
        }

        if report.success:
            self.queue.state.complete(
                task.task_id,
                checkpoint=checkpoint,
            )
        else:
            self.queue.state.fail(
                task.task_id,
                report.verification.reason,
            )

        return report

    def run_next(
        self,
        executor: Callable[[Any, dict[str, Any]], Any],
        repair_args=None,
    ):
        task = self.queue.state.next_pending()
        if task is None:
            return None

        report = self.run_task(
            task,
            executor,
            repair_args=repair_args,
        )

        if report.success:
            return self.run_next(executor, repair_args)

        return task
