"""Notes, tasks, reminders, alarms, memory, calculation and light entertainment."""
from __future__ import annotations

import random
import re
from datetime import datetime, timedelta

from jarvis import calculator as calc
from jarvis.config import get_settings
from jarvis.store import get_store
from jarvis.timeparse import parse_alarm_time, parse_duration, parse_when
from jarvis.util import (
    format_number,
    human_duration,
    human_size,
    now,
    parse_iso,
    reply,
    spoken_time,
    time_until,
    truncate,
)

JOKES = [
    "I would tell you a UDP joke, Sir, but you might not get it.",
    "Why did the neural network go to therapy? It had too many hidden layers.",
    "I asked the compiler for a joke. It said it didn't get the reference.",
    "There are two hard problems in computing: cache invalidation, naming things, and off-by-one errors.",
    "My favourite kind of music is heavy metal — mostly because it is 70 percent of my chassis.",
    "A SQL query walks into a bar, approaches two tables and asks: may I join you?",
    "I would make a joke about recursion, but I would have to make a joke about recursion first.",
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "Artificial intelligence is no match for natural stupidity, Sir — though I keep trying.",
    "I told the router a secret. It leaked it to everyone on the subnet.",
    "Why was the computer cold? It left its Windows open.",
    "I have a joke about time travel, but you did not like it.",
    "A byte walked into a bar and ordered a bit. The bartender asked: light or heavy?",
    "Debugging: being the detective in a crime film where you are also the murderer.",
    "I would love to tell you a chemistry joke, but all the good ones argon.",
    "The cloud is just someone else's computer, Sir — and apparently it also has my jokes.",
    "Why did the AI cross the road? It was trained on chicken data.",
    "My code does not have bugs. It has undocumented features.",
    "Two factor authentication is like wearing two condoms — safe, but one is enough.",
    "I am not saying the printer is evil, Sir, but it only jams when I am watching.",
]

QUOTES = [
    ("Sometimes you gotta run before you can walk.", "Tony Stark"),
    ("The best way to predict the future is to invent it.", "Alan Kay"),
    ("Simplicity is the ultimate sophistication.", "Leonardo da Vinci"),
    ("Any sufficiently advanced technology is indistinguishable from magic.", "Arthur C. Clarke"),
    ("First, solve the problem. Then write the code.", "John Johnson"),
    ("The only way to do great work is to love what you do.", "Steve Jobs"),
    ("It always seems impossible until it is done.", "Nelson Mandela"),
    ("Discipline equals freedom.", "Jocko Willink"),
    ("A ship in harbour is safe, but that is not what ships are built for.", "John A. Shedd"),
    ("Talk is cheap. Show me the code.", "Linus Torvalds"),
    ("You miss 100 percent of the shots you do not take.", "Wayne Gretzky"),
    ("If you are going through hell, keep going.", "Winston Churchill"),
    ("Do or do not. There is no try.", "Yoda"),
    ("The obstacle is the way.", "Marcus Aurelius"),
    ("Vision without execution is hallucination.", "Thomas Edison"),
]

FACTS = [
    "A single bolt of lightning carries enough energy to toast about 100,000 slices of bread, Sir.",
    "Octopuses have three hearts and blue blood.",
    "Honey never spoils — archaeologists have found edible honey in 3,000-year-old tombs.",
    "The first computer bug was a literal moth, logged by Grace Hopper's team in 1947.",
    "Sharks existed before trees. By roughly 50 million years.",
    "There are more possible chess games than atoms in the observable universe.",
    "Bananas are berries; strawberries technically are not.",
    "Mount Everest grows about four millimetres every year.",
    "The Eiffel Tower can be up to 15 centimetres taller in summer.",
    "A day on Venus is longer than its year.",
    "The human brain runs on roughly 20 watts — about a dim light bulb.",
    "The Apollo 11 guidance computer had less memory than a modern calculator.",
    "Wombats produce cube-shaped droppings.",
    "Sea otters hold hands while sleeping so they do not drift apart.",
    "Sound cannot travel through the vacuum of space — explosions are silent out there.",
]


def _list_card(title: str, items: list[str], footer: str = "") -> dict:
    return {"type": "list", "title": title, "items": items, "footer": footer}


# ------------------------------------------------------------------ notes
def note_add(text: str = "") -> dict:
    text = str(text or "").strip()
    if not text:
        return reply("What should I note down, Sir?")
    if get_store().looks_secret(text):
        return reply(
            "I would rather not write credentials into plain text storage, Sir. "
            "Use a password manager for that.",
            speech="I would rather not store credentials in plain text, Sir.",
        )
    item = get_store().add_note(text)
    total = len(get_store().notes(limit=9999))
    return reply(
        f"Noted, Sir. That is note {total}.",
        speech="Noted, Sir.",
        cards=[_list_card("NOTE SAVED", [truncate(text, 180)], f"{total} notes stored")],
        data={"id": item["id"], "total": total},
    )


