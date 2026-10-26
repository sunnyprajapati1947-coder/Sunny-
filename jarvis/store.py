"""Persistent local state: notes, tasks, reminders, memory, contacts, history.

Everything lives in one JSON document under data/jarvis/ (git-ignored).
Writes are atomic and guarded by a re-entrant lock so the HTTP server and the
scheduler thread can share it safely.
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from jarvis.config import DATA_DIR
from jarvis.util import iso, now, parse_iso

HISTORY_LIMIT = 240
SECRET_HINTS = (
    "password",
    "passwd",
    "api key",
    "api_key",
    "apikey",
    "secret",
    "otp",
    "cvv",
    "pin code",
    "private key",
    "access token",
    "recovery code",
    "aadhaar",
    "aadhar",
    "credit card",
    "debit card",
)


def _identifier(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _default_state() -> dict:
    return {
        "notes": [],
        "todos": [],
        "reminders": [],
        "timers": [],
        "alarms": [],
        "memory": {},
        "contacts": {},
        "history": [],
        "meta": {
            "created": iso(now()),
            "commands": 0,
            "first_boot": iso(now()),
        },
    }


class Store:
    def __init__(self, path: Path | str | None = None):
        self.path = Path(path) if path else (DATA_DIR / "state.json")
        self._lock = threading.RLock()
        self._data = self._load()

    # ------------------------------------------------------------------ io
    def _load(self) -> dict:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                base = _default_state()
                for key, value in raw.items():
                    base[key] = value
                base["meta"] = {**_default_state()["meta"], **(raw.get("meta") or {})}
                return base
        except (OSError, json.JSONDecodeError):
            pass
        return _default_state()

    def _persist(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._data, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    def _mutate(self, fn: Callable[[dict], Any]) -> Any:
        with self._lock:
            result = fn(self._data)
            self._persist()
            return result

    def snapshot(self) -> dict:
        with self._lock:
            return json.loads(json.dumps(self._data))

    # --------------------------------------------------------------- notes
    def add_note(self, text: str) -> dict:
        item = {"id": _identifier("note"), "text": text.strip(), "created": iso(now())}

        def apply(data: dict) -> dict:
            data["notes"].append(item)
            return item

        return self._mutate(apply)

    def notes(self, limit: int = 20) -> list[dict]:
        with self._lock:
            return list(reversed(self._data["notes"]))[: max(1, int(limit))]

    def clear_notes(self) -> int:
        def apply(data: dict) -> int:
            count = len(data["notes"])
            data["notes"].clear()
            return count

        return self._mutate(apply)

    # --------------------------------------------------------------- todos
    def add_todo(self, text: str) -> dict:
        item = {
            "id": _identifier("task"),
            "text": text.strip(),
            "done": False,
            "created": iso(now()),
        }

        def apply(data: dict) -> dict:
            data["todos"].append(item)
            return item

        return self._mutate(apply)

    def todos(self, include_done: bool = True) -> list[dict]:
        with self._lock:
            items = list(self._data["todos"])
        if not include_done:
            items = [item for item in items if not item.get("done")]
        return items

    def resolve_todo(self, ref: str | int) -> dict | None:
        items = self.todos()
        text = str(ref).strip().lower()
        if text.isdigit():
            index = int(text) - 1
            if 0 <= index < len(items):
                return items[index]
        for item in items:
            if item.get("id") == ref:
                return item
        for item in items:
            if text and text in str(item.get("text", "")).lower():
                return item
        return None

    def complete_todo(self, ref: str | int) -> dict | None:
        target = self.resolve_todo(ref)
        if not target:
            return None

        def apply(data: dict) -> dict:
            for item in data["todos"]:
                if item.get("id") == target.get("id"):
                    item["done"] = True
                    item["completed"] = iso(now())
                    return item
            return target

        return self._mutate(apply)

    def remove_todo(self, ref: str | int) -> dict | None:
        target = self.resolve_todo(ref)
        if not target:
            return None

        def apply(data: dict) -> dict:
            before = len(data["todos"])
            data["todos"] = [item for item in data["todos"] if item.get("id") != target.get("id")]
            return target if len(data["todos"]) < before else None

        return self._mutate(apply)

    def clear_todos(self, only_done: bool = False) -> int:
        def apply(data: dict) -> int:
            if only_done:
                before = len(data["todos"])
                data["todos"] = [item for item in data["todos"] if not item.get("done")]
                return before - len(data["todos"])
            count = len(data["todos"])
            data["todos"].clear()
            return count

        return self._mutate(apply)

    # ----------------------------------------------------------- reminders
    def add_reminder(self, text: str, due: datetime) -> dict:
        item = {
            "id": _identifier("rem"),
            "text": text.strip(),
            "due": iso(due),
            "created": iso(now()),
            "fired": False,
        }

        def apply(data: dict) -> dict:
            data["reminders"].append(item)
            return item

        return self._mutate(apply)

    def reminders(self, include_fired: bool = False, limit: int = 50) -> list[dict]:
        with self._lock:
            items = list(self._data["reminders"])
        if not include_fired:
            items = [item for item in items if not item.get("fired")]
        items.sort(key=lambda item: item.get("due", ""))
        return items[: max(1, int(limit))]

    def due_reminders(self, reference: datetime | None = None) -> list[dict]:
        reference = reference or now()
        due = []
        with self._lock:
            for item in self._data["reminders"]:
                if item.get("fired"):
                    continue
                if parse_iso(item.get("due", "")) <= reference:
                    due.append(dict(item))
        return due

    def mark_reminder_fired(self, item_id: str) -> None:
        def apply(data: dict) -> None:
            for item in data["reminders"]:
                if item.get("id") == item_id:
                    item["fired"] = True
                    item["fired_at"] = iso(now())

        self._mutate(apply)

    def cancel_reminder(self, item_id: str) -> bool:
        def apply(data: dict) -> bool:
            before = len(data["reminders"])
            data["reminders"] = [
                item for item in data["reminders"] if item.get("id") != item_id
            ]
            return len(data["reminders"]) < before

        return self._mutate(apply)

    # -------------------------------------------------------------- timers
    def add_timer(self, seconds: int, label: str = "timer") -> dict:
        due = now().timestamp() + max(1, int(seconds))
        due_dt = datetime.fromtimestamp(due)
        item = {
            "id": _identifier("timer"),
            "label": label or "timer",
            "seconds": int(seconds),
            "due": iso(due_dt),
            "fired": False,
        }

        def apply(data: dict) -> dict:
            data["timers"].append(item)
            return item

        return self._mutate(apply)

    def timers(self, include_fired: bool = False) -> list[dict]:
        with self._lock:
            items = list(self._data["timers"])
        if not include_fired:
            items = [item for item in items if not item.get("fired")]
        return items

    def due_timers(self, reference: datetime | None = None) -> list[dict]:
        reference = reference or now()
        with self._lock:
            return [
                dict(item)
                for item in self._data["timers"]
                if not item.get("fired") and parse_iso(item.get("due", "")) <= reference
            ]

    def mark_timer_fired(self, item_id: str) -> None:
        def apply(data: dict) -> None:
            for item in data["timers"]:
                if item.get("id") == item_id:
                    item["fired"] = True
                    item["fired_at"] = iso(now())

        self._mutate(apply)

    def cancel_timer(self, ref: str | None = None) -> int:
        def apply(data: dict) -> int:
            if ref:
                before = len(data["timers"])
                data["timers"] = [
                    item
                    for item in data["timers"]
                    if not (item.get("id") == ref or str(ref).lower() in item.get("label", "").lower())
                ]
                return before - len(data["timers"])
            count = len([item for item in data["timers"] if not item.get("fired")])
            for item in data["timers"]:
                item["fired"] = True
            return count

        return self._mutate(apply)

    # -------------------------------------------------------------- alarms
    def add_alarm(self, time_text: str, label: str = "alarm") -> dict:
        item = {
            "id": _identifier("alarm"),
            "time": time_text,
            "label": label or "alarm",
            "fired_on": "",
            "created": iso(now()),
        }

        def apply(data: dict) -> dict:
            data["alarms"].append(item)
            return item

        return self._mutate(apply)

    def alarms(self) -> list[dict]:
        with self._lock:
            return sorted(self._data["alarms"], key=lambda item: item.get("time", ""))

    def mark_alarm_fired(self, item_id: str, day: str) -> None:
        def apply(data: dict) -> None:
            for item in data["alarms"]:
                if item.get("id") == item_id:
                    item["fired_on"] = day

        self._mutate(apply)

    def remove_alarm(self, ref: str) -> int:
        def apply(data: dict) -> int:
            before = len(data["alarms"])
            data["alarms"] = [
                item
                for item in data["alarms"]
                if item.get("id") != ref and item.get("time") != ref
            ]
            return before - len(data["alarms"])

        return self._mutate(apply)

    # -------------------------------------------------------------- memory
    def remember(self, key: str, value: str) -> dict:
        normalized = key.strip().lower()[:120]
        item = {"value": value.strip()[:1000], "updated": iso(now())}

        def apply(data: dict) -> dict:
            data["memory"][normalized] = item
            return {"key": normalized, **item}

        return self._mutate(apply)

    def recall(self, key: str) -> dict | None:
        normalized = key.strip().lower()
        with self._lock:
            item = self._data["memory"].get(normalized)
            if item is None:
                for existing, candidate in self._data["memory"].items():
                    if normalized and normalized in existing:
                        item = candidate
                        normalized = existing
                        break
        if item is None:
            return None
        return {"key": normalized, **item}

    def facts(self, limit: int = 50) -> list[dict]:
        with self._lock:
            items = [
                {"key": key, **value} for key, value in self._data["memory"].items()
            ]
        return items[-limit:]

    def forget(self, key: str) -> bool:
        normalized = key.strip().lower()

        def apply(data: dict) -> bool:
            if normalized in data["memory"]:
                del data["memory"][normalized]
                return True
            for existing in list(data["memory"]):
                if normalized and normalized in existing:
                    del data["memory"][existing]
                    return True
            return False

        return self._mutate(apply)

    @staticmethod
    def looks_secret(text: str) -> bool:
        lowered = str(text or "").lower()
        return any(hint in lowered for hint in SECRET_HINTS)

    # ------------------------------------------------------------ contacts
    def set_contact(self, name: str, phone: str | None = None, email: str | None = None) -> dict:
        key = name.strip().lower()[:60]

        def apply(data: dict) -> dict:
            existing = data["contacts"].get(key, {})
            if phone:
                existing["phone"] = phone
            if email:
                existing["email"] = email
            existing["name"] = name.strip()
            existing["updated"] = iso(now())
            data["contacts"][key] = existing
            return {"key": key, **existing}

        return self._mutate(apply)

    def contact(self, name: str) -> dict | None:
        key = name.strip().lower()
        with self._lock:
            item = self._data["contacts"].get(key)
            if item:
                return {"key": key, **item}
            for existing, candidate in self._data["contacts"].items():
                if key and (key in existing or existing in key):
                    return {"key": existing, **candidate}
        return None

    def contacts(self) -> list[dict]:
        with self._lock:
            return [{"key": key, **value} for key, value in self._data["contacts"].items()]

    # ------------------------------------------------------------- history
    def append_history(self, role: str, text: str, **meta) -> dict:
        entry = {
            "id": _identifier("msg"),
            "role": role,
            "text": str(text)[:4000],
            "ts": iso(now()),
            **{key: value for key, value in meta.items() if value is not None},
        }

        def apply(data: dict) -> dict:
            data["history"].append(entry)
            if len(data["history"]) > HISTORY_LIMIT:
                data["history"] = data["history"][-HISTORY_LIMIT:]
            if role == "user":
                data["meta"]["commands"] = int(data["meta"].get("commands", 0)) + 1
            return entry

        return self._mutate(apply)

    def history(self, limit: int = 20) -> list[dict]:
        with self._lock:
            return list(self._data["history"])[-max(1, int(limit)):]

    def clear_history(self) -> None:
        self._mutate(lambda data: data["history"].clear())

    def search_history(self, query: str, limit: int = 5) -> list[dict]:
        needle = query.strip().lower()
        if not needle:
            return []
        with self._lock:
            matches = [
                entry
                for entry in self._data["history"]
                if needle in str(entry.get("text", "")).lower()
            ]
        return matches[-limit:]

    def stats(self) -> dict:
        with self._lock:
            data = self._data
            return {
                "commands": int(data["meta"].get("commands", 0)),
                "first_boot": data["meta"].get("first_boot"),
                "notes": len(data["notes"]),
                "todos_open": len([item for item in data["todos"] if not item.get("done")]),
                "reminders": len([item for item in data["reminders"] if not item.get("fired")]),
                "facts": len(data["memory"]),
                "contacts": len(data["contacts"]),
            }


_STORE: Store | None = None
_STORE_LOCK = threading.RLock()


def get_store() -> Store:
    global _STORE
    with _STORE_LOCK:
        if _STORE is None:
            _STORE = Store()
        return _STORE


def set_store(store: Store) -> Store:
    global _STORE
    with _STORE_LOCK:
        _STORE = store
        return store


def reset_store(path: Path | str | None = None) -> Store:
    return set_store(Store(path))
