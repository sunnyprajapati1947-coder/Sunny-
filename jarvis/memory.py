"""Long-term memory v2 — observations, retrieval and session compression.

Inspired by claude-mem's compression loop: instead of storing every raw turn,
Jarvis keeps *observations* (facts, preferences, decisions, episodes) with
tags, provenance and importance, then retrieves the few that matter with a
small BM25 scorer. Everything lives in ``data/jarvis/memory.jsonl`` — readable,
portable, and easy to export.

The store is append-only and stdlib-only; it never needs a database server.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import threading
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path

from jarvis.config import DATA_DIR
from jarvis.util import iso, now

MEMORY_FILE = DATA_DIR / "memory.jsonl"
MAX_RECORDS = 4000
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "than", "to", "of", "in", "on",
    "for", "with", "is", "are", "was", "were", "be", "been", "do", "does", "did", "i",
    "me", "my", "you", "your", "it", "this", "that", "what", "how", "why", "when",
    "ka", "ki", "ke", "hai", "ho", "kya", "mein", "me", "ko", "se", "aur", "par",
}
TOKEN_RE = re.compile(r"[a-zA-Z0-9_\u0900-\u097F]{2,}")
SECRET_RE = re.compile(
    r"(?:pass(?:word|wd|phrase)?|secret|token|api[_-]?key|private[_-]?key|credential|otp|cvv)",
    re.I,
)


def tokenize(text: str) -> list[str]:
    return [word.lower() for word in TOKEN_RE.findall(str(text or "")) if word.lower() not in STOPWORDS]


@dataclass
class Observation:
    id: str
    ts: str
    kind: str
    text: str
    tags: list[str] = field(default_factory=list)
    source: str = ""
    importance: float = 0.5
    meta: dict = field(default_factory=dict)

    @property
    def age_days(self) -> float:
        try:
            stamp = datetime.fromisoformat(self.ts)
        except ValueError:
            return 0.0
        return max(0.0, (now() - stamp).total_seconds() / 86400)


class MemoryStore:
    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path or MEMORY_FILE)
        self._lock = threading.RLock()
        self._records: list[Observation] | None = None

    # ------------------------------------------------------------- storage
    def _load(self) -> list[Observation]:
        if self._records is not None:
            return self._records
        records: list[Observation] = []
        try:
            lines = self.path.read_text(encoding="utf-8").splitlines()
        except OSError:
            lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict) or not payload.get("text"):
                continue
            records.append(
                Observation(
                    id=str(payload.get("id") or ""),
                    ts=str(payload.get("ts") or ""),
                    kind=str(payload.get("kind") or "note"),
                    text=str(payload.get("text") or ""),
                    tags=[str(tag) for tag in payload.get("tags") or []],
                    source=str(payload.get("source") or ""),
                    importance=float(payload.get("importance") or 0.5),
                    meta=payload.get("meta") if isinstance(payload.get("meta"), dict) else {},
                )
            )
        self._records = records
        return records

    def _append(self, item: Observation) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(asdict(item), ensure_ascii=False) + "\n")
        records = self._load()
        records.append(item)
        if len(records) > MAX_RECORDS:
            del records[: len(records) - MAX_RECORDS]
            self._rewrite(records)

    def _rewrite(self, records: list[Observation]) -> None:
        tmp = self.path.with_suffix(".jsonl.tmp")
        tmp.write_text(
            "\n".join(json.dumps(asdict(item), ensure_ascii=False) for item in records) + "\n",
            encoding="utf-8",
        )
        tmp.replace(self.path)

    # --------------------------------------------------------------- write
    def add(
        self,
        text: str,
        *,
        kind: str = "note",
        tags: list[str] | None = None,
        source: str = "",
        importance: float = 0.5,
        meta: dict | None = None,
        dedupe_hours: float = 12.0,
    ) -> Observation | None:
        clean = re.sub(r"\s+", " ", str(text or "")).strip()[:1200]
        if not clean or SECRET_RE.search(clean):
            return None
        with self._lock:
            records = self._load()
            if dedupe_hours > 0:
                for existing in reversed(records[-120:]):
                    if existing.text.lower() == clean.lower() and existing.age_days * 24 < dedupe_hours:
                        return existing
            digest = hashlib.sha1(clean.encode("utf-8")).hexdigest()[:10]
            item = Observation(
                id=f"mem-{int(time.time())}-{digest}",
                ts=iso(now()),
                kind=kind[:24],
                text=clean,
                tags=[str(tag)[:32] for tag in (tags or [])][:8],
                source=str(source)[:80],
                importance=max(0.0, min(1.0, float(importance))),
                meta=dict(meta or {}),
            )
            self._append(item)
            return item

    def forget(self, ref: str) -> int:
        needle = str(ref or "").strip().lower()
        if not needle:
            return 0
        with self._lock:
            records = self._load()
            kept = [
                item for item in records
                if item.id.lower() != needle and needle not in item.text.lower()
            ]
            removed = len(records) - len(kept)
            if removed:
                self._records = kept
                self._rewrite(kept)
            return removed

    # ---------------------------------------------------------------- read
    def all(self, limit: int = 200) -> list[dict]:
        with self._lock:
            return [asdict(item) for item in self._load()[-max(1, limit):]]

    def search(self, query: str, limit: int = 6, kinds: list[str] | None = None) -> list[dict]:
        terms = tokenize(query)
        with self._lock:
            records = self._load()
        if not records:
            return []
        if kinds:
            records = [item for item in records if item.kind in set(kinds)]
        if not records:
            return []
        # document frequency for BM25-ish idf
        docs = [(item, tokenize(item.text + " " + " ".join(item.tags))) for item in records]
        df: dict[str, int] = {}
        for _, tokens in docs:
            for token in set(tokens):
                df[token] = df.get(token, 0) + 1
        total = len(docs)
        avg_len = sum(len(tokens) for _, tokens in docs) / max(1, total)
        scored: list[tuple[float, Observation]] = []
        phrase = str(query or "").strip().lower()
        for item, tokens in docs:
            if not tokens:
                continue
            score = 0.0
            counts: dict[str, int] = {}
            for token in tokens:
                counts[token] = counts.get(token, 0) + 1
            for term in terms:
                freq = counts.get(term, 0)
                if not freq:
                    continue
                idf = math.log(1 + (total - df.get(term, 0) + 0.5) / (df.get(term, 0) + 0.5))
                score += idf * (freq * 2.2) / (freq + 1.2 * (0.25 + 0.75 * len(tokens) / max(1.0, avg_len)))
            if phrase and phrase in item.text.lower():
                score += 2.5
            score += item.importance * 0.6
            score += max(0.0, 0.5 - item.age_days * 0.01)
            if score > 0:
                scored.append((score, item))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [
            {**asdict(item), "score": round(score, 3)}
            for score, item in scored[: max(1, limit)]
        ]

    def digest(self, limit: int = 8) -> str:
        with self._lock:
            records = self._load()
        if not records:
            return ""
        recent = sorted(records, key=lambda item: (item.importance, item.ts), reverse=True)[:limit]
        lines = [f"- [{item.kind}] {item.text}" for item in recent]
        return "\n".join(lines)

    def stats(self) -> dict:
        with self._lock:
            records = self._load()
        kinds: dict[str, int] = {}
        for item in records:
            kinds[item.kind] = kinds.get(item.kind, 0) + 1
        return {
            "count": len(records),
            "kinds": kinds,
            "path": str(self.path),
            "last_ts": records[-1].ts if records else None,
        }

    # --------------------------------------------------------- compression
    def compress_turns(self, turns: list[dict], source: str = "session") -> Observation | None:
        """Turn a slice of conversation into one durable episode observation.

        Deterministic on purpose: it must work with no model key and must never
        invent facts. Topics come from the user's own words.
        """
        user_lines = [str(turn.get("text") or "") for turn in turns if turn.get("role") == "user"]
        if not user_lines:
            return None
        topics: list[str] = []
        for line in user_lines:
            for token in tokenize(line):
                if token not in topics and len(token) > 3:
                    topics.append(token)
        tools = sorted({
            str(turn.get("tool"))
            for turn in turns
            if turn.get("tool")
        })
        asked = "; ".join(line[:90] for line in user_lines[-4:])
        summary = f"Session covered: {asked[:360]}."
        if tools:
            summary += f" Tools used: {', '.join(tools[:8])}."
        return self.add(
            summary,
            kind="episode",
            tags=topics[:6],
            source=source,
            importance=0.55,
            meta={"turns": len(turns), "tools": tools[:8]},
            dedupe_hours=0,
        )


_MEMORY: MemoryStore | None = None
_LOCK = threading.Lock()


def get_memory() -> MemoryStore:
    global _MEMORY
    with _LOCK:
        if _MEMORY is None:
            _MEMORY = MemoryStore()
        return _MEMORY


def set_memory(store: MemoryStore) -> MemoryStore:
    global _MEMORY
    with _LOCK:
        _MEMORY = store
        return store
