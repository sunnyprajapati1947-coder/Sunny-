"""Natural-language time parsing for reminders, timers and alarms.

Understands English and common Hinglish phrasing:
    "in 10 minutes", "after 2 hours", "10 minute baad"
    "tomorrow at 7:30 am", "kal subah 8 baje"
    "at 6 pm", "shaam 6 baje"
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta

from jarvis.util import now, parse_clock_word

NUMBER_WORDS = {
    "a": 1,
    "an": 1,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "fifteen": 15,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "forty-five": 45,
    "sixty": 60,
    "half": 0.5,
    "ek": 1,
    "do": 2,
    "teen": 3,
    "char": 4,
    "paanch": 5,
    "panch": 5,
    "chhah": 6,
    "chhe": 6,
    "saat": 7,
    "aath": 8,
    "nau": 9,
    "das": 10,
    "bees": 20,
    "tees": 30,
    "adha": 0.5,
    "aadha": 0.5,
}

UNIT_SECONDS = {
    "second": 1,
    "seconds": 1,
    "sec": 1,
    "secs": 1,
    "s": 1,
    "sekund": 1,
    "minute": 60,
    "minutes": 60,
    "min": 60,
    "mins": 60,
    "m": 60,
    "minat": 60,
    "hour": 3600,
    "hours": 3600,
    "hr": 3600,
    "hrs": 3600,
    "h": 3600,
    "ghanta": 3600,
    "ghante": 3600,
    "day": 86400,
    "days": 86400,
    "din": 86400,
    "week": 604800,
    "weeks": 604800,
    "hafta": 604800,
    "hafte": 604800,
}

DURATION_RE = re.compile(
    r"(?P<value>\d+(?:\.\d+)?|" + "|".join(sorted(map(re.escape, NUMBER_WORDS), key=len, reverse=True)) + r")"
    r"\s*(?P<unit>seconds?|secs?|sekund|minutes?|mins?|minat|hours?|hrs?|ghante?|ghanta|days?|din|weeks?|hafte?|hafta)\b",
    re.I,
)

CLOCK_RE = re.compile(
    r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|baje|bje|o'?clock)?\b",
    re.I,
)

TIME_PREPOSITIONS = r"(?:in|after|within|baad|bad|ke\s+baad|mein|me)"
CLOCK_PREPOSITIONS = r"(?:at|around|by|baje|bje)"

MERIDIEM_HINTS = {
    "subah": "am",
    "morning": "am",
    "savere": "am",
    "dopahar": "pm",
    "afternoon": "pm",
    "shaam": "pm",
    "sham": "pm",
    "evening": "pm",
    "raat": "pm",
    "night": "pm",
}


def _number(value: str) -> float:
    lowered = value.lower()
    if lowered in NUMBER_WORDS:
        return float(NUMBER_WORDS[lowered])
    try:
        return float(lowered)
    except ValueError:
        return 0.0


def parse_duration(text: str) -> int | None:
    """Return total seconds from a duration phrase, or None."""
    raw = str(text or "").lower()
    total = 0.0
    matched = False
    for match in DURATION_RE.finditer(raw):
        unit = match.group("unit").lower()
        seconds = UNIT_SECONDS.get(unit)
        if not seconds:
            continue
        value = _number(match.group("value"))
        if value <= 0:
            continue
        total += value * seconds
        matched = True
    if matched and total > 0:
        return int(min(total, 30 * 86400))
    return None


def _meridiem_for(text: str, hour: int) -> str | None:
    lowered = str(text or "").lower()
    for word, marker in MERIDIEM_HINTS.items():
        if re.search(rf"\b{word}\b", lowered):
            return marker
    if hour > 12:
        return None
    if hour == 12:
        return "pm"
    return None


def parse_when(text: str, reference: datetime | None = None) -> tuple[datetime | None, str]:
    """Parse a schedule from free text.

    Returns (datetime, cleaned_text_without_time_phrase).
    """
    reference = reference or now()
    raw = str(text or "").strip()
    lowered = raw.lower()

    # 1) relative duration: "in 10 minutes", "10 minute baad"
    duration = parse_duration(raw)
    if duration:
        for pattern in (
            rf"\b{TIME_PREPOSITIONS}\s+[^,.]*?\d[^,.]*?(?:second|minute|min|hour|hr|day|week|sekund|minat|ghanta|ghante|din|hafta)[a-z]*\b",
            r"\b\d+(?:\.\d+)?\s*(?:second|minute|min|hour|hr|day|week)[a-z]*\s+(?:later|baad|bad|ke\s+baad)\b",
            r"\b(?:half|a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|ek|do|teen|char|paanch|panch|saat|aath|nau|das|bees|tees|adha|aadha)\s+"
            r"(?:second|minute|min|hour|hr|day|week|ghanta|ghante|din|hafta)s?\b",
        ):
            cleaned = re.sub(pattern, " ", raw, count=1, flags=re.I)
            if cleaned.strip() != raw.strip():
                raw = cleaned
                break
        else:
            raw = DURATION_RE.sub(" ", raw, count=1)
        return reference + timedelta(seconds=duration), _tidy(raw)

    # 2) relative day words + optional clock
    day_offset = 0
    day_pattern = None
    for pattern, offset in (
        (r"\bday\s+after\s+tomorrow\b|\bparso\b", 2),
        (r"\btomorrow\b|\bkal\b", 1),
        (r"\btoday\b|\baaj\b", 0),
    ):
        if re.search(pattern, lowered):
            day_offset = offset
            day_pattern = pattern
            break

    # 3) explicit clock: "at 7:30 pm", "7 baje", "subah 8 baje"
    clock_match = None
    for pattern in (
        r"(?:\bat\s+|\bby\s+|\baround\s+)(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)",
        r"(\d{1,2}(?::\d{2})?)\s*(?:baje|bje|o'?clock)",
        r"(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?))",
    ):
        match = re.search(pattern, lowered)
        if match:
            clock_match = match
            break

    if clock_match:
        clock_value = clock_match.group(1)
        parsed = parse_clock_word(clock_value)
        if parsed:
            hour, minute = parsed
            marker = _meridiem_for(lowered, hour)
            if "pm" in clock_value or "p.m" in clock_value:
                marker = "pm"
            elif "am" in clock_value or "a.m" in clock_value:
                marker = "am"
            if marker == "pm" and hour < 12:
                hour += 12
            elif marker == "am" and hour == 12:
                hour = 0
            elif marker is None and 1 <= hour <= 7:
                # Jarvis default: ambiguous early hours are PM (e.g. "at 5" -> 5 PM)
                hour += 12
            target = reference.replace(hour=hour % 24, minute=minute, second=0, microsecond=0)
            target += timedelta(days=day_offset)
            if target <= reference:
                target += timedelta(days=1)
            cleaned = raw
            if clock_match:
                cleaned = cleaned[: clock_match.start()] + " " + cleaned[clock_match.end():]
            if day_pattern:
                cleaned = re.sub(day_pattern, " ", cleaned, flags=re.I)
            cleaned = re.sub(r"\b(at|by|around|baje|bje|o'?clock)\b", " ", cleaned, flags=re.I)
            return target, _tidy(cleaned)

    # 4) relative day only, default 9 AM (or +1 min if today already past)
    if day_pattern:
        target = (reference + timedelta(days=day_offset)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )
        if target <= reference:
            target = reference + timedelta(minutes=1)
        cleaned = re.sub(day_pattern, " ", raw, flags=re.I)
        return target, _tidy(cleaned)

    return None, _tidy(raw)


def parse_alarm_time(text: str, reference: datetime | None = None) -> tuple[int, int] | None:
    reference = reference or now()
    lowered = str(text or "").lower()
    match = re.search(
        r"(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|baje|bje|o'?clock)?",
        lowered,
    )
    if not match:
        return None
    parsed = parse_clock_word(match.group(0))
    if not parsed:
        return None
    hour, minute = parsed
    marker = _meridiem_for(lowered, hour)
    if re.search(r"\bp\.?m\.?", lowered):
        marker = "pm"
    elif re.search(r"\ba\.?m\.?", lowered):
        marker = "am"
    if marker == "pm" and hour < 12:
        hour += 12
    elif marker == "am" and hour == 12:
        hour = 0
    elif marker is None and 1 <= hour <= 7:
        hour += 12
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour, minute


def _tidy(text: str) -> str:
    value = re.sub(r"\s+", " ", str(text or "")).strip(" ,.-")
    value = re.sub(r"^(?:to|that|about|for|ki|ke|ka)\s+", "", value, flags=re.I)
    value = re.sub(r"\s+(?:at|par|pe|ko)$", "", value, flags=re.I)
    return value.strip(" ,.-")
