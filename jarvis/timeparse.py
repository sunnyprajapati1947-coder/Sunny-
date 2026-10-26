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


HINGLISH_DURATIONS = (
    (re.compile(r"\b(?:aadha|aadhe|adha|adhe)\s+ghant[ae]\b", re.I), "30 minutes"),
    (re.compile(r"\b(?:dedh|deedh|dhedh)\s+ghant[ae]\b", re.I), "90 minutes"),
    (re.compile(r"\b(?:dhai|dhaai|dhaayi|dhaie)\s+ghant[ae]\b", re.I), "150 minutes"),
    (re.compile(r"\b(?:sawa|sava|sawai)\s+ghant[ae]\b", re.I), "75 minutes"),
    (re.compile(r"\b(?:paune|pone)\s+ghant[ae]\b", re.I), "45 minutes"),
)

CLOCK_IDIOMS = (
    (re.compile(r"\b(?:sawa|sava|sawai)\s+(\d{1,2}|[a-z]+)\s*(?:baje|bje)\b", re.I), 15, 0),
    (re.compile(r"\b(?:saadhe|sadhe|saade)\s+(\d{1,2}|[a-z]+)\s*(?:baje|bje)\b", re.I), 30, 0),
    (re.compile(r"\b(?:paune|pone|pune)\s+(\d{1,2}|[a-z]+)\s*(?:baje|bje)\b", re.I), 45, -1),
    (re.compile(r"\bdedh\s+(?:baje|bje)\b", re.I), 30, 1),
    (re.compile(r"\bdhai\s+(?:baje|bje)\b", re.I), 30, 2),
)

WEEKDAYS = {
    "monday": 0, "mon": 0, "somvaar": 0, "somwar": 0,
    "tuesday": 1, "tue": 1, "mangalvaar": 1, "mangalwar": 1,
    "wednesday": 2, "wed": 2, "budhvaar": 2, "budhwar": 2,
    "thursday": 3, "thu": 3, "guruvaar": 3, "guruwar": 3, "guruvwar": 3,
    "friday": 4, "fri": 4, "shukravaar": 4, "shukrawar": 4,
    "saturday": 5, "sat": 5, "shanivaar": 5, "shaniwar": 5,
    "sunday": 6, "sun": 6, "ravivaar": 6, "raviwar": 6, "itvaar": 6,
}


def _normalize_hinglish(text: str) -> str:
    """Rewrite Hinglish duration idioms into plain minutes so the parser sees numbers."""
    value = str(text or "")
    for pattern, replacement in HINGLISH_DURATIONS:
        value = pattern.sub(replacement, value)
    return value


def _strip_hinglish_duration(text: str) -> str:
    """Remove a Hinglish duration idiom and its preposition from a leftover title."""
    value = str(text or "")
    for pattern, _ in HINGLISH_DURATIONS:
        value = pattern.sub(" ", value)
    value = re.sub(r"\b(?:ke\s+baad|baad|bad|mein|me|later|se|ke)\b", " ", value, flags=re.I)
    return value


