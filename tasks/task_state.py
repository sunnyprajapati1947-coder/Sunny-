from __future__ import annotations
from dataclasses import asdict, dataclass, field
from pathlib import Path
import json
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
STATE_FILE = ROOT / "tasks" / "state.json"


@dataclass
class Task:
    task_id: str
    description: str
    status: str = "PENDING"
    current_step: int = 0
    completed_steps: list[str] = field(default_factory=list)
    attempts: int = 0
    checkpoint: dict = field(default_factory=dict)
    error: str = ""
    next_task_id: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


class TaskState:
    def __init__(self, path: Path = STATE_FILE):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.tasks: dict[str, Task] = {}
        self.load()

    def load(self):
        if not self.path.exists():
            return
        data = json.loads(self.path.read_text())
        self.tasks = {
            k: Task(**v) for k, v in data.items()
        }

    def save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(
                {k: asdict(v) for k, v in self.tasks.items()},
                indent=2,
            )
        )
        tmp.replace(self.path)

    def create(self, description: str) -> Task:
        task = Task(
            task_id=f"nova-{uuid.uuid4().hex[:10]}",
            description=description,
        )
        self.tasks[task.task_id] = task
        self.save()
        return task

    def update(self, task_id: str, **changes):
        task = self.tasks[task_id]
        for key, value in changes.items():
            setattr(task, key, value)
        task.updated_at = time.time()
        self.save()
        return task

    def next_pending(self) -> Task | None:
        pending = [
            t for t in self.tasks.values()
            if t.status == "PENDING"
        ]
        return min(pending, key=lambda t: t.created_at) if pending else None

    def complete(self, task_id: str, checkpoint: dict | None = None):
        return self.update(
            task_id,
            status="COMPLETED",
            checkpoint=checkpoint or {},
        )

    def fail(self, task_id: str, error: str):
        return self.update(
            task_id,
            status="FAILED",
            error=error,
        )

    def resume(self, task_id: str):
        return self.update(
            task_id,
            status="PENDING",
            error="",
        )
