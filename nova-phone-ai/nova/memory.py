"""Persistent memory and task state in one SQLite file (stdlib only).

Tables: prefs (key/value memory), projects, messages (chat history), tool_log (audit trail),
tasks / task_steps (task progress) and checkpoints (resume points after each verified step).
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from nova.util import now_ts, redact, truncate

SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS prefs (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY, path TEXT, notes TEXT, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session TEXT NOT NULL, role TEXT NOT NULL,
    content TEXT NOT NULL, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS tool_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, tool TEXT NOT NULL, args TEXT,
    risk TEXT, ok INTEGER NOT NULL, summary TEXT, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, goal TEXT NOT NULL, status TEXT NOT NULL, error TEXT,
    created_at REAL NOT NULL, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS task_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, idx INTEGER NOT NULL,
    description TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    result TEXT, verified INTEGER NOT NULL DEFAULT 0, updated_at REAL NOT NULL,
    UNIQUE(task_id, idx));
CREATE TABLE IF NOT EXISTS checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, step_idx INTEGER NOT NULL,
    state TEXT NOT NULL, created_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session, id);
"""


class Memory:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.path), timeout=30)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)
        self.conn.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def integrity_ok(self) -> tuple[bool, str]:
        row = self.conn.execute("PRAGMA integrity_check").fetchone()
        result = row[0] if row else "unknown"
        return result == "ok", result

    # ----- preferences / memory -------------------------------------------------
    def set_pref(self, key: str, value: str) -> None:
        key = key.strip().lower()
        if not key:
            raise ValueError("memory key cannot be empty")
        self.conn.execute(
            "INSERT INTO prefs(key, value, updated_at) VALUES(?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, truncate(value, 2000), now_ts()))
        self.conn.commit()

    def get_pref(self, key: str) -> str | None:
        row = self.conn.execute("SELECT value FROM prefs WHERE key=?", (key.strip().lower(),)).fetchone()
        return row["value"] if row else None

    def forget_pref(self, key: str) -> bool:
        cur = self.conn.execute("DELETE FROM prefs WHERE key=?", (key.strip().lower(),))
        self.conn.commit()
        return cur.rowcount > 0

    def all_prefs(self) -> dict:
        return {r["key"]: r["value"] for r in self.conn.execute("SELECT key, value FROM prefs ORDER BY key")}

    def upsert_project(self, name: str, path: str = "", notes: str = "") -> None:
        self.conn.execute(
            "INSERT INTO projects(name, path, notes, updated_at) VALUES(?,?,?,?) "
            "ON CONFLICT(name) DO UPDATE SET path=excluded.path, notes=excluded.notes, updated_at=excluded.updated_at",
            (name.strip(), path, truncate(notes, 2000), now_ts()))
        self.conn.commit()

    def list_projects(self) -> list[dict]:
        return [dict(r) for r in self.conn.execute("SELECT name, path, notes FROM projects ORDER BY name")]

    # ----- chat history ---------------------------------------------------------
    def add_message(self, session: str, role: str, content: str) -> None:
        self.conn.execute("INSERT INTO messages(session, role, content, created_at) VALUES(?,?,?,?)",
                          (session, role, redact(truncate(content, 4000)), now_ts()))
        self.conn.commit()

    def recent_messages(self, session: str, char_budget: int) -> list[dict]:
        """Newest messages that fit in `char_budget`, returned oldest-first."""
        rows = self.conn.execute(
            "SELECT role, content FROM messages WHERE session=? ORDER BY id DESC LIMIT 200", (session,)).fetchall()
        picked: list[dict] = []
        used = 0
        for row in rows:
            size = len(row["content"])
            if used + size > char_budget:
                break
            picked.append({"role": row["role"], "content": row["content"]})
            used += size
        return list(reversed(picked))

    # ----- audit ----------------------------------------------------------------
    def log_tool(self, tool: str, args: dict, risk: str, ok: bool, summary: str, task_id: str | None = None) -> None:
        self.conn.execute(
            "INSERT INTO tool_log(task_id, tool, args, risk, ok, summary, created_at) VALUES(?,?,?,?,?,?,?)",
            (task_id, tool, redact(json.dumps(args, ensure_ascii=False))[:1000], risk, int(ok),
             redact(truncate(summary, 500)), now_ts()))
        self.conn.commit()

    def recent_tool_log(self, limit: int = 20) -> list[dict]:
        return [dict(r) for r in self.conn.execute(
            "SELECT tool, risk, ok, summary, created_at FROM tool_log ORDER BY id DESC LIMIT ?", (limit,))]

    # ----- tasks ----------------------------------------------------------------
    def create_task(self, task_id: str, goal: str, steps: list[str]) -> None:
        ts = now_ts()
        with self.conn:
            self.conn.execute("INSERT INTO tasks(id, goal, status, error, created_at, updated_at) "
                              "VALUES(?,?,?,?,?,?)", (task_id, goal, "queued", "", ts, ts))
            for idx, desc in enumerate(steps):
                self.conn.execute("INSERT INTO task_steps(task_id, idx, description, status, updated_at) "
                                  "VALUES(?,?,?,?,?)", (task_id, idx, desc, "pending", ts))

    def set_task_status(self, task_id: str, status: str, error: str = "") -> None:
        self.conn.execute("UPDATE tasks SET status=?, error=?, updated_at=? WHERE id=?",
                          (status, redact(truncate(error, 1000)), now_ts(), task_id))
        self.conn.commit()

    def get_task(self, task_id: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        return dict(row) if row else None

    def list_tasks(self, statuses: tuple[str, ...] | None = None) -> list[dict]:
        if statuses:
            marks = ",".join("?" * len(statuses))
            rows = self.conn.execute(f"SELECT * FROM tasks WHERE status IN ({marks}) ORDER BY created_at",
                                     statuses).fetchall()
        else:
            rows = self.conn.execute("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50").fetchall()
        return [dict(r) for r in rows]

    def list_steps(self, task_id: str) -> list[dict]:
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM task_steps WHERE task_id=? ORDER BY idx", (task_id,))]

    def update_step(self, task_id: str, idx: int, **fields) -> None:
        allowed = {"status", "attempts", "result", "verified"}
        sets = {k: v for k, v in fields.items() if k in allowed}
        if not sets:
            return
        sets["updated_at"] = now_ts()
        cols = ", ".join(f"{k}=?" for k in sets)
        self.conn.execute(f"UPDATE task_steps SET {cols} WHERE task_id=? AND idx=?",
                          (*sets.values(), task_id, idx))
        self.conn.commit()

    def add_checkpoint(self, task_id: str, step_idx: int, state: dict) -> None:
        self.conn.execute("INSERT INTO checkpoints(task_id, step_idx, state, created_at) VALUES(?,?,?,?)",
                          (task_id, step_idx, redact(json.dumps(state, ensure_ascii=False))[:20000], now_ts()))
        self.conn.commit()

    def last_checkpoint(self, task_id: str) -> dict | None:
        row = self.conn.execute("SELECT step_idx, state, created_at FROM checkpoints WHERE task_id=? "
                                "ORDER BY id DESC LIMIT 1", (task_id,)).fetchone()
        if not row:
            return None
        return {"step_idx": row["step_idx"], "state": json.loads(row["state"]), "created_at": row["created_at"]}
