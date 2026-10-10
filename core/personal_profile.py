"""Nova personal profile — local-first personal memory and daily briefing.

Inspired by open-jarvis/OpenJarvis: "Personal AI, On Personal Devices" — a
local-first personal AI stack whose presets include a spoken morning digest
from personal signals. Nova adapts two primitives:

- a small personal fact store (remember / recall) that never leaves the device
- a daily briefing that composes local signals into a morning digest

Storage is a single JSON file under the Nova workspace. No network access.
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any

DEFAULT_PROFILE = Path.home() / "Nova" / "workspace" / "personal_profile.json"
MAX_FACTS = 500
CATEGORIES = {"preference", "fact", "goal", "reminder", "note"}


def _path() -> Path:
    return Path(os.getenv("NOVA_PROFILE_PATH", str(DEFAULT_PROFILE))).expanduser()


def _load() -> dict[str, Any]:
    path = _path()
    if not path.is_file():
        return {"facts": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("facts"), list):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return {"facts": []}


def _save(data: dict[str, Any]) -> bool:
    path = _path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return True
    except OSError:
        return False


def _clean(text: str, limit: int = 400) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()[:limit]


# ------------------------------------------------------------------ tools ---

def personal_remember(fact: str, category: str = "note") -> dict[str, Any]:
    """Store one personal fact/preference locally on the device."""
    if not enabled():
        return {"success": False, "error": "Personal profile is disabled."}
    text = _clean(fact)
    if not text:
        return {"success": False, "error": "Nothing to remember."}
    cat = str(category or "note").strip().lower()
    if cat not in CATEGORIES:
        cat = "note"
    data = _load()
    # Idempotent: re-storing the same fact refreshes its timestamp only.
    for entry in data["facts"]:
        if entry.get("text", "").lower() == text.lower():
            entry["updated_at"] = int(time.time())
            entry["category"] = cat
            _save(data)
            return {"success": True, "remembered": text, "category": cat, "already_known": True}
    data["facts"].append({
        "text": text,
        "category": cat,
        "created_at": int(time.time()),
    })
    if len(data["facts"]) > MAX_FACTS:
        data["facts"] = data["facts"][-MAX_FACTS:]
    if not _save(data):
        return {"success": False, "error": "Could not write the local profile file."}
    return {"success": True, "remembered": text, "category": cat, "total_facts": len(data["facts"])}


def personal_recall(query: str = "") -> dict[str, Any]:
    """Recall stored personal facts, optionally filtered by keywords."""
    if not enabled():
        return {"success": False, "error": "Personal profile is disabled."}
    data = _load()
    facts = data["facts"]
    q = {w for w in re.findall(r"\w+", str(query or "").lower()) if len(w) > 2}
    if q:
        facts = [
            f for f in facts
            if q & set(re.findall(r"\w+", f.get("text", "").lower()))
        ]
    facts = list(reversed(facts))[:25]
    return {
        "success": True,
        "query": query,
        "count": len(facts),
        "facts": facts,
        "storage": str(_path()),
    }


def personal_forget(query: str) -> dict[str, Any]:
    """Remove stored facts matching a query (local right-to-be-forgotten)."""
    if not enabled():
        return {"success": False, "error": "Personal profile is disabled."}
    data = _load()
    q = {w for w in re.findall(r"\w+", str(query or "").lower()) if len(w) > 2}
    if not q:
        return {"success": False, "error": "Provide words that identify the fact."}
    kept, removed = [], []
    for f in data["facts"]:
        if q & set(re.findall(r"\w+", f.get("text", "").lower())):
            removed.append(f)
        else:
            kept.append(f)
    if not removed:
        return {"success": False, "error": "No matching facts found."}
    data["facts"] = kept
    if not _save(data):
        return {"success": False, "error": "Could not write the local profile file."}
    return {"success": True, "removed": [f["text"] for f in removed], "remaining": len(kept)}


def personal_briefing(owner: str = "") -> dict[str, Any]:
    """Morning digest: date, time, and everything Nova remembers about you."""
    if not enabled():
        return {"success": False, "error": "Personal profile is disabled."}
    data = _load()
    now = time.localtime()
    hour = now.tm_hour
    greeting = "Good morning" if 5 <= hour < 12 else (
        "Good afternoon" if 12 <= hour < 17 else "Good evening")
    name = _clean(owner, 40) or "Boss"
    goals = [f["text"] for f in data["facts"] if f.get("category") == "goal"][:5]
    reminders = [f["text"] for f in data["facts"] if f.get("category") == "reminder"][:5]
    preferences = [f["text"] for f in data["facts"] if f.get("category") == "preference"][:5]

    # Pending work from Nova's verified task queue, if present.
    pending_tasks: list[str] = []
    try:
        state_path = Path(__file__).resolve().parent.parent / "tasks" / "state.json"
        if state_path.is_file():
            state = json.loads(state_path.read_text(encoding="utf-8"))
            pending_tasks = [
                str(item.get("name") or item.get("topic") or item)
                for item in (state.get("pending") or state.get("queue") or [])[:5]
            ]
    except (json.JSONDecodeError, OSError, AttributeError):
        pass

    digest_lines = [
        f"{greeting}, {name}.",
        f"Today is {time.strftime('%A, %d %B %Y')} and it is {time.strftime('%H:%M')}.",
    ]
    if goals:
        digest_lines.append("Your active goals: " + "; ".join(goals))
    if reminders:
        digest_lines.append("Reminders: " + "; ".join(reminders))
    if pending_tasks:
        digest_lines.append("Pending Nova tasks: " + "; ".join(pending_tasks))
    if preferences:
        digest_lines.append("Known preferences: " + "; ".join(preferences))
    if len(digest_lines) == 2:
        digest_lines.append("Nothing personal is stored yet — tell Nova to remember something.")

    return {
        "success": True,
        "briefing": " ".join(digest_lines),
        "facts_known": len(data["facts"]),
        "goals": goals,
        "reminders": reminders,
        "pending_tasks": pending_tasks,
    }


def enabled() -> bool:
    return os.getenv("NOVA_PERSONAL_PROFILE_ENABLED", "true").lower() == "true"