def notes_list(limit: int = 10) -> dict:
    notes = get_store().notes(limit=max(1, min(50, int(limit or 10))))
    if not notes:
        return reply("Your notebook is empty, Sir.", speech="No notes yet, Sir.")
    items = [
        f"{index}. {truncate(note.get('text', ''), 160)}"
        for index, note in enumerate(notes, 1)
    ]
    return reply(
        f"You have {len(get_store().notes(limit=9999))} note{'s' if len(notes) != 1 else ''}, Sir.",
        speech=f"You have {len(notes)} notes, Sir. The latest is: {truncate(notes[0].get('text', ''), 120)}.",
        cards=[_list_card("NOTEBOOK", items)],
        data={"notes": notes},
    )


def clear_notes() -> dict:
    count = get_store().clear_notes()
    return reply(f"All {count} notes erased, Sir.", speech=f"Erased {count} notes, Sir.")


# ------------------------------------------------------------------ tasks
def todo_add(text: str = "") -> dict:
    text = str(text or "").strip(" :-")
    if not text:
        return reply("What task should I add, Sir?")
    item = get_store().add_todo(text)
    open_count = len(get_store().todos(include_done=False))
    return reply(
        f"Added “{truncate(text, 100)}” to your task list. {open_count} open.",
        speech="Task added, Sir.",
        cards=[_list_card("TASK ADDED", [truncate(text, 180)], f"{open_count} open")],
        data={"id": item["id"], "open": open_count},
    )


def todos_list() -> dict:
    items = get_store().todos()
    if not items:
        return reply("You have no tasks, Sir. A rare and beautiful state.")
    open_tasks = [item for item in items if not item.get("done")]
    rows = []
    for index, item in enumerate(items[:20], 1):
        mark = "✔" if item.get("done") else "•"
        rows.append(f"{mark} {index}. {truncate(item.get('text', ''), 150)}")
    done = len(items) - len(open_tasks)
    speech = (
        f"You have {len(open_tasks)} open task{'s' if len(open_tasks) != 1 else ''}, Sir."
        + (f" The first is: {truncate(open_tasks[0].get('text', ''), 90)}." if open_tasks else " Nothing pending.")
    )
    return reply(
        speech,
        cards=[_list_card(f"TASKS · {len(open_tasks)} OPEN", rows, f"{done} completed")],
        data={"total": len(items), "open": len(open_tasks)},
    )


def todo_done(ref: str = "") -> dict:
    target = get_store().complete_todo(ref)
    if not target:
        return reply(f"I could not find task “{ref}”, Sir.", speech="I could not find that task, Sir.")
    open_count = len(get_store().todos(include_done=False))
    return reply(
        f"Marked “{truncate(target.get('text', ''), 100)}” as done. {open_count} left.",
        speech="Task completed, Sir.",
        data={"open": open_count},
    )


def clear_todos() -> dict:
    count = get_store().clear_todos()
    return reply(f"Task list cleared — {count} entries removed, Sir.", speech="Task list cleared, Sir.")


# -------------------------------------------------------------- reminders
def reminder_add(text: str = "", when: str = "", due: str = "") -> dict:
    text = str(text or "").strip(" :-")
    if not text:
        return reply("What should I remind you about, Sir?")
    target: datetime | None = None
    if due:
        try:
            target = parse_iso(due)
        except Exception:
            target = None
    if target is None:
        target, _ = parse_when(when or "")
    if target is None:
        return reply(
            "When should I remind you, Sir? For example: “at 6:30 pm” or “in 20 minutes”.",
            speech="When should I remind you, Sir?",
            data={"needs_time": True, "text": text},
        )
    item = get_store().add_reminder(text, target)
    return reply(
        f"Reminder set for {target.strftime('%d %b at %I:%M %p')} — “{truncate(text, 90)}”.",
        speech=f"I will remind you {time_until(target)}.",
        cards=[
            {
                "type": "reminder",
                "title": truncate(text, 120),
                "due": target.strftime("%a, %d %b · %I:%M %p"),
                "relative": time_until(target),
            }
        ],
        data={"id": item["id"], "due": item["due"]},
    )


