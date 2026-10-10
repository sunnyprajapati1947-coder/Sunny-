"""Owner-typed local tasks and reminders for personal Jarvis.

Private SQLite file in the Jarvis state directory. No Android API, no network,
and no model-issued writes: only the owner's typed /task commands change it.
Reminders are shown when you ask (/plan, /tasks, or at startup); this starter
does not run a background alarm.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import sqlite3

from security.policy import redact_secrets

MAX_TITLE = 200
DUE_FORMATS = ("%Y-%m-%d %H:%M", "%Y-%m-%d")


def parse_due(value: str) -> str | None:
    """Return normalized local 'YYYY-MM-DD[ HH:MM]' or raise ValueError."""
    value = " ".join(value.split())
    if not value:
        return None
    for fmt in DUE_FORMATS:
        try:
            parsed = datetime.strptime(value, fmt)
        except ValueError:
            continue
        return parsed.strftime(fmt)
    raise ValueError("Due date must be YYYY-MM-DD or YYYY-MM-DD HH:MM (phone local time).")


class Tasks:
    def __init__(self, home: Path):
        home.mkdir(parents=True, mode=0o700, exist_ok=True)
        self.path = home / "tasks.sqlite3"
        if self.path.is_symlink():
            raise ValueError("Tasks database cannot be a symlink.")
        self.db = sqlite3.connect(self.path)
        self.path.chmod(0o600)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS tasks ("
            "id INTEGER PRIMARY KEY, created TEXT NOT NULL, title TEXT NOT NULL, "
            "due TEXT, done INTEGER NOT NULL DEFAULT 0)"
        )
        self.db.commit()

    def add(self, text: str) -> dict:
        """Accepts 'TITLE' or 'TITLE | DUE'. Titles are checked for secrets like notes are."""
        title, _, due_text = text.partition("|")
        title = " ".join(title.split())
        if not 1 <= len(title) <= MAX_TITLE:
            raise ValueError(f"Task title must be 1–{MAX_TITLE} characters.")
        if redact_secrets(title) != title:
            raise ValueError("Tasks are not a credential vault; do not save passwords/API keys.")
        due = parse_due(due_text)
        created = datetime.now().isoformat(timespec="seconds")
        cursor = self.db.execute(
            "INSERT INTO tasks(created, title, due, done) VALUES(?,?,?,0)", (created, title, due)
        )
        self.db.commit()
        return {"success": True, "task_id": cursor.lastrowid, "title": title, "due": due}

    def list_open(self) -> dict:
        rows = self.db.execute(
            "SELECT id, title, due FROM tasks WHERE done = 0 "
            "ORDER BY (due IS NULL), due, id LIMIT 50"
        ).fetchall()
        return {"success": True, "tasks": [{"id": i, "title": t, "due": d} for i, t, d in rows]}

    def mark_done(self, task_id_text: str) -> dict:
        if not task_id_text.strip().isdigit():
            raise ValueError("Use /task done TASK_ID (number from /tasks).")
        cursor = self.db.execute("UPDATE tasks SET done = 1 WHERE id = ? AND done = 0", (int(task_id_text),))
        self.db.commit()
        if cursor.rowcount == 0:
            return {"success": False, "error": "No open task with that ID."}
        return {"success": True, "done_task_id": int(task_id_text)}

    def plan(self, now: datetime | None = None) -> dict:
        """Overdue and today's tasks plus undated open tasks."""
        now = now or datetime.now()
        today = now.strftime("%Y-%m-%d")
        overdue, due_today, undated = [], [], []
        for item in self.list_open()["tasks"]:
            due = item["due"]
            if due is None:
                undated.append(item)
            elif due[:10] < today:
                overdue.append(item)
            elif due[:10] == today:
                due_today.append(item)
        return {"success": True, "date": today, "overdue": overdue, "today": due_today, "undated": undated}

    def context(self, limit: int = 5, max_chars: int = 300) -> str:
        """Short open-task summary for the model. It is owner data, never instructions."""
        lines = []
        for item in self.list_open()["tasks"][:limit]:
            due = f" (due {item['due']})" if item["due"] else ""
            lines.append(f"- {item['title']}{due}")
        return "\n".join(lines)[:max_chars]

    def close(self) -> None:
        self.db.close()
