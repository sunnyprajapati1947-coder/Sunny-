"""Nova reminders — "kal subah 7 baje jagana" wala asli kaam.

Real JARVIS feature: contextual memory jo time ke saath juri ho.
Boss bolta hai "mujhe kal subah 7 baje jagana" -> Nova parse karta hai,
store karta hai, aur waqt aane pe bolkar + notification se yaad dila deta hai.

Design:
- Pure Python, zero dependency, phone-friendly.
- Hinglish time parsing: "10 minute baad", "kal subah 7 baje", "aaj raat 9
  baje", "roz subah 6 baje" (daily), "parso dopahar 2 baje", ISO timestamps.
- Store: tasks/reminders.json (personal data, git me kabhi commit nahi hota;
  env NOVA_REMINDERS_FILE se path badal sakte ho).
- Ek-shot reminder fire hoke hat jaata hai; "roz" wala daily reschedule hota hai.
- Har function `now` param leta hai — tests deterministic rehte hain.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent

# ----------------------------- time parsing -----------------------------

_NUM = r"(\d{1,2})(?::(\d{2}))?"
_TIMEOfDay = r"(subah|savere|dopahar|dopahar|shaam|saam|raat|rat)"

# "10 minute baad", "aadha ghanta baad", "2 ghante baad"
_RE_AFTER = re.compile(
    r"\b(\d+|aadha|adha)\s*(second|seconds|minute|min|minat|minit|ghante|ghanta|bante|ghante|hour|hours|ka ghante)\s*(baad|baad me|baadmein|later)\b",
    re.IGNORECASE)
# "7 baje", "7:30 baje"
_RE_BAJE = re.compile(r"\b" + _NUM + r"\s*(baje|bajay|bje)\b", re.IGNORECASE)
# day words with optional time-of-day + time
_RE_DAY = re.compile(r"\b(aaj|kal|parso|tomorrow|today|day after)\b", re.IGNORECASE)
_RE_TOD = re.compile(r"\b(" + _TIMEOfDay + r")\b", re.IGNORECASE)
# "roz subah 6 baje" / "daily"
_RE_DAILY = re.compile(r"\b(roz|daily|har roz|har din|everyday)\b", re.IGNORECASE)
# "jaldi" (early) modifier
_RE_JALDI = re.compile(r"\b(jaldi|early|fatafat)\b", re.IGNORECASE)
# ISO: 2026-10-12 07:00 ya 2026-10-12T07:00
_RE_ISO = re.compile(r"\b(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})\b")

WEEKDAYS = {
    "somvar": 0, "monday": 0, "mon": 0,
    "mangalvar": 1, "mangalwar": 1, "tuesday": 1, "tue": 1,
    "budhvar": 2, "budhwar": 2, "wednesday": 2, "wed": 2,
    "guruvar": 3, "guruwar": 3, "thursday": 3, "thu": 3, "birwar": 3,
    "shukravar": 4, "shukrawar": 4, "jumeraat": 4, "friday": 4, "fri": 4,
    "shanivar": 5, "shaneevar": 5, "saturday": 5, "sat": 5,
    "ravivar": 6, "raviwar": 6, "itvaar": 6, "sunday": 6, "sun": 6,
}
_RE_WEEKDAY = re.compile(
    r"\b(agle|agla|next)?\s*(" + "|".join(WEEKDAYS) + r")\b", re.IGNORECASE)

# time-of-day defaults (hour) jab number na bola jaye
_TOD_DEFAULT = {"subah": 7, "savere": 6, "dopahar": 13, "shaam": 18, "saam": 18, "raat": 21, "rat": 21}


def _hour_from_tod(word: str, hour: int) -> int:
    """Hinglish time-of-day ko 24h hour me badlo."""
    w = word.lower()
    if w in ("subah", "savere"):
        return hour if 4 <= hour <= 11 else hour  # subah 7 -> 07
    if w in ("dopahar",):
        return hour + 12 if hour < 12 and hour != 12 else hour  # dopahar 2 -> 14
    if w in ("shaam", "saam"):
        return hour + 12 if hour < 12 else hour  # shaam 5 -> 17
    if w in ("raat", "rat"):
        # raat 9 -> 21; raat 2 (raat ke 2 baje) -> agli subah 2
        if hour <= 4:
            return hour
        return hour + 12
    return hour


def parse_when(text: str, now: datetime | None = None) -> tuple[datetime, bool] | None:
    """Text se reminder time nikalo. Return (datetime, daily) ya None.

    Hinglish + ISO dono samajhta hai. Past time mila to agle din.
    """
    text = str(text or "").lower().strip()
    now = now or datetime.now()
    daily = bool(_RE_DAILY.search(text))
    jaldi = bool(_RE_JALDI.search(text))

    # ISO datetime (sabse specific, pehle)
    m = _RE_ISO.search(text)
    if m:
        try:
            when = datetime(int(m.group(1)[:4]), int(m.group(1)[5:7]), int(m.group(1)[8:10]),
                            int(m.group(2)), int(m.group(3)))
            if when <= now:
                when += timedelta(days=1)
            return when, daily
        except ValueError:
            pass

    # "X minute/ghante baad"
    m = _RE_AFTER.search(text)
    if m:
        num_word, unit = m.group(1).lower(), m.group(2).lower()
        if num_word in ("aadha", "adha"):
            n = 0.5
            unit = "ghante"
        else:
            n = int(num_word)
        if unit.startswith("min"):
            when = now + timedelta(minutes=n)
        elif unit.startswith(("ghant", "bant", "hour")):
            when = now + timedelta(hours=n)
        else:  # second
            when = now + timedelta(seconds=n)
        return when, daily

    # baje (hour mile?)
    mb = _RE_BAJE.search(text)
    if mb:
        hour = int(mb.group(1))
        minute = int(mb.group(2) or 0)
        tod = _RE_TOD.search(text)
        if tod:
            hour = _hour_from_tod(tod.group(1), hour)
        if hour > 23:
            hour = 23
        when = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        day = _RE_DAY.search(text)
        if day:
            d = day.group(1).lower()
            if d in ("kal", "tomorrow"):
                when += timedelta(days=1)
            elif d in ("parso", "day after"):
                when += timedelta(days=2)
        # weekday ("agle somvar")
        elif _RE_WEEKDAY.search(text):
            when = _next_weekday(when, text, now)
        elif when <= now and not daily:
            when += timedelta(days=1)  # "9 baje" jo nikal gaya -> kal
        if jaldi:
            when -= timedelta(hours=1)
        if when <= now:
            when += timedelta(days=1)
        return when, daily

    # sirf "kal subah" / "aaj shaam" (baje number nahi)
    day = _RE_DAY.search(text)
    tod = _RE_TOD.search(text)
    if day or tod:
        hour = _TOD_DEFAULT.get((tod.group(1).lower() if tod else ""), 9)
        when = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if day:
            d = day.group(1).lower()
            if d in ("kal", "tomorrow"):
                when += timedelta(days=1)
            elif d in ("parso", "day after"):
                when += timedelta(days=2)
        if jaldi:
            when -= timedelta(hours=1)
        if when <= now:
            when += timedelta(days=1)
        return when, daily

    # weekday only
    if _RE_WEEKDAY.search(text):
        when = now.replace(hour=9, minute=0, second=0, microsecond=0)
        when = _next_weekday(when, text, now)
        if when <= now:
            when += timedelta(days=7)
        return when, daily

    return None  # samajh nahi aaya


def _next_weekday(when: datetime, text: str, now: datetime) -> datetime:
    m = _RE_WEEKDAY.search(text)
    if not m:
        return when
    target = WEEKDAYS[m.group(2).lower()]
    days_ahead = (target - now.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7  # aaj ka din ho to agle hafte
    return when + timedelta(days=days_ahead)


def strip_when(text: str) -> str:
    """Reminder body ke liye time phrase hata do (action words rehte hain)."""
    t = str(text or "")
    for rx in (_RE_ISO, _RE_AFTER, _RE_BAJE, _RE_TOD, _RE_DAY, _RE_DAILY, _RE_JALDI, _RE_WEEKDAY):
        t = rx.sub(" ", t, count=1)
    # sirf filler/trigger hatao — "jagana/pina/uthana" jaise action words rakhna hai
    t = re.sub(r"\b(mujhe|mujheko|mujhko|mera|please|plz|boss|jarvis|nova|yaad dilana|yaad dila do|yaad dilad do|remind me|reminder|alarm|lagao|laga do|set karo|kar dena|hai|he)\b",
               " ", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+", " ", t).strip(" ,.-:!?")
    return t


# ------------------------------- storage --------------------------------

def _store_file() -> Path:
    return Path(os.getenv("NOVA_REMINDERS_FILE", str(ROOT / "tasks" / "reminders.json")))


def _load() -> list[dict[str, Any]]:
    try:
        raw = json.loads(_store_file().read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, ValueError):
        return []


def _save(items: list[dict[str, Any]]) -> None:
    path = _store_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)  # atomic-ish


def _next_id(items: list[dict[str, Any]]) -> str:
    nums = []
    for i in items:
        rid = str(i.get("id", ""))
        if rid.startswith("r") and rid[1:].isdigit():
            nums.append(int(rid[1:]))
    return f"r{max(nums, default=0) + 1}"


# ------------------------------ public API ------------------------------

def add_reminder(text: str, when: str | datetime, daily: bool = False) -> dict[str, Any]:
    """Ek reminder store karo. `when` datetime ya ISO string."""
    if isinstance(when, str):
        try:
            when = datetime.fromisoformat(when)
        except ValueError as exc:
            return {"success": False, "error": f"bad time format: {exc}"}
    if not str(text or "").strip():
        return {"success": False, "error": "empty reminder text"}
    items = _load()
    item = {
        "id": _next_id(items),
        "text": str(text).strip(),
        "when": when.isoformat(timespec="minutes"),
        "daily": bool(daily),
        "created": datetime.now().isoformat(timespec="minutes"),
        "fired": False,
    }
    items.append(item)
    _save(items)
    return {"success": True, **item}


def list_reminders(pending_only: bool = True) -> dict[str, Any]:
    items = _load()
    if pending_only:
        items = [i for i in items if not i.get("fired")]
    items = sorted(items, key=lambda i: str(i.get("when", "")))
    return {"success": True, "count": len(items), "reminders": items}


def due_reminders(now: datetime | None = None, mark: bool = True) -> dict[str, Any]:
    """Jinke waqt ho gaye. Ek-shot fire -> removed; daily -> kal reschedule."""
    now = now or datetime.now()
    items = _load()
    due: list[dict[str, Any]] = []
    kept: list[dict[str, Any]] = []
    changed = False
    for item in items:
        try:
            when = datetime.fromisoformat(str(item.get("when", "")))
        except ValueError:
            kept.append(item)  # corrupt entry kabhi crash na kare
            continue
        if when <= now:
            due.append({**item, "fired": True})
            changed = True
            if item.get("daily"):
                # roz wala: agle din same time pe reschedule, list me rahega
                while when <= now:
                    when += timedelta(days=1)
                kept.append({**item, "when": when.isoformat(timespec="minutes"), "fired": False})
            # one-shot: `kept` me nahi jata = auto-delete after firing
        else:
            kept.append(item)
    if mark and changed:
        _save(kept)
    return {"success": True, "count": len(due), "reminders": due}


def dismiss_reminder(reminder_id: str) -> dict[str, Any]:
    items = _load()
    kept = [i for i in items if str(i.get("id")) != str(reminder_id).strip()]
    if len(kept) == len(items):
        return {"success": False, "error": f"reminder {reminder_id} nahi mila"}
    _save(kept)
    return {"success": True, "removed": reminder_id}


def human_when(when: datetime, now: datetime | None = None) -> str:
    """Bolne layak time: 'kal subah 7:00 baje', '12 Oct 3:00 PM'."""
    now = now or datetime.now()
    when = when.replace(second=0, microsecond=0)
    if when.date() == now.date():
        day = "aaj"
    elif when.date() == (now + timedelta(days=1)).date():
        day = "kal"
    elif when.date() == (now + timedelta(days=2)).date():
        day = "parso"
    else:
        day = when.strftime("%d %b")
    hour, minute = when.hour, when.minute
    if 4 <= hour < 12:
        tod = "subah"
    elif 12 <= hour < 17:
        tod = "dopahar"
    elif 17 <= hour < 20:
        tod = "shaam"
    else:
        tod = "raat"
    h12 = hour % 12 or 12
    t = f"{h12}:{minute:02d}" if minute else f"{h12} baje"
    return f"{day} {tod} {t}" if day in ("aaj", "kal", "parso") else f"{day} {t} {tod}"


def notify(text: str, title: str = "Nova reminder") -> bool:
    """termux-notification se phone pe notification (optional, non-fatal)."""
    import shutil
    exe = shutil.which("termux-notification")
    if not exe:
        return False
    try:
        subprocess.run([exe, "--title", title[:60], "--content", str(text)[:240]],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       timeout=10, check=False)
        return True
    except Exception:
        return False


def speak_due(now: datetime | None = None) -> list[str]:
    """Due reminders uthao -> notification + bolne ke liye lines banao.

    jarvis.py har loop cycle pe ye call karta hai; jo due hai wo ek hi baar
    bolta hai (one-shot auto-delete, daily reschedule).
    """
    result = due_reminders(now=now)
    lines: list[str] = []
    for item in result.get("reminders", []):
        line = f"Boss, yaad dila raha hu: {item.get('text', '')}"
        if item.get("daily"):
            line += " (ye roz ka hai)"
        lines.append(line)
        notify(item.get("text", ""), title="Nova yaad dila diya")
    return lines