def reminders_list() -> dict:
    items = get_store().reminders()
    if not items:
        return reply("No reminders pending, Sir.", speech="No reminders pending, Sir.")
    rows = [
        f"{index}. {truncate(item.get('text', ''), 110)} — {parse_iso(item.get('due', '')).strftime('%d %b, %I:%M %p')} ({time_until(parse_iso(item.get('due', '')))})"
        for index, item in enumerate(items[:12], 1)
    ]
    first = items[0]
    return reply(
        f"You have {len(items)} reminder{'s' if len(items) != 1 else ''}, Sir. "
        f"The next is {time_until(parse_iso(first.get('due', '')))}.",
        speech=f"You have {len(items)} reminders, Sir. The next is {time_until(parse_iso(first.get('due', '')))}.",
        cards=[_list_card("REMINDERS", rows)],
        data={"items": items},
    )


def reminder_cancel(ref: str = "") -> dict:
    store = get_store()
    items = store.reminders()
    ref = str(ref or "").strip().lower()
    target = None
    if ref.isdigit() and 1 <= int(ref) <= len(items):
        target = items[int(ref) - 1]
    else:
        for item in items:
            if ref and ref in item.get("text", "").lower():
                target = item
                break
    if not target:
        return reply("I could not match that reminder, Sir.")
    store.cancel_reminder(target["id"])
    return reply("Reminder cancelled, Sir.", speech="Reminder cancelled, Sir.")


def clear_reminders() -> dict:
    store = get_store()

    def apply(data: dict) -> int:
        items = data.get("reminders") or []
        pending = [item for item in items if not item.get("fired")]
        data["reminders"] = [item for item in items if item.get("fired")]
        return len(pending)

    removed = store._mutate(apply)
    if not removed:
        return reply("You have no pending reminders, Sir.")
    return reply(
        f"Cleared {removed} pending reminder{'s' if removed != 1 else ''}, Sir.",
        speech=f"Cleared {removed} reminders, Sir.",
    )


# ----------------------------------------------------------------- timers
def timer_set(minutes: float = 0, seconds: float = 0, label: str = "timer") -> dict:
    try:
        total = float(minutes or 0) * 60 + float(seconds or 0)
    except (TypeError, ValueError):
        total = 0
    if total <= 0:
        total = 5 * 60
    total = int(round(min(max(total, 1), 24 * 3600)))
    item = get_store().add_timer(total, label=str(label or "timer"))
    return reply(
        f"Timer armed for {human_duration(total)}, Sir.",
        speech=f"Timer set for {human_duration(total)}, Sir.",
        cards=[
            {
                "type": "timer",
                "label": str(label or "Timer"),
                "duration": human_duration(total),
                "due": item["due"],
                "seconds": total,
            }
        ],
        data={"id": item["id"], "seconds": total, "due": item["due"]},
    )


def timers_list() -> dict:
    items = get_store().timers()
    if not items:
        return reply("No timers running, Sir.")
    rows = [
        f"{truncate(item.get('label', 'Timer'), 40)} — {time_until(parse_iso(item.get('due', '')))} left"
        for item in items[:10]
    ]
    return reply(
        f"{len(items)} timer{'s' if len(items) != 1 else ''} running, Sir.",
        cards=[_list_card("TIMERS", rows)],
    )


def timer_cancel(ref: str = "") -> dict:
    count = get_store().cancel_timer(ref or None)
    if not count:
        return reply("No matching timer, Sir.")
    return reply(f"Cancelled {count} timer{'s' if count != 1 else ''}, Sir.", speech="Timer cancelled, Sir.")


# ----------------------------------------------------------------- alarms
def alarm_set(time: str = "", label: str = "alarm") -> dict:
    parsed = parse_alarm_time(time)
    if not parsed:
        return reply(
            "Tell me a clock time, Sir — for example “set an alarm for 6:30 am”.",
            speech="What time should the alarm be, Sir?",
        )
    hour, minute = parsed
    stamp = f"{hour:02d}:{minute:02d}"
    item = get_store().add_alarm(stamp, label=str(label or "alarm"))
    target = now().replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now():
        target += timedelta(days=1)
    return reply(
        f"Alarm set for {target.strftime('%I:%M %p')} ({'tomorrow' if target.date() != now().date() else 'today'}), Sir.",
        speech=f"Alarm set for {spoken_time(target)}, Sir.",
        cards=[
            {
                "type": "reminder",
                "title": str(label or "Alarm"),
                "due": target.strftime("%a, %d %b · %I:%M %p"),
                "relative": time_until(target),
            }
        ],
        data={"id": item["id"], "time": stamp},
    )


