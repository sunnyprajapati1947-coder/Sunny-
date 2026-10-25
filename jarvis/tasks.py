"""Persistent task engine.

Lifecycle:  PENDING -> RUNNING -> DONE | FAILED | BLOCKED | CANCELLED
                     ↕
                   PAUSED  (manual, or recovered after a crash)

Guarantees that are actually implemented:
  * every state change is written to sqlite before it is reported
  * a task that was RUNNING when the process died is swept to PAUSED with a
    reason on the next boot, so it is visible instead of stuck forever
  * retries are bounded per task (max_retries)
  * dependencies are honoured: a task with an unfinished dependency stays BLOCKED
  * cancel/pause are cooperative: the worker checks between steps
"""

from __future__ import annotations

import json
import secrets
import time
from dataclasses import dataclass, field
from typing import Callable

from .db import Database

STATUSES = ("PENDING", "RUNNING", "PAUSED", "DONE", "FAILED", "CANCELLED", "BLOCKED")
TERMINAL = {"DONE", "FAILED", "CANCELLED"}


@dataclass
class Step:
    title: str
    status: str = "pending"      # pending | running | done | failed | skipped
    detail: str = ""
    started: float = 0.0
    ended: float = 0.0

    def to_dict(self) -> dict:
        return {
            "title": self.title, "status": self.status, "detail": self.detail,
            "started": self.started, "ended": self.ended,
        }


@dataclass
class Task:
    id: str
    title: str
    goal: str = ""
    status: str = "PENDING"
    steps: list = field(default_factory=list)
    cursor: int = 0
    attempts: int = 0
    max_retries: int = 2
    result: str = ""
    error: str = ""
    depends_on: str = ""
    created: float = 0.0
    updated: float = 0.0

    @property
    def progress(self) -> dict:
        done = sum(1 for step in self.steps if step.status == "done")
        return {"done": done, "total": len(self.steps),
                "percent": int(100 * done / len(self.steps)) if self.steps else 0}

    def to_dict(self) -> dict:
        return {
            "id": self.id, "title": self.title, "goal": self.goal, "status": self.status,
            "steps": [step.to_dict() for step in self.steps], "cursor": self.cursor,
            "attempts": self.attempts, "max_retries": self.max_retries,
            "result": self.result, "error": self.error, "depends_on": self.depends_on,
            "created": self.created, "updated": self.updated, "progress": self.progress,
        }


class TaskError(ValueError):
    pass


def _row_to_task(row) -> Task:
    try:
        raw_steps = json.loads(row["steps"] or "[]")
    except Exception:
        raw_steps = []
    steps = []
    for item in raw_steps:
        if isinstance(item, dict):
            steps.append(Step(
                title=str(item.get("title", ""))[:200],
                status=str(item.get("status", "pending")),
                detail=str(item.get("detail", ""))[:600],
                started=float(item.get("started", 0) or 0),
                ended=float(item.get("ended", 0) or 0),
            ))
        elif isinstance(item, str):
            steps.append(Step(title=item[:200]))
    return Task(
        id=row["id"], title=row["title"], goal=row["goal"] or "", status=row["status"],
        steps=steps, cursor=int(row["cursor"] or 0), attempts=int(row["attempts"] or 0),
        max_retries=int(row["max_retries"] or 0), result=row["result"] or "",
        error=row["error"] or "", depends_on=row["depends_on"] or "",
        created=float(row["created"] or 0), updated=float(row["updated"] or 0),
    )


