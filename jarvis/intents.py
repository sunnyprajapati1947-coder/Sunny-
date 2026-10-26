"""Deterministic natural-language understanding for J.A.R.V.I.S.

The intent engine is the offline backbone: it recognises commands in English and
common Hinglish phrasing without any model call. Anything it cannot match is
handed to the neural brain (Gemini / local Qwen) and finally to the offline
personality core.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

from jarvis import calculator as calc
from jarvis.timeparse import parse_alarm_time, parse_duration, parse_when
from jarvis.util import clean, now


@dataclass
class Intent:
    kind: str  # "tool" | "chat" | "ui"
    name: str
    args: dict = field(default_factory=dict)
    label: str = ""
    soft: bool = False

    def __post_init__(self):
        if not self.label:
            self.label = self.name


def _tool(tool_name: str, /, **args) -> Intent:
    return Intent("tool", tool_name, {key: value for key, value in args.items() if value not in (None, "")})


def _chat(chat_name: str, /, **args) -> Intent:
    return Intent("chat", chat_name, args)


def _ui(action: str) -> Intent:
    return Intent("ui", action)


WAKE_RE = re.compile(r"^\s*(?:hey|ok|okay|oye|yo)?\s*jarvis\s*[,!.:\-]*\s*", re.I)
POLITE_RE = re.compile(
    r"^(?:please|pls|kindly|jarvis)\s+|^(?:can|could|would|will)\s+you\s+(?:please\s+)?|"
    r"^(?:kya\s+(?:tum|aap)\s+)?|^(?:mujhe|mere liye)\s+",
    re.I,
)

STOPWORDS = {
    "the",
    "a",
    "an",
    "today",
    "tomorrow",
    "now",
    "currently",
    "right",
    "please",
    "sir",
    "hai",
    "hain",
    "ka",
    "ki",
    "kya",
    "kaisa",
    "kaisi",
}


def _strip(raw: str) -> str:
    text = clean(raw)
    text = WAKE_RE.sub("", text)
    for _ in range(2):
        stripped = POLITE_RE.sub("", text).strip()
        if stripped == text:
            break
        text = stripped
    text = text.strip(" ,.!")
    # keep a trailing "-" when it is part of a path such as "Sunny-"
    if "/" not in text and "~" not in text:
        text = text.strip("-")
    return text


def _city_from(text: str, settings_city: str) -> str:
    match = re.search(
        r"\b(?:in|at|of|for|around|near|ka|ki)\s+([A-Za-z][A-Za-z .'\-]{1,40})\s*[?.!]*$",
        text,
        re.I,
    )
    if not match:
        return ""
    candidate = re.sub(r"\b(?:today|tomorrow|now|currently|please|sir|hai|hain|weather|mausam)\b", "", match.group(1), flags=re.I)
    candidate = re.sub(r"\s+", " ", candidate).strip(" ,.-")
    if not candidate or candidate.lower() in STOPWORDS:
        return ""
    return candidate[:40]


def _looks_math(expression: str) -> bool:
    value = str(expression or "").strip()
    if not value or not re.search(r"\d", value):
        return False
    if re.fullmatch(r"[0-9\s()+\-*/.%^×÷,]+", value) and re.search(r"[+\-*/%^×÷]", value):
        return True
    return bool(
        re.search(r"\d\s*(?:\+|-|\*|/|%|\^|×|÷|plus|minus|times|multiplied|divided|power|percent)", value, re.I)
        or re.match(r"^(?:sqrt|square\s+root|log|sin|cos|tan|factorial)\b", value, re.I)
        or re.search(r"\d\s*(?:!|factorial\b|ka factorial\b)", value, re.I)
    )


def _math_expression(text: str) -> str | None:
    stripped = re.sub(
        r"^(?:calculate|compute|solve|evaluate|what(?:'s| is)|whats|how much is|kitna hota hai|kitna hai)\s+",
        "",
        text,
        flags=re.I,
    ).strip(" ?=")
    if _looks_math(stripped):
        return stripped
    return None


def _extract_news_topic(text: str) -> str:
    match = re.search(r"\b(?:news|headlines|samachar|khabar)\s+(?:about|on|of|for|regarding)\s+(.+)", text, re.I)
    if match:
        return match.group(1).strip(" ?.!")
    match = re.search(r"^(.+?)\s+(?:news|samachar|headlines)$", text, re.I)
    if match:
        return match.group(1).strip(" ?.!")
    return ""


def match(raw: str, reference: datetime | None = None) -> Intent | None:
    reference = reference or now()
    text = _strip(raw)
    if not text:
        return None
    low = text.lower().strip()
    words = low.split()

    # ---------------------------------------------------------- control
    if re.fullmatch(
        r"(?:stop|stop it|be quiet|quiet|silence|shut up|chup|chup ho jao|chup raho|shant|stop talking|stop speaking|be silent|enough)[\s!.]*",
        low,
    ):
        return _ui("stop_speech")
    if re.fullmatch(r"(?:clear|clean)(?: the)? (?:chat|screen|log|console|messages)", low) or low == "clear screen":
        return _ui("clear_chat")
    if re.fullmatch(r"(?:repeat(?: that| it)?|say (?:that|it) again|phir se bolo|kya kaha|repeat please)", low):
        return _ui("repeat")
    if low in {"standby", "go to standby", "sleep mode jarvis"}:
        return _ui("standby")

    # ------------------------------------------------------------ small talk
    if re.fullmatch(
        r"(?:hello|hi|hey|yo|namaste|namaskar|salaam|greetings|good morning|good afternoon|good evening|sup|what'?s up|wassup|hii+|helo)[\s!.?]*",
        low,
    ):
        return _chat("greeting")
    if re.search(r"\b(?:how are you|how'?s it going|how is it going|how do you feel|are you (?:ok|okay|fine)|kaise ho|kaisa hai|kya haal|haal chaal|kaise ho aap)\b", low):
        return _chat("how_are_you")
    if re.search(r"\b(?:who are you|what are you|tum kaun|aap kaun|kaun ho|your name|what'?s your name|introduce yourself|tell me about yourself|about you)\b", low):
        return _chat("identity")
    if re.search(r"\b(?:who is your (?:boss|owner|creator|maker|developer)|who made you|who created you|kisne banaya|tumhara malik|who built you)\b", low):
        return _chat("creator")
    if low in {"help", "help me", "commands", "command list"} or re.search(
        r"\b(?:what can you do|what can i ask|what do you do|capabilities|features|kya kar sakte ho|tum kya kar sakte|what are your skills|list commands)\b",
        low,
    ):
        return _chat("capabilities")
    if re.fullmatch(r"(?:thanks|thank you|thanks a lot|thank you so much|thx|ty|shukriya|dhanyavad|dhanyawad|bahut dhanyavad)[\s!.]*", low):
        return _chat("thanks")
    if re.fullmatch(r"(?:bye|byee?|goodbye|good bye|see you|see ya|good night|shubh ratri|shubh raatri|so jao|band ho jao|tata)[\s!.]*", low):
        return _chat("farewell")
    if re.search(r"\b(?:good job|well done|nice work|great work|you are awesome|you'?re awesome|you are great|you'?re great|you are the best|shabash|badhiya|kya baat)\b", low):
        return _chat("compliment")
    if re.search(r"\bi love you\b|\blove you\b|\bmarry me\b", low):
        return _chat("affection")
    if re.search(r"\b(?:i am|i'?m|feeling|mood)\s+(?:sad|tired|stressed|anxious|bored|low|down|worried|happy|excited|great)\b|\bmood (?:kharab|acha|accha)\b", low):
        mood = "sad" if re.search(r"sad|tired|stressed|anxious|bored|low|down|worried|kharab", low) else "happy"
        return _chat("mood", mood=mood)
    if re.search(r"\b(?:are you (?:there|awake|online|listening)|jarvis suno|suno jarvis)\b", low):
        return _chat("present")
    if re.fullmatch(r"(?:sing|sing a song|sing something|gaao|gaana sunao|ek gaana sunao)[\s!.]*", low):
        return _chat("sing")
    if re.search(r"\b(?:tell me a story|story sunao|ek kahani|bedtime story)\b", low):
        return _chat("story")
    if re.search(r"\b(?:i am iron man|i'?m iron man|main iron man hoon)\b", low):
        return _chat("iron_man")
    if "pod bay doors" in low:
        return _chat("hal")
    if re.search(r"\b(?:do you sleep|do you dream|are you real|are you human|can you think|do you have feelings|are you alive)\b", low):
        return _chat("existence")

    # ----------------------------------------------------------- productivity metadata
    if re.search(r"\b(?:what'?s on my plate|what is on my plate|my plate|what'?s on my list|what is on my list)\b", low):
        return _tool("todos_list")
    if re.search(r"\b(?:what did i (?:say|ask|tell you)|what did we talk about|search (?:the )?history|conversation history)\b", low):
        query = ""
        match_obj = re.search(r"(?:about|regarding)\s+(.+)", text, re.I)
        if match_obj:
            query = match_obj.group(1).strip(" ?.")
        return _tool("history_search", query=query)

    # ---------------------------------------------------------------- reports
    if re.fullmatch(
        r"(?:status|status report|system status|diagnostics?|diagnostic report|system report|systems report|report|full report|run diagnostics?|system check)[\s!.]*",
        low,
    ) or "status report" in low or "run diagnostics" in low:
        return _tool("status_report")
    if re.search(r"\b(?:brief me|briefing|morning briefing|evening briefing|daily briefing|update me|what'?s the plan|what is the plan|aaj ka plan|start my day|daily report)\b", low):
        return _tool("briefing")
    if re.search(r"\b(?:battery|power cell|charge level|charging level|kitni battery)\b", low):
        return _tool("battery_status")
    if re.search(
        r"\b(?:internet|network|net|wifi|wi-?fi|broadband)\s+(?:speed|quality|check|test)\b"
        r"|\b(?:speed test|speedtest|bandwidth|download speed|upload speed|connection speed"
        r"|internet speed test|net speed)\b",
        low,
    ):
        return _tool("internet_speed")
    if re.search(r"\b(?:ip address|my ip|network info|network information|wifi info|connection info|am i online)\b", low):
        return _tool("network_info")
    if re.search(r"\b(?:cpu|processor|ram usage|memory usage|disk space|storage space|system usage|resource usage)\b", low):
        return _tool("system_status")

    # ---------------------------------------------------------------- time
    if re.fullmatch(r"(?:the\s+)?(?:time|clock|samay)[\s!.?]*", low) or re.search(
        r"\b(?:what(?:'s| is) the time|what time is it|current time|time kya|kitne baje"
        r"|samay kya|time hai|tell me the time|time please|what'?s the clock)\b",
        low,
    ):
        return _tool("get_time")
    if re.fullmatch(r"(?:the\s+)?(?:date|today'?s date|date today|aaj ki date)[\s!.?]*", low) or re.search(
        r"\b(?:what(?:'s| is) the date|today'?s date|aaj ki tarikh|aaj ki date|what day is it"
        r"|which day is it|date kya|today date)\b",
        low,
    ):
        return _tool("get_date")

    # ------------------------------------------------------------- weather
    if re.search(r"\b(?:weather|temperature|mausam|barish|raining|rain today|forecast|humidity|how hot|how cold|garmi|sardi)\b", low):
        city = _city_from(text, "")
        return _tool("weather", city=city)

    # ----------------------------------------------------------------- news
    if re.search(r"\b(?:news|headlines|samachar|khabar)\b", low):
        return _tool("news", topic=_extract_news_topic(text))

    # -------------------------------------------------------------- leisure
    # ------------------------------------------------------- advice + welcome
    if re.search(
        r"\b(?:random advice|give me (?:some |an? )?advice|advice chahiye|koi advice"
        r"|motivate me|motivation do|inspire me|something motivational)\b",
        low,
    ):
        return _tool("random_advice")
    if re.fullmatch(
        r"(?:i'?m|i am) (?:home|back|here)|(?:daddy|dad)(?:'s| is) home|welcome me"
        r"|wake up(?: jarvis)?|jarvis wake up|ghar aa gaya(?: hoon)?|main aa gaya",
        low,
    ):
        return _tool("wake_greeting")

    if re.search(r"\b(?:joke|jokes|chutkula|make me laugh|something funny)\b", low):
        return _tool("joke")
    if re.search(r"\b(?:quote|quotes|shayari)\b", low):
        return _tool("quote")
    if re.search(r"\b(?:fun fact|interesting fact|random fact|tell me something interesting|tell me a fact)\b", low):
        return _tool("fun_fact")
    if re.search(r"\b(?:flip a coin|coin toss|toss a coin|heads or tails|sikka uchalo)\b", low):
        return _tool("coin_flip")
    if re.search(r"\b(?:roll (?:a |the )?(?:dice|die)|roll dice|dice roll|pasa)\b", low):
        sides_match = re.search(r"(\d+)\s*[- ]?sided", low)
        return _tool("roll_dice", sides=int(sides_match.group(1)) if sides_match else None)
    if re.search(r"\b(?:random number|random integer)\b", low):
        pair = re.search(r"between\s+(\d+)\s+and\s+(\d+)", low)
        if pair:
            return _tool("random_number", low=int(pair.group(1)), high=int(pair.group(2)))
        return _tool("random_number")

    # ---------------------------------------------------------------- memory
    remember_match = re.match(r"^(?:remember|yaad rakh(?:o|na)?|learn)(?:\s+that|\s+this)?[:,]?\s+(.+)$", text, re.I)
    if remember_match and not re.match(r"^(?:remember to|yaad rakhna ki|yaad rakhna)\b", low):
        body = remember_match.group(1).strip()
        return _tool("remember", fact=body)
    recall_match = re.match(r"^(?:what(?:'s| is)|whats)\s+my\s+(.+?)[?]?$", text, re.I)
    if recall_match:
        return _tool("recall", key=recall_match.group(1).strip())
    recall_match = re.match(r"^(?:do you remember|recall)\s+(?:my\s+|about\s+)?(.+?)[?]?$", text, re.I)
    if recall_match:
        return _tool("recall", key=recall_match.group(1).strip())
    forget_match = re.match(r"^forget(?:\s+about|\s+that)?\s+(.+)$", text, re.I)
    if forget_match:
        return _tool("forget", key=forget_match.group(1).strip())

    # ---------------------------------------------------------------- notes
    if re.fullmatch(r"(?:my\s+|show\s+|list\s+|open\s+)?notes?[\s!.?]*", low) or re.search(
        r"\b(?:my notes|show notes|list notes|read notes|notes dikhao|what are my notes|notes list|open notes)\b",
        low,
    ):
        return _tool("notes_list")
    if re.fullmatch(r"(?:clear|delete|erase)(?: all)? notes", low):
        return _tool("clear_notes")
    note_match = re.match(
        r"^(?:make|create|add|take|write|save)?\s*(?:a\s+)?note(?:\s+down)?(?:\s+that|\s+this|[:,]|\s+-)?\s*(.+)$",
        text,
        re.I,
    )
    if note_match and len(note_match.group(1).strip()) > 1:
        return _tool("note_add", text=note_match.group(1).strip())
    note_match = re.match(r"^(?:note likho|note likh do|likh lo)\s*[:,]?\s*(.+)$", text, re.I)
    if note_match:
        return _tool("note_add", text=note_match.group(1).strip())

    # ------------------------------------------------------------ plan steps
    plan_step = re.match(
        r"^(?:step|task)\s+(\d+)\s+(?:of|in)\s+(?:the\s+)?plan\s+(.+?)\s+(?:is\s+)?"
        r"(?:done|complete|completed|finished|ho gaya|kar do|karo)$",
        text,
        re.I,
    )
    if plan_step:
        return _tool("plan_update", ref=plan_step.group(2).strip(" ?.!"), step=plan_step.group(1))
    plan_step = re.match(
        r"^(?:complete|tick|finish|mark)\s+(?:step\s+)(\d+)\s+(?:of|in)\s+(?:the\s+)?plan\s+(.+)$",
        text,
        re.I,
    )
    if plan_step:
        return _tool("plan_update", ref=plan_step.group(2).strip(" ?.!"), step=plan_step.group(1))

    # ---------------------------------------------------------------- tasks
    if re.search(r"\b(?:my (?:todo|to-do|task|to do)s?|show (?:todo|tasks)|list (?:todo|tasks)|todo list|task list|kaam kya|pending tasks)\b", low):
        return _tool("todos_list")
    if re.fullmatch(r"(?:clear|delete|erase)(?: all)? (?:tasks|todos|to-dos|to dos)", low):
        return _tool("clear_todos")
    done_match = re.match(r"^(?:mark\s+)?(?:task\s+)?(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished|ho gaya)$", text, re.I)
    if (
        done_match
        and "plan" not in low
        and not re.match(r"^(?:done|complete|finish)$", done_match.group(1).strip(), re.I)
    ):
        return _tool("todo_done", ref=done_match.group(1).strip())
    done_match = re.match(r"^(?:complete|finish|done)\s+(?:task\s+)(\d+)$", text, re.I)
    if done_match:
        return _tool("todo_done", ref=done_match.group(1))
    todo_match = re.match(
        r"^(?:add|create|new)\s+(?:a\s+)?(?:task|todo|to-do|to do)(?:\s+(?:called|named))?[:\-]?\s*(.+)$",
        text,
        re.I,
    )
    if todo_match:
        return _tool("todo_add", text=todo_match.group(1).strip())
    todo_match = re.match(r"^(?:task|todo)\s+add\s+(.+)$", text, re.I)
    if todo_match:
        return _tool("todo_add", text=todo_match.group(1).strip())
    todo_match = re.match(r"^(?:add to my (?:todo|task) list)[:\-]?\s*(.+)$", text, re.I)
    if todo_match:
        return _tool("todo_add", text=todo_match.group(1).strip())
    todo_match = re.match(r"^(?:kaam likho|task likho)\s*[:,]?\s*(.+)$", text, re.I)
    if todo_match:
        return _tool("todo_add", text=todo_match.group(1).strip())

    # ------------------------------------------------------------ reminders
    if re.match(r"^(?:cancel|clear|remove|delete|drop)\s+(?:all\s+)?(?:of\s+)?(?:my\s+)?(?:reminders|reminder list)\b", low):
        return _tool("reminders_clear")
    if re.search(r"\b(?:my reminders|show reminders|reminders|reminder list|yaad dilana list)\b", low) and not re.search(r"remind me", low):
        return _tool("reminders_list")
    reminder_match = re.match(
        r"^(?:remind me(?:\s+to|\s+about)?|set (?:a\s+)?reminder(?:\s+to|\s+for)?|"
        r"yaad dila(?:o|na)?(?:\s+ki)?|yaad rakhna(?:\s+ki)?)\s+(.+)$",
        text,
        re.I,
    )
    if reminder_match:
        body = reminder_match.group(1).strip()
        due, cleaned = parse_when(body, reference)
        if due:
            return _tool("reminder_add", text=cleaned or body, due=due.isoformat())
        return _tool("reminder_add", text=body)
    trailing_reminder = re.match(
        r"^(.+?)\s+(?:yaad\s+dila(?:o|na|do|ao)|yaad\s+rakhna|yaad\s+rakho|"
        r"remind\s+me|reminder\s+(?:laga|set)\s*do)$",
        text,
        re.I,
    )
    if trailing_reminder and not re.match(r"^(?:remember|yaad rakh(?:o|na)?)\b", low):
        body = trailing_reminder.group(1).strip()
        due, cleaned = parse_when(body, reference)
        if due:
            return _tool("reminder_add", text=cleaned or body, due=due.isoformat())
        return _tool("reminder_add", text=body)
    if re.match(r"^remember to\b", low):
        body = re.sub(r"^remember to\s+", "", text, flags=re.I)
        due, cleaned = parse_when(body, reference)
        return _tool("reminder_add", text=cleaned or body, due=due.isoformat() if due else None)

    # --------------------------------------------------------------- timers
    if re.search(r"\b(?:my timers|running timers|timer list)\b", low):
        return _tool("timers_list")
    cancel_timer = re.match(r"^(?:cancel|stop|remove)\s+(?:the\s+)?timer(?:\s+(.+))?$", text, re.I)
    if cancel_timer:
        return _tool("timer_cancel", ref=cancel_timer.group(1) or "")
    if re.search(r"\btimer\b", low) and not re.search(r"\b(?:cancel|stop|remove|list|running|my timers)\b", low):
        seconds = parse_duration(text)
        if seconds:
            if seconds < 60:
                return _tool("timer_set", seconds=seconds, label="Timer")
            return _tool("timer_set", minutes=round(seconds / 60, 3), label="Timer")
        bare = re.search(r"\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b", low)
        if bare:
            amount = float(bare.group(1))
            if bare.group(2).startswith("h"):
                amount *= 60
            return _tool("timer_set", minutes=amount, label="Timer")
        return _tool("timer_set", minutes=5, label="Timer")

    # --------------------------------------------------------------- alarms
    if re.fullmatch(r"(?:my |show )?alarms?|alarm list", low):
        return _tool("alarms_list")
    alarm_match = re.match(r"^(?:set\s+)?(?:an?\s+)?alarm(?:\s+for|\s+at)?\s*(.+)$", text, re.I)
    if alarm_match:
        body = alarm_match.group(1).strip()
        if parse_alarm_time(body):
            return _tool("alarm_set", time=body, label="Alarm")
        return _tool("alarm_set", time=body, label="Alarm")

    # ------------------------------------------------------------ messaging
    auto_wa = re.match(
        r"^(?:auto(?:matically)?\s+send\s+whatsapp|send\s+whatsapp\s+automatically|whatsapp\s+auto(?:\s*send)?)\s+(?:to\s+)?(.+?)(?:\s*(?:saying|:|that|message)\s*(.+))?$",
        text,
        re.I,
    )
    if auto_wa:
        return _tool(
            "whatsapp_autosend",
            contact=auto_wa.group(1).strip(" ,:."),
            message=(auto_wa.group(2) or "").strip(),
        )
    direct_email = re.match(
        r"^(?:send\s+)?(?:an?\s+)?(?:email|mail)\s+directly\s+to\s+(\S+@\S+)"
        r"(?:\s+(?:about|with subject|subject)\s+(.+?))?(?:\s+(?:saying|body)\s+(.+))?$",
        text,
        re.I,
    )
    if direct_email:
        return _tool(
            "email_send",
            to=direct_email.group(1),
            subject=(direct_email.group(2) or "").strip(),
            body=(direct_email.group(3) or "").strip(),
        )
    calendar_match = re.match(
        r"^(?:schedule|calendar(?:\s+(?:event|entry|it))?|add\s+(?:an?\s+)?(?:calendar\s+)?event)\s+(.+)$",
        text,
        re.I,
    )
    if calendar_match:
        body = calendar_match.group(1).strip()
        if parse_when(body, reference=now())[0] is not None:
            return _tool("calendar_event", title="", when=body)
        return _tool("calendar_event", title=body, when="")

    # ------------------------------------------------------------ messaging
    whatsapp_match = re.match(
        r"^(?:send\s+)?(?:a\s+)?whatsapp(?:\s+message)?\s+(?:to\s+)?(.+?)(?:\s*(?:saying|that|message|:)\s*(.+))?$",
        text,
        re.I,
    )
    if whatsapp_match:
        return _tool("whatsapp_send", contact=whatsapp_match.group(1).strip(" :"), message=(whatsapp_match.group(2) or "").strip())
    hinglish_wa = re.match(r"^(.+?)\s+ko\s+whatsapp\s+(?:karo|bhejo|kar do)\s*(.*)$", text, re.I)
    if hinglish_wa:
        return _tool("whatsapp_send", contact=hinglish_wa.group(1).strip(), message=(hinglish_wa.group(2) or "").strip())
    email_match = re.match(
        r"^(?:send\s+)?(?:an?\s+)?(?:email|mail)\s+(?:to\s+)?(\S+@\S+)(?:\s+(?:about|with subject|subject)\s+(.+?))?(?:\s+(?:saying|body)\s+(.+))?$",
        text,
        re.I,
    )
    email_ask = re.match(r"^(?:send\s+)?(?:an?\s+)?(?:email|mail)\s+(?:to\s+)?(.+)$", text, re.I)
    if email_ask and "@" not in email_ask.group(1):
        return Intent(
            kind="reply",
            name="clarify",
            args={
                "text": "I need an email address for that, Sir. Say “email someone@example.com about …”.",
                "speech": "I need an email address for that, Sir.",
            },
            label="clarify",
        )
    if email_match:
        return _tool(
            "email_compose",
            to=email_match.group(1),
            subject=(email_match.group(2) or "").strip(),
            body=(email_match.group(3) or "").strip(),
        )
    call_match = re.match(r"^(?:call|dial|phone)\s+(.+)$", text, re.I)
    if call_match and call_match.group(1).strip().lower() not in {"me", "a cab", "an ambulance"}:
        return _tool("call_contact", contact=call_match.group(1).strip())
    if re.search(r"\b(?:my contacts|show contacts|contact list|phone book)\b", low):
        return _tool("list_contacts")
    save_contact = re.match(
        r"^(?:save|add)\s+(?:contact\s+)?(.+?)(?:'s)?\s+(?:number|phone|email|contact)(?:\s+(?:as|is))?\s+(\S+@\S+|\+?[\d][\d\s\-()]{7,})$",
        text,
        re.I,
    )
    if save_contact:
        name, value = save_contact.group(1).strip(), save_contact.group(2).strip()
        if "@" in value:
            return _tool("save_contact", name=name, email=value)
        return _tool("save_contact", name=name, phone=value)
    save_contact_bare = re.match(r"^(?:save|add)\s+(?:a\s+)?contact\s+(?:for\s+|named\s+)?(.+)$", text, re.I)
    if save_contact_bare:
        return _tool("save_contact", name=save_contact_bare.group(1).strip(" .'"))

    # --------------------------------------------------------------- files
    read_file = re.match(
        r"^(?:read|cat|show|print)\s+(?:me\s+)?(?:the\s+)?(?:contents?\s+(?:of|in)\s+)?file\s+(.+)$",
        text,
        re.I,
    ) or re.match(r"^(?:read|cat)\s+(\S+\.\w{1,8})$", text, re.I)
    if read_file:
        return _tool("read_file", path=read_file.group(1).strip())
    read_inside = re.match(r"^(?:what(?:'s| is)\s+(?:inside|in)|show contents of)\s+(?:the\s+)?file\s+(.+)$", text, re.I)
    if read_inside:
        return _tool("read_file", path=read_inside.group(1).strip())
    list_match = re.match(r"^(?:list|show)\s+(?:the\s+)?(?:files|folders|directory|contents)(?:\s+(?:in|at|of)\s+(.+))?$", text, re.I)
    if list_match:
        return _tool("list_dir", path=(list_match.group(1) or "").strip() or None)
    ls_match = re.match(r"^ls(?:\s+(.+))?$", text, re.I)
    if ls_match:
        return _tool("list_dir", path=(ls_match.group(1) or "").strip() or None)
    find_file = re.match(r"^(?:find|locate|search for)\s+(?:a\s+)?file(?:\s+(?:named|called|name))?\s+(.+)$", text, re.I)
    if find_file:
        return _tool("find_file", name=find_file.group(1).strip())
    create_file = re.match(
        r"^(?:create|make|write)\s+(?:a\s+)?file(?:\s+(?:named|called|name))?\s+([^\s]+?)(?:\s+(?:with|containing|content|text)\s+(.+))?$",
        text,
        re.I,
    )
    if create_file:
        return _tool("create_file", path=create_file.group(1), content=(create_file.group(2) or "").strip())
    delete_file = re.match(r"^(?:delete|remove|erase)\s+(?:the\s+)?file\s+(.+)$", text, re.I)
    if delete_file:
        return _tool("delete_file", path=delete_file.group(1).strip())
    patch = re.match(
        r"^(?:in\s+(?:the\s+)?file\s+(?P<before>.+?),?\s*)?"
        r"(?:edit|patch|change|replace)\s+(?:the\s+)?(?P<find>.+?)\s+(?:with|to|by)\s+(?P<replace>.+?)"
        r"(?:\s+in\s+(?:the\s+)?file\s+(?P<after>.+))?$",
        text,
        re.I,
    )
    if patch:
        target = (patch.group("before") or patch.group("after") or "").strip().strip("\"'")
        snippet = patch.group("find").strip().strip("\"'")
        replacement = patch.group("replace").strip()
        if target and snippet:
            return _tool("edit_file", path=target, find=snippet, replace=replacement)
    edit_file = re.match(r"^edit\s+(?:the\s+)?file\s+(\S+?)\s*:\s*(.+)\s*(?:=>|->)\s*(.+)$", text, re.I)
    if edit_file:
        return _tool(
            "edit_file",
            path=edit_file.group(1).strip(),
            find=edit_file.group(2).strip().strip("\"'"),
            replace=edit_file.group(3).strip(),
        )
    tests = re.match(
        r"^(?:run|execute)\s+(?:the\s+)?(?:tests?|test suite|unit tests)(?:\s+(?:in|for|inside)\s+(.+))?$",
        text,
        re.I,
    )
    if tests:
        return _tool("run_tests", path=(tests.group(1) or "").strip() or ".")

    # ------------------------------------------------------------ media
    if re.search(r"\b(?:what'?s playing|what is playing|now playing|which song is (?:playing|this))\b", low):
        return _tool("now_playing")
    if re.fullmatch(r"(?:pause|pause music|pause playback|pause kar do)[\s!.]*", low):
        return _tool("media_control", action="pause")
    if re.fullmatch(r"(?:resume|resume music|continue music|unpause|play again)[\s!.]*", low):
        return _tool("media_control", action="resume")
    if re.fullmatch(r"(?:next|next song|next track|skip|skip song|agla gaana)[\s!.]*", low):
        return _tool("media_control", action="next")
    if re.fullmatch(r"(?:previous|previous song|previous track|pichhla gaana)[\s!.]*", low):
        return _tool("media_control", action="previous")
    if re.fullmatch(r"(?:stop music|stop the music|music band karo)[\s!.]*", low):
        return _tool("media_control", action="stop")
    play_match = re.match(r"^(?:play|bajao|chalao|sunao)\s+(.+)$", text, re.I)
    if play_match:
        query = re.sub(r"\s+(?:on youtube|on spotify|song|music|gaana|gana)$", "", play_match.group(1), flags=re.I).strip()
        return _tool("play_music", query=query)
    if re.search(r"\bplay (?:some )?music\b|\bmusic bajao\b|\bgaana bajao\b", low):
        return _tool("play_music")

    # ------------------------------------------------------ device control
    if re.fullmatch(r"(?:mute|unmute|silence audio|silent mode)[\s!.]*", low):
        return _tool("set_volume", action="unmute" if low.startswith("unmute") else "mute")
    volume_match = re.search(r"\b(?:volume|awaaz|sound)\b", low)
    if volume_match:
        if re.search(r"\b(?:mute|silent)\b", low) and not re.search(r"unmute", low):
            return _tool("set_volume", action="mute")
        if re.search(r"\bunmute\b|\bunsilence\b", low):
            return _tool("set_volume", action="unmute")
        if re.search(r"\b(?:up|increase|louder|badhao|tez)\b", low):
            return _tool("set_volume", action="up")
        if re.search(r"\b(?:down|decrease|quieter|kam|dheere)\b", low):
            return _tool("set_volume", action="down")
        level = re.search(r"(\d{1,3})\s*(?:%|percent)?", low)
        if level and 0 <= int(level.group(1)) <= 100:
            return _tool("set_volume", level=int(level.group(1)), action="set")
        return _tool("set_volume", action="set", level=50)
    brightness_match = re.search(r"\bbrightness\b|\bscreen (?:bright|dim)\b", low)
    if brightness_match:
        level = re.search(r"(\d{1,3})", low)
        if level and 0 <= int(level.group(1)) <= 100:
            return _tool("set_brightness", level=int(level.group(1)))
        if re.search(r"\b(?:up|increase|badhao)\b", low):
            return _tool("set_brightness", level=80)
        if re.search(r"\b(?:down|decrease|kam)\b", low):
            return _tool("set_brightness", level=25)
        return _tool("set_brightness", level=60)
    if re.fullmatch(r"(?:lock|lock the screen|lock screen|lock (?:the )?(?:pc|computer|system)|screen lock|lock karo)[\s!.]*", low):
        return _tool("lock_screen")
    if re.search(r"\b(?:minimi[sz]e all|show desktop|switch window|next window|show windows)\b", low):
        action = "show_desktop" if "desktop" in low or "minimi" in low else "switch"
        return _tool("window_control", action=action)
    if re.fullmatch(
        r"(?:shut ?down|power off|switch off|power down)(?: (?:the )?(?:pc|computer|system|machine|laptop))?[\s!.]*",
        low,
    ):
        return _tool("power", action="shutdown")
    if re.fullmatch(r"(?:reboot|restart)(?: (?:the )?(?:pc|computer|system|machine|laptop))?[\s!.]*", low):
        return _tool("power", action="reboot")
    if re.fullmatch(r"(?:sleep|suspend)(?: (?:the )?(?:pc|computer|system|machine|laptop))?[\s!.]*", low):
        return _tool("power", action="sleep")
    if re.search(r"\b(?:screenshot|screen shot|screen capture|capture (?:the )?screen)\b", low):
        return _tool("screenshot")
    if re.search(r"\b(?:what'?s on my screen|what is on my screen|look at my screen|describe my screen|read my screen|screen dekho|analyse my screen)\b", low):
        return _tool("desktop_read_screen", question="")
    if re.search(r"\b(?:clipboard|what did i copy)\b", low):
        if re.search(r"\b(?:copy|set|write)\b", low):
            content = re.search(r"(?:copy|set clipboard to|write)\s+(.+)", text, re.I)
            return _tool("clipboard", action="copy", text=content.group(1) if content else "")
        return _tool("clipboard", action="read")

    # -------------------------------------------------------- calculation
    expression = _math_expression(text)
    if expression:
        return _tool("calculate", expression=expression)
    conversion = calc.parse_conversion(text)
    if conversion:
        match_obj = re.match(
            r"^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*([a-zA-Z°]+)\s*(?:to|into|in|ko)\s*([a-zA-Z°]+)$",
            text,
            re.I,
        )
        if match_obj:
            return _tool(
                "convert_units",
                value=float(match_obj.group(1)),
                from_unit=match_obj.group(2),
                to_unit=match_obj.group(3),
            )

    # --------------------------------------------------------- desktop control
    if re.search(
        r"\b(?:desktop panic|panic button|disarm desktop|desktop off|lock (?:the )?input|stop desktop control)\b",
        low,
    ):
        return _tool("desktop_arm", action="off")
    if re.search(
        r"\b(?:arm|enable|start|allow)\b.*\b(?:desktop|keyboard|mouse|input control)\b"
        r"|\b(?:desktop|input) control\b.*\b(?:on|arm|enable)\b",
        low,
    ):
        return _tool("desktop_arm", action="on")
    if re.search(
        r"\b(?:desktop|input) (?:control )?(?:check|setup|doctor|requirements)\b"
        r"|\b(?:check|diagnose|test)\s+(?:the\s+)?desktop(?: control)?\b",
        low,
    ):
        return _tool("desktop_check")
    if re.search(
        r"\b(?:desktop|input) (?:control )?(?:status|state)\b"
        r"|\b(?:control|drive|take over)\s+(?:my|the)\s+(?:pc|computer|laptop|desktop)\b"
        r"|\b(?:are you|is) (?:armed|allowed) (?:for|to) (?:type|control)\b",
        low,
    ):
        return _tool("desktop_status")
    type_match = re.match(r"^(?:type this|type out|type|likho)\s*[:,]?\s*(.+)$", text, re.I)
    if type_match:
        typed = re.sub(r"^this\s*[:,]\s*", "", type_match.group(1).strip(), flags=re.I)
        return _tool("desktop_type", text=typed.strip(" ?.!"))
    press_match = re.match(
        r"^(?:press|hit|send)\s+(?:the\s+)?(?:keys?\s+)?(ctrl|control|alt|shift|cmd|win|super|enter|return|tab|esc|escape|space|backspace|delete|up|down|left|right|home|end|f\d{1,2})(?:\s*\+\s*|[\s-]+)([a-z0-9]+)\s*(?:keys?)?$",
        text,
        re.I,
    )
    if press_match:
        return _tool("desktop_keys", keys=f"{press_match.group(1)}+{press_match.group(2)}")
    simple_key = re.fullmatch(r"(?:press|hit)\s+(enter|return|tab|escape|esc|space|backspace|delete|up|down|left|right)", text, re.I)
    if simple_key:
        return _tool("desktop_keys", keys=simple_key.group(1))
    click_match = re.match(
        r"^(?:(double|right|left|middle)\s+)?click(?:\s+(?:at|on))?\s*(?:x\s*)?(\d+)\s*[,;\s]\s*(?:y\s*)?(\d+)?$",
        text,
        re.I,
    )
    if click_match:
        kind = (click_match.group(1) or "left").lower()
        clicks = 2 if kind == "double" else 1
        button = kind if kind in {"left", "middle", "right"} else "left"
        return _tool(
            "desktop_click",
            x=int(click_match.group(2)),
            y=int(click_match.group(3)) if click_match.group(3) else -1,
            button=button,
            clicks=clicks,
        )
    if re.fullmatch(r"(?:click|left click|mouse click)", low):
        return _tool("desktop_click")
    move_match = re.match(r"^(?:move|take)\s+(?:the\s+)?(?:mouse|pointer|cursor)\s+(?:to\s+)?(\d+)\s*[,;\s]\s*(\d+)$", text, re.I)
    if move_match:
        return _tool("desktop_move", x=int(move_match.group(1)), y=int(move_match.group(2)))
    if re.search(
        r"\b(?:what'?s on (?:my|the) screen|read (?:my|the) screen|screen (?:padho|read karo|dekho)"
        r"|show me (?:my|the) screen|analyse (?:my|the) screen|analyze (?:my|the) screen)\b",
        low,
    ):
        question = ""
        q_match = re.search(r"\b(?:and tell me|tell me|batao)\s+(.+)$", text, re.I)
        if q_match:
            question = q_match.group(1).strip(" ?.!")
        return _tool("desktop_read_screen", question=question)
    if re.search(r"\b(?:list|show|which|what)\b.*\bwindows?\b|\bwindows? list\b|\bopen windows\b", low):
        return _tool("desktop_windows")
    focus_match = re.match(
        r"^(?:focus|activate|switch to|bring (?:up|forward))\s+(?:the\s+)?(.+?)(?:\s+window)?$",
        text,
        re.I,
    )
    if focus_match:
        return _tool("desktop_focus", title=focus_match.group(1).strip(" ?.!"))

    # ------------------------------------------------------------- focus mode
    focus = re.search(
        r"\b(?:adhd|focus)\s*mode\b|\b(?:short answers|no tangents|focus mode)\b",
        low,
    )
    if focus:
        if re.search(r"\b(?:off|stop|disable|band|normal)\b", low):
            return _tool("focus_mode", action="off")
        if re.search(r"\b(?:on|start|enable|chalu)\b", low):
            return _tool("focus_mode", action="on")
        return _tool("focus_mode", action="status")
    if re.fullmatch(r"(?:normal mode|stop adhd mode)", low):
        return _tool("focus_mode", action="off")

    # ------------------------------------------------------ local brain / agent
    if re.search(
        r"\b(?:brain|qwen|local model|local brain)\s+(?:status|info|health|report|kaun sa|kaunsa)\b"
        r"|\b(?:which|what) (?:brain|model) (?:are you|do you) (?:using|have)\b"
        r"|^brain\s*$|^local brain\s*$",
        low,
    ):
        return _tool("brain_status")
    if re.search(
        r"\b(?:install|setup|set up|configure|enable|start|activate|lagao|lagana|daalo)\b.*\b(?:local brain|brain|qwen|ollama)\b"
        r"|\b(?:local brain|brain|qwen)\b.*\b(?:install|setup|set up|configure|install karo|setup karo|banao|lagao)\b"
        r"|^brain setup\s*$|^install qwen\s*$",
        low,
    ):
        return _tool("brain_setup")
    if re.search(
        r"\b(?:test|check|ping|verify|diagnose)\b.*\b(?:local brain|brain|local model|qwen|ollama)\b"
        r"|\b(?:brain|local model|qwen)\b.*\b(?:test|check|ping)\b|^brain test\s*$",
        low,
    ):
        return _tool("brain_test")
    ask_local = re.match(
        r"^(?:ask|query|pucho|poocho)\s+(?:the\s+)?(?:local(?:\s+(?:brain|model|qwen))?|qwen|ollama)\s*[:,]?\s*(.+)$",
        text,
        re.I,
    )
    if ask_local:
        return _tool("brain_chat", message=ask_local.group(1).strip(" ?.!"))
    local_task = re.match(r"^(?:qwen|local model|local brain)\s*[:,]\s*(.+)$", text, re.I)
    if local_task:
        return _tool("brain_chat", message=local_task.group(1).strip(" ?.!"))

    if re.search(r"\b(?:agent status|agent ready|is the agent|agent ka status)\b", low):
        return _tool("agent_status")
    agent_goal = re.match(
        r"^(?:agent|auto agent|jarvis agent)\s*[:,]?\s*(?:do|run|handle|execute|karo|kar do)\s+(.+)$"
        r"|^(?:run|start|launch)\s+(?:the\s+)?(?:agent|auto agent)\s+(?:on|for|to|with)\s+(.+)$"
        r"|^(?:multi[- ]step|autonomous)\s+(?:task|run|mode)\s*[:,]?\s*(.+)$",
        text,
        re.I,
    )
    if agent_goal:
        goal = next(group for group in agent_goal.groups() if group)
        return _tool("agent_run", goal=goal.strip(" ?.!"))
    agent_goal_hi = re.match(r"^(?:agent\s+se|agent ko bol(?:o)?)\s+(.+?)\s+(?:kar(?:o|wao|wa do)|karo)\s*$", text, re.I)
    if agent_goal_hi:
        return _tool("agent_run", goal=agent_goal_hi.group(1).strip(" ?.!"))

    # ---------------------------------------------------------------- plans
    if re.search(r"\b(?:show|list|my|all|dikhao|batao)\b.*\bplans?\b|\bplans? (?:list|status|dikhao)\b|^plans?$", low):
        return _tool("plan_show")
    plan_match = re.match(
        r"^(?:make|create|build|start|new|set up)\s+(?:a\s+|an\s+|the\s+)?plan\s+(?:to|for|on|about)?\s*(.+)$"
        r"|^plan\s+(?:for|to|banao\s+)(.+)$"
        r"|^plan\s*:\s*(.+)$",
        text,
        re.I,
    )
    if plan_match:
        goal = next(group for group in plan_match.groups() if group)
        return _tool("plan_create", goal=goal.strip(" ?.!"))
    close_plan = re.match(
        r"^(?:close|complete|finish|done with|khatam)\s+(?:the\s+)?plan\s+(.+)$", text, re.I
    )
    if close_plan:
        return _tool("plan_update", ref=close_plan.group(1).strip(" ?.!"), status="complete")
    tick_step = re.match(
        r"^(?:complete|tick|finish|done|mark)\s+(?:step\s+)?(\d+|.+?)\s+(?:of|in|from)\s+(?:the\s+)?plan\s+(.+)$",
        text,
        re.I,
    )
    if tick_step:
        return _tool("plan_update", ref=tick_step.group(2).strip(" ?.!"), step=tick_step.group(1))
    step_of = re.match(
        r"^(?:step|task)\s+(\d+)\s+(?:of|in)\s+(?:the\s+)?plan\s+(.+?)\s+(?:done|complete|finished|kar do|karo)$",
        text,
        re.I,
    )
    if step_of:
        return _tool("plan_update", ref=step_of.group(2).strip(" ?.!"), step=step_of.group(1))

    # --------------------------------------------------------------- memory
    mem_search = re.match(
        r"^(?:search\s+(?:your\s+)?memory(?:\s+for)?|memory\s+search|what do you remember about"
        r"|what'?s in memory about|recall(?: from memory)?|yaad hai(?: tumhe)?)\s*[:,]?\s*(.*)$",
        text,
        re.I,
    )
    if mem_search:
        return _tool("memory_search", query=mem_search.group(1).strip(" ?.!"))
    mem_stats = re.search(r"\b(?:memory|journal)\s+(?:stats|statistics|size|how many|report)\b", low)
    if mem_stats:
        return _tool("memory_search")
    mem_save = re.match(
        r"^(?:save to memory|note this|log this|memory me (?:likho|save karo)|yaad rakho)\s*[:,]?\s*(.+)$",
        text,
        re.I,
    )
    if mem_save:
        return _tool("memory_save", text=mem_save.group(1).strip(" ?.!"))

    # ----------------------------------------------------------- repository
    repo_match = re.match(
        r"^(?:map|scan|analyse|analyze|summari[sz]e|explain|inspect)\s+(?:the\s+)?(?:repo|repository|codebase|project|folder)\s*(?:at|in)?\s*(.*)$",
        text,
        re.I,
    )
    if repo_match:
        return _tool("repo_map", path=repo_match.group(1).strip(" ?.\"'") or ".")
    if re.fullmatch(r"(?:repo|repository|codebase)\s+(?:map|scan|summary)", low):
        return _tool("repo_map", path=".")

    # ---------------------------------------------------------- web search
    translate_match = re.match(
        r"^(?:translate|how do you say|how to say|say)\s+(.+?)\s+(?:in|to|into)\s+([a-zA-Z\u0900-\u097F]+)[\s?.!]*$",
        text,
        re.I,
    )
    if translate_match:
        return _tool(
            "translate_text",
            text=translate_match.group(1).strip(" \"'"),
            target=translate_match.group(2).strip(),
        )
    hinglish_translate = re.match(
        r"^([a-zA-Z]+)\s+(?:me|mein)\s+(?:translate|bolo|kaho|kaise bolte(?: hain)?)\s+(.+)$",
        text,
        re.I,
    )
    if hinglish_translate:
        return _tool(
            "translate_text",
            text=hinglish_translate.group(2).strip(" \"'?"),
            target=hinglish_translate.group(1).strip(),
        )
    seo_match = re.match(
        r"^(?:youtube\s+|video\s+)?seo(?:\s+pack)?(?:\s+(?:for|on|about|of))?\s*(.*)$",
        text,
        re.I,
    )
    if seo_match:
        return _tool("seo_pack", topic=seo_match.group(1).strip(" ?.!"))
    import_match = re.match(
        r"^(?:import|load|expand|ingest)\s+(?:my\s+|your\s+)?(?:jarvis\s+)?"
        r"(?:datasets?|knowledge|data|memory|facts|brain)\b\s*(?:from\s+|file\s+)?(.+)$",
        text,
        re.I,
    )
    if import_match:
        return _tool("import_data", path=import_match.group(1).strip(" \"'"))
    wiki_match = re.match(r"^(?:wikipedia|wiki)\s+(?:for\s+|about\s+)?(.+)$", text, re.I)
    if wiki_match:
        return _tool("wikipedia", query=wiki_match.group(1).strip(" ?."))
    search_match = re.match(
        r"^(?:search(?: the web)?|google|look up|dhundo|khojo)(?:\s+(on|for))?\s+(.+)$",
        text,
        re.I,
    )
    if search_match:
        query = search_match.group(2).strip(" ?.")
        engine = "google"
        if re.search(r"\bon youtube\b", low):
            engine = "youtube"
            query = re.sub(r"\bon youtube\b", "", query, flags=re.I).strip()
        elif re.search(r"\bon bing\b", low):
            engine = "bing"
        return _tool("web_search", query=query, engine=engine)
    youtube_match = re.match(r"^(?:youtube|yt)\s+(.+)$", text, re.I)
    if youtube_match:
        return _tool("web_search", query=youtube_match.group(1).strip(), engine="youtube")
    soft_wiki = re.match(r"^(?:who is|who was|what is|what are|tell me about|define)\s+(.+)$", text, re.I)
    if soft_wiki:
        query = soft_wiki.group(1).strip(" ?.")
        intent = _tool("wikipedia", query=query)
        intent.soft = True
        return intent

    # --------------------------------------------------------------- open
    open_match = re.match(r"^(?:open|kholo|khol do|launch|start)\s+(.+)$", text, re.I)
    if open_match:
        target = re.sub(r"^(?:the|my)\s+", "", open_match.group(1).strip(), flags=re.I).strip(" ?.")
        return _tool("open_target", target=target)
    close_match = re.match(r"^(?:close|band karo|quit)\s+(.+)$", text, re.I)
    if close_match:
        return _tool("close_app", app=close_match.group(1).strip(" ?."))

    return None
