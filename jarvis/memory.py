"""Long-term memory: what JARVIS is allowed to remember about you.

Design choices that matter:
  * kinds      — preference | project | decision | task | fact | note
  * confidence — user-said facts outrank model-inferred notes
  * no secrets — anything that looks like a credential is refused, not stored
  * untrusted  — web/tool output is stored as `note` with low confidence and a
                 source tag, so it can never masquerade as your own instruction
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field

from .db import Database
from .textnorm import match_terms

KINDS = ("preference", "project", "decision", "task", "fact", "note")

SECRET_PATTERNS = (
    r"AIza[0-9A-Za-z_\-]{20,}",
    r"sk-[A-Za-z0-9]{16,}",
    r"ghp_[A-Za-z0-9]{20,}",
    r"github_pat_[A-Za-z0-9_]{20,}",
    r"xox[baprs]-[A-Za-z0-9-]{10,}",
    r"\b\d{8,10}:[A-Za-z0-9_-]{30,}\b",
    r"(?i)(api[_-]?key|password|passwd|secret|token)\s*[:=]\s*\S{8,}",
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
)

MAX_TEXT = 1200


@dataclass
class Memory:
    id: int
    kind: str
    text: str
    subject: str = ""
    tags: list = field(default_factory=list)
    source: str = "user"
    confidence: float = 0.8
    created: float = 0.0
    updated: float = 0.0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "text": self.text,
            "subject": self.subject,
            "tags": list(self.tags),
            "source": self.source,
            "confidence": self.confidence,
            "created": self.created,
            "updated": self.updated,
        }


class MemoryStoreError(ValueError):
    pass


def looks_like_secret(text: str) -> bool:
    return any(re.search(pattern, text or "") for pattern in SECRET_PATTERNS)


def _row_to_memory(row) -> Memory:
    try:
        tags = json.loads(row["tags"] or "[]")
    except Exception:
        tags = []
    return Memory(
        id=row["id"],
        kind=row["kind"],
        text=row["text"],
        subject=row["subject"] or "",
        tags=tags if isinstance(tags, list) else [],
        source=row["source"] or "user",
        confidence=float(row["confidence"] or 0.8),
        created=float(row["created"] or 0),
        updated=float(row["updated"] or 0),
    )


class MemoryStore:
    def __init__(self, db: Database):
        self.db = db

    # ------------------------------------------------------------- writing

    def add(
        self,
        text: str,
        kind: str = "fact",
        subject: str = "",
        tags: list | None = None,
        source: str = "user",
        confidence: float | None = None,
    ) -> Memory:
        value = " ".join(str(text or "").split()).strip()
        if len(value) < 3:
            raise MemoryStoreError("Memory is too short.")
        if len(value) > MAX_TEXT:
            raise MemoryStoreError(f"Memory is too long (max {MAX_TEXT} characters).")
        if looks_like_secret(value):
            raise MemoryStoreError("Refused: that looks like a credential. Store it in secrets.env, not memory.")
        kind = kind if kind in KINDS else "fact"
        if confidence is None:
            confidence = 0.95 if source == "user" else 0.45
        now = time.time()
        tag_json = json.dumps([str(t)[:24] for t in (tags or []) if str(t).strip()][:6])
        cursor = self.db.execute(
            "INSERT INTO memories(kind, text, subject, tags, source, confidence, created, updated) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (kind, value, str(subject)[:80], tag_json, str(source)[:40], float(confidence), now, now),
        )
        memory_id = int(cursor.lastrowid)
        if self.db.has_fts:
            try:
                self.db.execute(
                    "INSERT INTO memories_fts(rowid, text, tags, subject) VALUES(?,?,?,?)",
                    (memory_id, value, tag_json, str(subject)),
                )
            except Exception:
                pass
        self.db.audit("memory_added", {"id": memory_id, "kind": kind, "source": source})
        return self.get(memory_id)  # type: ignore[return-value]

    def update(self, memory_id: int, text: str | None = None, kind: str | None = None,
               subject: str | None = None, tags: list | None = None) -> Memory | None:
        current = self.get(memory_id)
        if not current:
            return None
        new_text = current.text if text is None else " ".join(str(text).split()).strip()
        if text is not None:
            if len(new_text) < 3:
                raise MemoryStoreError("Memory is too short.")
            if looks_like_secret(new_text):
                raise MemoryStoreError("Refused: that looks like a credential.")
        new_kind = kind if kind in KINDS else current.kind
        new_subject = current.subject if subject is None else str(subject)[:80]
        new_tags = current.tags if tags is None else [str(t)[:24] for t in tags][:6]
        self.db.execute(
            "UPDATE memories SET text=?, kind=?, subject=?, tags=?, updated=? WHERE id=?",
            (new_text, new_kind, new_subject, json.dumps(new_tags), time.time(), memory_id),
        )
        if self.db.has_fts:
            try:
                self.db.execute("DELETE FROM memories_fts WHERE rowid=?", (memory_id,))
                self.db.execute(
                    "INSERT INTO memories_fts(rowid, text, tags, subject) VALUES(?,?,?,?)",
                    (memory_id, new_text, json.dumps(new_tags), new_subject),
                )
            except Exception:
                pass
        self.db.audit("memory_updated", {"id": memory_id})
        return self.get(memory_id)

    def delete(self, memory_id: int) -> bool:
        if not self.get(memory_id):
            return False
        self.db.execute("DELETE FROM memories WHERE id=?", (memory_id,))
        if self.db.has_fts:
            try:
                self.db.execute("DELETE FROM memories_fts WHERE rowid=?", (memory_id,))
            except Exception:
                pass
        self.db.audit("memory_deleted", {"id": memory_id})
        return True

    def clear(self) -> int:
        rows = self.list(limit=10_000)
        for row in rows:
            self.delete(row.id)
        self.db.audit("memory_cleared", {"count": len(rows)})
        return len(rows)

    # ------------------------------------------------------------- reading

    def get(self, memory_id: int) -> Memory | None:
        row = self.db.one("SELECT * FROM memories WHERE id=?", (memory_id,))
        return _row_to_memory(row) if row else None

    def list(self, kind: str | None = None, limit: int = 200) -> list[Memory]:
        if kind and kind in KINDS:
            rows = self.db.query(
                "SELECT * FROM memories WHERE kind=? ORDER BY updated DESC LIMIT ?", (kind, limit)
            )
        else:
            rows = self.db.query("SELECT * FROM memories ORDER BY updated DESC LIMIT ?", (limit,))
        return [_row_to_memory(row) for row in rows]

    def search(self, query: str, limit: int = 20) -> list[Memory]:
        term = " ".join(str(query or "").split()).strip()
        if not term:
            return self.list(limit=limit)
        # Hindi/Hinglish query → English terms + the Hindi spellings that map
        # to them, so a memory written in Devanagari is still found.
        words = match_terms(term, expand_hindi=True)
        rows: list = []
        if self.db.has_fts and words:
            for joiner in (" AND ", " OR "):
                match = joiner.join(f'"{word}"*' for word in words[:6])
                try:
                    rows = self.db.query(
                        "SELECT m.* FROM memories_fts f JOIN memories m ON m.id=f.rowid "
                        "WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?",
                        (match, limit),
                    )
                except Exception:
                    rows = []
                if rows:
                    break
        if not rows:
            like_words = words or [term]
            clause = " OR ".join(
                ["(text LIKE ? OR subject LIKE ? OR tags LIKE ?)"] * len(like_words))
            params = []
            for word in like_words:
                params.extend([f"%{word}%"] * 3)
            rows = self.db.query(
                f"SELECT * FROM memories WHERE ({clause}) ORDER BY updated DESC LIMIT ?",
                (*params, limit),
            )
        return [_row_to_memory(row) for row in rows]

    def context_block(self, query: str = "", budget: int = 2400) -> str:
        """Text injected into the prompt. Deterministic, trimmed to a budget."""
        picks: list[Memory] = []
        seen: set[int] = set()
        for memory in self.search(query, limit=12) if query else []:
            if memory.id not in seen:
                picks.append(memory)
                seen.add(memory.id)
        for memory in self.list(limit=40):
            if len(picks) >= 20:
                break
            if memory.id in seen:
                continue
            picks.append(memory)
            seen.add(memory.id)
        if not picks:
            return ""
        picks.sort(key=lambda row: (-row.confidence, -row.updated))
        lines = []
        used = 0
        for memory in picks:
            prefix = f"- [{memory.kind}] "
            text = memory.text
            if memory.source not in ("user", "jarvis"):
                text += f"  (source: {memory.source}; unverified)"
            line = prefix + text
            if used + len(line) > budget:
                break
            lines.append(line)
            used += len(line)
        return "\n".join(lines)

    def stats(self) -> dict:
        rows = self.db.query("SELECT kind, COUNT(*) AS n FROM memories GROUP BY kind")
        return {
            "total": sum(int(row["n"]) for row in rows),
            "by_kind": {row["kind"]: int(row["n"]) for row in rows},
            "fts": self.db.has_fts,
        }