def alarms_list() -> dict:
    items = get_store().alarms()
    if not items:
        return reply("No alarms configured, Sir.")
    rows = [f"{index}. {item.get('time')} — {truncate(item.get('label', 'Alarm'), 60)}" for index, item in enumerate(items, 1)]
    return reply(f"{len(items)} alarm{'s' if len(items) != 1 else ''} configured, Sir.", cards=[_list_card("ALARMS", rows)])


# ----------------------------------------------------------------- memory
def _extract_fact(fact: str) -> tuple[str, str]:
    text = str(fact or "").strip()
    match = re.match(r"(?:that\s+)?my\s+(.+?)\s+(?:is|are|=|hai|hain)\s+(.+)", text, re.I)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    match = re.match(r"(?:that\s+)?i\s+(?:like|love|prefer|hate)\s+(.+)", text, re.I)
    if match:
        return "preference", match.group(1).strip()
    match = re.match(r"(?:that\s+)?(.+?)\s+(?:is|are)\s+(.+)", text, re.I)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return truncate(text, 80), text


def remember(fact: str = "", key: str = "", value: str = "") -> dict:
    raw = str(fact or value or "").strip()
    if key and value:
        fact_key, fact_value = str(key).strip(), str(value).strip()
    else:
        if not raw:
            return reply("What should I remember, Sir?")
        fact_key, fact_value = _extract_fact(raw)
    if get_store().looks_secret(f"{fact_key} {fact_value}"):
        return reply(
            "That looks like a credential, Sir. I keep long-term memory in readable local storage, "
            "so I will not record passwords or keys.",
            speech="I will not store credentials in plain text, Sir.",
        )
    item = get_store().remember(fact_key, fact_value)
    return reply(
        f"Stored: {fact_key} — {truncate(fact_value, 120)}.",
        speech="I will remember that, Sir.",
        cards=[{"type": "memory", "key": fact_key, "value": fact_value}],
        data=item,
    )


def recall(key: str = "") -> dict:
    key = str(key or "").strip()
    if not key:
        facts = get_store().facts()
        if not facts:
            return reply("I have no stored facts yet, Sir.")
        rows = [f"{item['key']}: {truncate(str(item.get('value', '')), 120)}" for item in facts[-12:]]
        return reply(f"I hold {len(facts)} personal facts, Sir.", cards=[_list_card("MEMORY BANK", rows)])
    item = get_store().recall(key)
    if not item:
        return reply(f"I have nothing stored under “{key}”, Sir.", speech="I do not have that in memory, Sir.")
    return reply(
        f"{item['key']}: {item['value']}",
        speech=f"{item['key']} is {item['value']}.",
        cards=[{"type": "memory", "key": item["key"], "value": item["value"]}],
        data=item,
    )


def forget(key: str = "") -> dict:
    if not key:
        return reply("What should I forget, Sir?")
    if get_store().forget(key):
        return reply(f"Forgotten: {key}.", speech="Forgotten, Sir.")
    return reply(f"I had nothing stored under “{key}”, Sir.")


# ----------------------------------------------------------- calculations
def calculate(expression: str = "") -> dict:
    result = calc.safe_eval(expression)
    if not result.get("ok"):
        return reply(f"{result['error']}", speech=result["error"])
    formatted = calc.format_value(result["value"])
    return reply(
        f"{result['expression']} = {formatted}",
        speech=f"That is {formatted}, Sir.",
        cards=[{"type": "math", "expression": result["expression"], "result": formatted}],
        data=result,
    )


def convert_units(value: float = 0, from_unit: str = "", to_unit: str = "") -> dict:
    result = calc.convert(value, from_unit, to_unit)
    if not result.get("ok"):
        return reply(result.get("error", "I cannot convert that, Sir."))
    formatted = calc.format_value(result["value"])
    return reply(
        f"{calc.format_value(float(value))} {from_unit} = {formatted} {to_unit}",
        speech=f"{calc.format_value(float(value))} {from_unit} is {formatted} {to_unit}, Sir.",
        cards=[
            {
                "type": "math",
                "expression": f"{calc.format_value(float(value))} {from_unit} → {to_unit}",
                "result": f"{formatted} {to_unit}",
            }
        ],
        data=result,
    )


# ------------------------------------------------------------ light fun
def joke() -> dict:
    line = random.choice(JOKES)
    return reply(line, speech=line, cards=[{"type": "text", "title": "COMEDY PROTOCOL", "body": line}])


def quote() -> dict:
    text, author = random.choice(QUOTES)
    line = f"“{text}” — {author}"
    return reply(line, speech=text, cards=[{"type": "quote", "text": text, "author": author}])


def fun_fact() -> dict:
    line = random.choice(FACTS)
    return reply(line, speech=line, cards=[{"type": "text", "title": "FUN FACT", "body": line}])


