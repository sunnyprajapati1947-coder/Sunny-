"""Small shared helpers: reply envelopes, time formatting, text hygiene."""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta

MAX_TEXT = 4000


def reply(
    text: str,
    speech: str | None = None,
    cards: list | None = None,
    action: dict | None = None,
    data: dict | None = None,
) -> dict:
    """Build the standard skill/tool response envelope."""
    text = str(text).strip()
    return {
        "text": text,
        "speech": (text if speech is None else str(speech)).strip(),
        "cards": list(cards or []),
        "action": action,
        "data": dict(data or {}),
    }


def clean(text: str, limit: int = MAX_TEXT) -> str:
    text = unicodedata.normalize("NFKC", str(text or "")).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:limit]


def norm(text: str) -> str:
    """Normalise for keyword matching (keeps Hinglish words intact)."""
    value = unicodedata.normalize("NFKC", str(text or "")).casefold()
    value = re.sub(r"[\u2018\u2019\u201c\u201d]", "'", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"^[^\w]+|[^\w]+$", "", value)
    return value


def strip_markdown(text: str) -> str:
    value = str(text or "")
    value = re.sub(r"```.*?```", " ", value, flags=re.S)
    value = re.sub(r"`([^`]*)`", r"\1", value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"\1", value)
    value = re.sub(r"\*([^*]+)\*", r"\1", value)
    value = re.sub(r"^#{1,6}\s*", "", value, flags=re.M)
    value = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1", value)
    value = re.sub(r"https?://\S+", "", value)
    value = re.sub(r"[*_#>`]", "", value)
    return re.sub(r"\s+", " ", value).strip()


def truncate(text: str, length: int = 160) -> str:
    text = str(text or "")
    if len(text) <= length:
        return text
    return text[: max(0, length - 1)].rstrip() + "…"


def now() -> datetime:
    return datetime.now()


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


def parse_iso(value: str) -> datetime:
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return now()


def spoken_time(dt: datetime | None = None) -> str:
    dt = dt or now()
    hour = dt.hour % 12 or 12
    minute = dt.minute
    suffix = "AM" if dt.hour < 12 else "PM"
    if minute == 0:
        return f"{hour} {suffix}"
    return f"{hour}:{minute:02d} {suffix}"


def clock_time(dt: datetime | None = None) -> str:
    dt = dt or now()
    return dt.strftime("%H:%M:%S")


def spoken_date(dt: datetime | None = None) -> str:
    dt = dt or now()
    return dt.strftime("%A, %d %B %Y")


def date_label(dt: datetime | None = None) -> str:
    dt = dt or now()
    return dt.strftime("%d %b %Y")


def greeting_for(dt: datetime | None = None) -> str:
    dt = dt or now()
    hour = dt.hour
    if hour < 5:
        return "Still awake"
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    if hour < 21:
        return "Good evening"
    return "Good evening"


def human_duration(seconds: float) -> str:
    seconds = int(max(0, seconds))
    if seconds < 60:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    minutes, sec = divmod(seconds, 60)
    if minutes < 60:
        if sec == 0:
            return f"{minutes} minute{'s' if minutes != 1 else ''}"
        return f"{minutes} min {sec} sec"
    hours, minutes = divmod(minutes, 60)
    if hours < 24:
        if minutes == 0:
            return f"{hours} hour{'s' if hours != 1 else ''}"
        return f"{hours} hr {minutes} min"
    days, hours = divmod(hours, 24)
    return f"{days} day{'s' if days != 1 else ''} {hours} hr".strip()


def human_size(num_bytes: float) -> str:
    size = float(num_bytes or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} TB"


def human_uptime(seconds: float) -> str:
    seconds = int(max(0, seconds))
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes = rem // 60
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes and not days:
        parts.append(f"{minutes}m")
    return " ".join(parts) or "<1m"


def time_until(dt: datetime, reference: datetime | None = None) -> str:
    reference = reference or now()
    delta = (dt - reference).total_seconds()
    if delta <= 0:
        return "now"
    return f"in {human_duration(delta)}"


def daypart(dt: datetime | None = None) -> str:
    dt = dt or now()
    hour = dt.hour
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


def format_number(value: float | int) -> str:
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int) or (isinstance(value, float) and value.is_integer()):
        return f"{int(value):,}"
    if abs(value) >= 1e9 or (abs(value) < 1e-6 and value != 0):
        return f"{value:.6g}"
    return f"{value:,.4f}".rstrip("0").rstrip(".")


def parse_clock_word(value: str, default_meridiem: str | None = None) -> tuple[int, int] | None:
    """Parse '7:30 pm', '19:45', '7 baje', '7 am' into (hour, minute)."""
    pattern = re.compile(
        r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|baje|bje)?\b",
        re.I,
    )
    match = pattern.search(str(value or ""))
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    marker = (match.group(3) or "").lower().replace(".", "")
    if marker in {"pm"} and hour < 12:
        hour += 12
    elif marker in {"am"} and hour == 12:
        hour = 0
    elif default_meridiem == "pm" and hour < 12:
        hour += 12
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour, minute


def next_occurrence(hour: int, minute: int, reference: datetime | None = None) -> datetime:
    reference = reference or now()
    target = reference.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= reference:
        target += timedelta(days=1)
    return target