class TaskStore:
    def __init__(self, db: Database):
        self.db = db

    # -------------------------------------------------------------- create

    def create(self, title: str, goal: str = "", steps: list | None = None,
               depends_on: str = "", max_retries: int = 2) -> Task:
        name = " ".join(str(title or "").split()).strip()
        if not name:
            raise TaskError("title is required")
        titles = [str(step).strip()[:200] for step in (steps or []) if str(step).strip()][:20]
        task = Task(
            id="tsk_" + secrets.token_hex(6),
            title=name[:160],
            goal=str(goal)[:2000],
            steps=[Step(title=t) for t in titles],
            depends_on=str(depends_on or "")[:40],
            max_retries=max(0, min(int(max_retries), 5)),
            created=time.time(),
            updated=time.time(),
        )
        self._persist(task)
        self.db.audit("task_created", {"id": task.id, "title": task.title, "steps": len(task.steps)})
        return task

    def _persist(self, task: Task) -> None:
        task.updated = time.time()
        self.db.execute(
            "INSERT INTO tasks(id, title, goal, status, steps, cursor, attempts, max_retries, "
            "result, error, depends_on, created, updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET title=excluded.title, goal=excluded.goal, "
            "status=excluded.status, steps=excluded.steps, cursor=excluded.cursor, "
            "attempts=excluded.attempts, result=excluded.result, error=excluded.error, "
            "depends_on=excluded.depends_on, updated=excluded.updated",
            (
                task.id, task.title, task.goal, task.status,
                json.dumps([step.to_dict() for step in task.steps], ensure_ascii=False),
                task.cursor, task.attempts, task.max_retries, task.result, task.error,
                task.depends_on, task.created, task.updated,
            ),
        )

    # --------------------------------------------------------------- read

    def get(self, task_id: str) -> Task | None:
        row = self.db.one("SELECT * FROM tasks WHERE id=?", (task_id,))
        return _row_to_task(row) if row else None

    def list(self, status: str | None = None, limit: int = 100) -> list[Task]:
        if status:
            rows = self.db.query(
                "SELECT * FROM tasks WHERE status=? ORDER BY created DESC LIMIT ?", (status, limit))
        else:
            rows = self.db.query("SELECT * FROM tasks ORDER BY created DESC LIMIT ?", (limit,))
        return [_row_to_task(row) for row in rows]

    def stats(self) -> dict:
        rows = self.db.query("SELECT status, COUNT(*) AS n FROM tasks GROUP BY status")
        return {row["status"]: int(row["n"]) for row in rows}

    # ------------------------------------------------------------ controls

    def pause(self, task_id: str) -> Task:
        task = self._require(task_id)
        if task.status in TERMINAL:
            raise TaskError(f"task is already {task.status.lower()}")
        task.status = "PAUSED"
        self._persist(task)
        self.db.audit("task_paused", {"id": task.id})
        return task

    def resume(self, task_id: str) -> Task:
        task = self._require(task_id)
        if task.status == "RUNNING":
            raise TaskError("task is running")
        if task.status == "DONE":
            raise TaskError("task is already done")
        task.status = "PENDING"
        task.error = ""
        self._persist(task)
        self.db.audit("task_resumed", {"id": task.id})
        return task

    def cancel(self, task_id: str) -> Task:
        task = self._require(task_id)
        if task.status == "DONE":
            raise TaskError("cannot cancel a finished task")
        task.status = "CANCELLED"
        self._persist(task)
        self.db.audit("task_cancelled", {"id": task.id})
        return task

    def requeue(self, task_id: str) -> Task:
        task = self._require(task_id)
        if task.status not in ("FAILED", "CANCELLED", "BLOCKED"):
            raise TaskError(f"task is {task.status.lower()}; only failed/cancelled/blocked can be requeued")
        task.status = "PENDING"
        task.error = ""
        task.attempts = 0
        for step in task.steps:
            if step.status in ("failed", "running"):
                step.status = "pending"
        self._persist(task)
        self.db.audit("task_requeued", {"id": task.id})
        return task

    def sweep(self) -> list[str]:
        """Recover tasks that were RUNNING when the previous process died."""
        rows = self.db.query("SELECT id FROM tasks WHERE status='RUNNING'")
        swept = []
        for row in rows:
            task = self.get(row["id"])
            if not task:
                continue
            for step in task.steps:
                if step.status == "running":
                    step.status = "pending"
            task.status = "PAUSED"
            task.error = "Interrupted: process restarted while this task was running."
            self._persist(task)
            self.db.audit("task_recovered", {"id": task.id})
            swept.append(task.id)
        return swept

    # --------------------------------------------------------------- run

    def run(self, task_id: str,
            executor: Callable[[Task, Step], dict | None],
            stop_check: Callable[[], bool] | None = None) -> Task:
        """Execute steps in order. `executor(task, step)` returns
        {"ok": bool, "detail": str, "result": str} or raises to fail the step."""
        task = self._require(task_id)
        if task.depends_on:
            dependency = self.get(task.depends_on)
            if dependency and dependency.status != "DONE":
                task.status = "BLOCKED"
                task.error = f"waiting for {dependency.id} ({dependency.status})"
                self._persist(task)
                return task
        if task.status in TERMINAL:
            # Re-running a finished task silently would inflate `attempts`.
            # The caller must requeue() it first.
            return task

        task.status = "RUNNING"
        task.attempts += 1
        self._persist(task)

        if not task.steps:
            task.steps = [Step(title=task.title)]

        while task.cursor < len(task.steps):
            if stop_check and stop_check():
                task.status = "PAUSED"
                self._persist(task)
                return task
            current = self._require(task_id)
            if current.status in ("PAUSED", "CANCELLED"):
                return current
            step = task.steps[task.cursor]
            if step.status == "done":
                task.cursor += 1
                continue
            step.status = "running"
            step.started = time.time()
            self._persist(task)
            try:
                outcome = executor(task, step) or {"ok": True}
            except Exception as exc:
                outcome = {"ok": False, "detail": f"{type(exc).__name__}: {exc}"[:400]}
            step.ended = time.time()
            if outcome.get("ok"):
                step.status = "done"
                step.detail = str(outcome.get("detail") or outcome.get("result") or "")[:600]
                if outcome.get("result"):
                    task.result = str(outcome["result"])[:4000]
                task.cursor += 1
                self._persist(task)
                continue
            step.status = "failed"
            step.detail = str(outcome.get("detail") or "failed")[:600]
            if task.attempts <= task.max_retries:
                step.status = "pending"
                task.status = "PENDING"
                task.error = step.detail
                self._persist(task)
                self.db.audit("task_retry", {"id": task.id, "attempt": task.attempts})
                return task
            task.status = "FAILED"
            task.error = step.detail
            self._persist(task)
            self.db.audit("task_failed", {"id": task.id, "error": task.error[:200]})
            return task

        task.status = "DONE"
        task.error = ""
        self._persist(task)
        self.db.audit("task_done", {"id": task.id, "steps": len(task.steps)})
        return task

    def _require(self, task_id: str) -> Task:
        task = self.get(task_id)
        if not task:
            raise TaskError(f"unknown task: {task_id}")
        return task
