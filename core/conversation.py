"""Jarvis conversation memory — persistent, local, human-like.

Short-term memory: the last turns of the current chat, replayed into the
local model so Jarvis remembers what you just said (like a person would).

Long-term memory is already handled by core/personal_profile.py; this module
only stores the rolling dialogue, never any secrets, and caps its size.
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any

DEFAULT_HISTORY = Path.home() / "Nova" / "workspace" / "chat_history.json"
MAX_TURNS = 60          # stored on disk
CONTEXT_TURNS = 6       # replayed into the model (small = fast on phone)
MAX_TURN_CHARS = 1200   # per-turn cap so a huge answer can't bloat context


def _path() -> Path:
    return Path(os.getenv("NOVA_CHAT_HISTORY", str(DEFAULT_HISTORY))).expanduser()


def _clean(text: str) -> str:
    return str(text or "").strip()[:MAX_TURN_CHARS]


def load() -> list[dict[str, str]]:
    path = _path()
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        turns = data.get("turns") if isinstance(data, dict) else data
        if not isinstance(turns, list):
            return []
        out = []
        for turn in turns:
            if isinstance(turn, dict) and turn.get("role") in {"user", "assistant"} and turn.get("content"):
                out.append({
                    "role": "user" if turn["role"] == "user" else "assistant",
                    "content": _clean(turn["content"]),
                })
        return out[-MAX_TURNS:]
    except (json.JSONDecodeError, OSError):
        return []


def save(turns: list[dict[str, str]]) -> bool:
    path = _path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "updated_at": int(time.time()),
            "turns": [
                {"role": t["role"], "content": _clean(t["content"]), "ts": int(time.time())}
                for t in turns[-MAX_TURNS:]
            ],
        }
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return True
    except OSError:
        return False


def add(role: str, content: str) -> list[dict[str, str]]:
    """Append one turn and persist. Returns the new rolling history."""
    turns = load()
    turns.append({
        "role": "user" if role == "user" else "assistant",
        "content": _clean(content),
    })
    save(turns)
    return turns


def context(turns: list[dict[str, str]] | None = None, limit: int = CONTEXT_TURNS) -> list[dict[str, str]]:
    """The recent slice of dialogue replayed into the model."""
    recent = (turns if turns is not None else load())[-limit:]
    return [{"role": t["role"], "content": t["content"]} for t in recent]


def reset() -> dict[str, Any]:
    """Forget the rolling dialogue (long-term personal facts stay)."""
    path = _path()
    if path.is_file():
        try:
            path.unlink()
        except OSError:
            return {"success": False, "error": "Could not delete the history file."}
    return {"success": True, "forgotten": True}


def summarize_load() -> dict[str, Any]:
    turns = load()
    return {
        "success": True,
        "turns_stored": len(turns),
        "storage": str(_path()),
        "context_window": CONTEXT_TURNS,
    }