def _clock_idiom(text: str) -> tuple[int, int, int, int] | None:
    """Understand “sawa 5 baje”, “paune 5 baje”, “saadhe 5”, “dedh baje”, “dhai baje”."""
    for pattern, minute, shift in CLOCK_IDIOMS:
        found = pattern.search(text)
        if not found:
            continue
        if found.groups():
            raw_hour = _number(found.group(1))
            hour = int(raw_hour) + shift
        else:
            hour = shift
        if not 0 <= hour <= 23:
            continue
        return hour % 24, minute, found.start(), found.end()
    return None


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
    raw = _normalize_hinglish(str(text or "")).lower()
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
        cleaned = _strip_hinglish_duration(raw)
        for pattern in (
            rf"\b{TIME_PREPOSITIONS}\s+[^,.]*?\d[^,.]*?(?:second|minute|min|hour|hr|day|week|sekund|minat|ghanta|ghante|din|hafta)[a-z]*\b",
            r"\b\d+(?:\.\d+)?\s*(?:second|minute|min|hour|hr|day|week)[a-z]*\s+(?:later|baad|bad|ke\s+baad)\b",
            r"\b(?:half|a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|ek|do|teen|char|paanch|panch|saat|aath|nau|das|bees|tees|adha|aadha)\s+"
            r"(?:second|minute|min|hour|hr|day|week|ghanta|ghante|din|hafta)s?\b",
        ):
            stripped = re.sub(pattern, " ", cleaned, count=1, flags=re.I)
            if stripped.strip() != cleaned.strip():
                cleaned = stripped
                break
        else:
            cleaned = DURATION_RE.sub(" ", cleaned, count=1)
        cleaned = re.sub(r"\b(?:me|mein|baad|bad|later|ke|in|after|within)\b", " ", cleaned, flags=re.I)
        return reference + timedelta(seconds=duration), _tidy(cleaned)

    # 2) relative day words + optional clock
    day_offset = 0
    day_pattern = None
    for pattern, offset in (
        (r"\bnext week\b|\bagle\s+hafte?\b", 7),
        (r"\bnext month\b|\bagle\s+mahine\b", 30),
        (r"\bday\s+after\s+tomorrow\b|\bparso\b", 2),
        (r"\btomorrow\b|\bkal\b", 1),
        (r"\btoday\b|\baaj\b", 0),
    ):
        if re.search(pattern, lowered):
            day_offset = offset
            day_pattern = pattern
            break

    if not day_pattern:
        weekday_match = re.search(
            r"\b(?:agle|agley|next)\s+(" + "|".join(WEEKDAYS) + r")\b",
            lowered,
        )
        if weekday_match:
            day_offset = (WEEKDAYS[weekday_match.group(1)] - reference.weekday()) % 7 or 7
            day_pattern = re.escape(weekday_match.group(0))

    # 3) explicit clock: "at 7:30 pm", "7 baje", "subah 8 baje"
    idiom = _clock_idiom(lowered)
    if idiom:
        hour, minute, start, end = idiom
        marker = _meridiem_for(lowered, hour)
        if "pm" in lowered or "raat" in lowered or "shaam" in lowered or "dopahar" in lowered:
            marker = "pm"
        if marker == "pm" and hour < 12:
            hour += 12
        elif marker == "am" and hour == 12:
            hour = 0
        elif marker is None and 1 <= hour <= 7:
            hour += 12
        if hour == 12 and re.search(r"\braat\b", lowered):
            hour = 0
        target = reference.replace(hour=hour % 24, minute=minute, second=0, microsecond=0)
        target += timedelta(days=day_offset)
        if target <= reference:
            target += timedelta(days=1)
        cleaned = raw[:start] + " " + raw[end:]
        if day_pattern:
            cleaned = re.sub(day_pattern, " ", cleaned, flags=re.I)
        cleaned = re.sub(r"\b(?:at|by|around|baje|bje|o'?clock)\b", " ", cleaned, flags=re.I)
        return target, _tidy(cleaned)

    clock_match = None
    for pattern in (
        r"(?:\bat\s+|\bby\s+|\baround\s+)(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)",
        r"(\d{1,2}(?::\d{2})?)\s*(?:baje|bje|o'?clock)",
        r"(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))",
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
            if hour == 12 and re.search(r"\braat\b", lowered):
                hour = 0
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
    idiom = _clock_idiom(lowered)
    if idiom:
        hour, minute, _start, _end = idiom
        marker = _meridiem_for(lowered, hour)
        if "raat" in lowered or "shaam" in lowered or "dopahar" in lowered:
            marker = "pm"
        if marker == "pm" and hour < 12:
            hour += 12
        elif marker == "am" and hour == 12:
            hour = 0
        elif marker is None and 1 <= hour <= 7:
            hour += 12
        if hour == 12 and re.search(r"\braat\b", lowered):
            hour = 0
        return hour, minute
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


MERIDIEM_WORDS = re.compile(
    r"\b(?:subah|savere|dopahar|shaam|sham|raat|morning|afternoon|evening|night)\b",
    re.I,
)

def _tidy(text: str) -> str:
    value = MERIDIEM_WORDS.sub(" ", str(text or ""))
    value = re.sub(r"\bko\b", " ", value)
    value = re.sub(r"\s+", " ", value).strip(" ,.-")
    value = re.sub(r"^(?:to|that|about|for|ki|ke|ka)\s+", "", value, flags=re.I)
    value = re.sub(r"\s+(?:at|par|pe|ko)$", "", value, flags=re.I)
    value = re.sub(r"\s+(?:hai|hain|ha|ho|hoga|hogi|hona|thi|tha)$", "", value, flags=re.I)
    return value.strip(" ,.-")