def coin_flip() -> dict:
    side = random.choice(["Heads", "Tails"])
    return reply(f"{side}, Sir.", speech=f"{side}, Sir.", cards=[{"type": "coin", "result": side}])


def roll_dice(sides: int = 6) -> dict:
    sides = max(2, min(1000, int(sides or 6)))
    value = random.randint(1, sides)
    return reply(
        f"A {sides}-sided die lands on {value}, Sir.",
        speech=f"{value}, Sir.",
        cards=[{"type": "dice", "result": value, "sides": sides}],
    )


def random_number(low: int = 1, high: int = 100) -> dict:
    low, high = int(low), int(high)
    if low > high:
        low, high = high, low
    value = random.randint(low, high)
    return reply(
        f"Between {low} and {high}, I choose {value}, Sir.",
        speech=f"{value}, Sir.",
        cards=[{"type": "math", "expression": f"random({low}, {high})", "result": str(value)}],
    )


def briefing() -> dict:
    """Composite morning/evening brief. Best-effort across network-dependent parts."""
    from jarvis.skills import weather as weather_skill
    from jarvis.skills import web as web_skill
    from jarvis import sysinfo

    settings = get_settings()
    store = get_store()
    current = now()
    greeting = (
        "Good morning"
        if current.hour < 12
        else "Good afternoon"
        if current.hour < 17
        else "Good evening"
    )
    lines = [
        f"{greeting}, {settings.owner}.",
        f"It is {current.strftime('%A, %d %B')} · {spoken_time(current)}.",
    ]
    cards: list[dict] = []

    try:
        forecast = weather_skill.weather(settings.city)
        lines.append(forecast.get("speech", forecast.get("text", "")))
        cards.extend(forecast.get("cards", []))
    except Exception:
        lines.append("Weather is unavailable at the moment.")

    metrics = sysinfo.metrics()
    battery = metrics.get("battery") or {}
    if battery.get("present"):
        lines.append(f"Power cell at {battery['percent']} percent{' and charging' if battery.get('plugged') else ''}.")

    open_tasks = [item for item in store.todos() if not item.get("done")]
    if open_tasks:
        lines.append(
            f"You have {len(open_tasks)} open task{'s' if len(open_tasks) != 1 else ''}: "
            + "; ".join(item.get("text", "") for item in open_tasks[:3])
            + "."
        )
        cards.append(
            _list_card(
                "PRIORITIES",
                [item.get("text", "") for item in open_tasks[:5]],
                f"{len(open_tasks)} open",
            )
        )
    else:
        lines.append("Your task list is clear.")

    reminders = store.reminders()
    if reminders:
        first = reminders[0]
        lines.append(
            f"Next reminder: {first.get('text')} at "
            f"{parse_iso(first.get('due', '')).strftime('%I:%M %p')}."
        )

    try:
        headlines = web_skill.news()
        data = headlines.get("data") or {}
        items = data.get("items") or []
        if items:
            lines.append(f"Top headline: {items[0]['title']}.")
            cards.append(headlines["cards"][0])
    except Exception:
        pass

    speech = " ".join(part for part in lines if part)
    text = "\n".join(
        [
            f"**{greeting}, {settings.owner}.**  ",
            f"*{current.strftime('%A, %d %B')} · {spoken_time(current)}*",
            "",
            *[f"- {line}" for line in lines[2:]],
        ]
    )
    return reply(text, speech=speech, cards=cards, data={"city": settings.city})


def history_search(query: str = "") -> dict:
    store = get_store()
    query = str(query or "").strip()
    if query:
        entries = store.search_history(query, limit=6)
        if not entries:
            return reply(f"I found nothing about “{query}” in our conversations, Sir.")
        rows = [
            f"{entry.get('ts', '')[11:16]} · {entry.get('role', '')}: {truncate(entry.get('text', ''), 120)}"
            for entry in entries
        ]
        return reply(
            f"I found {len(entries)} matching message{'s' if len(entries) != 1 else ''}, Sir.",
            cards=[_list_card(f"HISTORY · {truncate(query, 40).upper()}", rows)],
            data={"items": entries},
        )
    entries = store.history(8)
    if not entries:
        return reply("Our conversation log is empty, Sir.")
    rows = [
        f"{entry.get('ts', '')[11:16]} · {entry.get('role', '')}: {truncate(entry.get('text', ''), 120)}"
        for entry in entries
    ]
    return reply(
        f"Here are the last {len(entries)} messages, Sir.",
        cards=[_list_card("RECENT TRANSMISSIONS", rows)],
        data={"items": entries},
    )
