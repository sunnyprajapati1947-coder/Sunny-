"""SQLite access for JARVIS.

One file, WAL mode, migrations applied on open. Every helper is safe to call
from a request thread; a process-wide lock serialises writes so the standard
library's http server can stay multi-threaded.
"""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterable

MIGRATIONS = [
    # v1 — core tables
    """
    CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL DEFAULT 'fact',
        text TEXT NOT NULL,
        subject TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        source TEXT DEFAULT 'user',
        confidence REAL DEFAULT 0.8,
        created REAL NOT NULL,
        updated REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);
    CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New chat',
        created REAL NOT NULL,
        updated REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        meta TEXT DEFAULT '',
        created REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        goal TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'PENDING',
        steps TEXT NOT NULL DEFAULT '[]',
        cursor INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 2,
        result TEXT DEFAULT '',
        error TEXT DEFAULT '',
        depends_on TEXT DEFAULT '',
        created REAL NOT NULL,
        updated REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        tool TEXT NOT NULL,
        arguments TEXT NOT NULL,
        arg_hash TEXT NOT NULL,
        risk TEXT NOT NULL DEFAULT 'medium',
        reason TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'PENDING',
        created REAL NOT NULL,
        expires REAL NOT NULL,
        decided REAL
    );
    CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts REAL NOT NULL,
        event TEXT NOT NULL,
        actor TEXT DEFAULT 'jarvis',
        detail TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);
    """,
    # v2 — full text search over memory
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        text, tags, subject, content='memories', content_rowid='id'
    );
    """,
    # v3 — imported skill library (GitHub packs) + native skills
    """
    CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        pack TEXT NOT NULL DEFAULT 'jarvis',
        type TEXT NOT NULL DEFAULT 'skill',
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        keywords TEXT DEFAULT '',
        path TEXT DEFAULT '',
        body BLOB,
        bytes INTEGER DEFAULT 0,
        risk TEXT DEFAULT 'low',
        builtin INTEGER DEFAULT 0,
        synced REAL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_skills_pack ON skills(pack);
    CREATE INDEX IF NOT EXISTS idx_skills_type ON skills(type);
    CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
        id UNINDEXED, title, description, keywords
    );
    """,
]

_lock = threading.RLock()


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._fts = False
        self._skill_fts = False
        self._migrate()

    # ------------------------------------------------------------ plumbing

    def connect(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(str(self.path), timeout=15, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("PRAGMA synchronous=NORMAL")
                conn.execute("PRAGMA foreign_keys=ON")
            except sqlite3.DatabaseError:
                pass
            self._local.conn = conn
        return conn

    def _migrate(self) -> None:
        with _lock:
            conn = self.connect()
            conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
            row = conn.execute("SELECT value FROM meta WHERE key='schema'").fetchone()
            current = int(row["value"]) if row else 0
            for index, script in enumerate(MIGRATIONS, start=1):
                if index <= current:
                    continue
                try:
                    conn.executescript(script)
                except sqlite3.DatabaseError:
                    if index in (2, 3):     # FTS5 may be missing on tiny builds
                        self._fts = False
                    else:
                        raise
                conn.execute(
                    "INSERT INTO meta(key, value) VALUES('schema', ?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (str(index),),
                )
                conn.commit()
            try:
                self._fts = bool(conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'"
                ).fetchone())
                self._skill_fts = bool(conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='skills_fts'"
                ).fetchone())
            except sqlite3.DatabaseError:
                self._fts = False
                self._skill_fts = False

    @property
    def has_fts(self) -> bool:
        return self._fts

    @property
    def has_skill_fts(self) -> bool:
        return self._skill_fts

    # --------------------------------------------------------------- helpers

    def execute(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
        with _lock:
            conn = self.connect()
            cursor = conn.execute(sql, tuple(params))
            conn.commit()
            return cursor

    def query(self, sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
        conn = self.connect()
        return list(conn.execute(sql, tuple(params)))

    def one(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
        conn = self.connect()
        return conn.execute(sql, tuple(params)).fetchone()

    def audit(self, event: str, detail: Any = "", actor: str = "jarvis") -> None:
        import json
        import time

        text = detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False, default=str)
        self.execute(
            "INSERT INTO audit(ts, event, actor, detail) VALUES(?,?,?,?)",
            (time.time(), event, actor, text[:4000]),
        )

    def close(self) -> None:
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.close()
            except sqlite3.DatabaseError:
                pass
            self._local.conn = None


def open_database(path: Path) -> Database:
    """Open, and recover from a corrupt file by quarantining it."""
    try:
        return Database(path)
    except sqlite3.DatabaseError:
        stamp = int(__import__("time").time())
        broken = path.with_suffix(path.suffix + f".corrupt-{stamp}")
        try:
            path.rename(broken)
        except OSError:
            pass
        return Database(path)
