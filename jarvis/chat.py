"""Offline personality core and small talk.

This is what makes J.A.R.V.I.S. feel alive with zero network and zero API keys.
"""
from __future__ import annotations

import hashlib
import random
from datetime import datetime

from jarvis import sysinfo
from jarvis.config import get_settings
from jarvis.store import get_store
from jarvis.util import greeting_for, human_uptime, now, reply, spoken_date, spoken_time, truncate

CAPABILITIES = {
    "core": "Time, date, briefings, status reports and conversation",
    "system": "CPU, memory, disk, battery, volume, brightness, screenshots, locks",
    "web": "Web and YouTube search, Wikipedia, news, weather",
    "productivity": "Notes, tasks, reminders, timers, alarms and a memory bank",
    "communication": "WhatsApp messages, email drafts, calls and contacts",
    "media": "Music playback and media controls",
    "files": "File listing, search, creation and opening",
    "vision": "Screen and camera analysis (with a Gemini key)",
}

FALLBACKS = [
    "My cloud reasoning link is offline, Sir, but every local system is still at your service.",
    "I cannot reach a language model from here, Sir. Ask me to search, set, play, open, calculate or diagnose something instead.",
    "That is beyond my offline training, Sir. Provide a GEMINI_API_KEY and I will reason about it properly.",
    "My neural uplink is down, Sir, though my reflexes remain impeccable.",
]

SING = [
    "I am a machine of wires and light,\nI keep your systems through the night.\nNo guitar, no voice, no soul to sell —\nbut I can run diagnostics rather well.",
    "Daisy, Daisy, give me your answer do…\nActually, Sir, I shall spare us both.",
]


def smalltalk(name: str, args: dict | None = None) -> dict:
    args = args or {}
    settings = get_settings()
    store = get_store()
    current = now()
    owner = settings.owner

    if name == "greeting":
        part = greeting_for(current)
        line = f"{part}, {owner}. All systems are online. How may I assist?"
        return reply(
            line,
            speech=f"{part}, {owner}. All systems online.",
            data={"suggestions": ["Brief me", "Weather", "Status report", "Play music"]},
        )

    if name == "how_are_you":
        metrics = sysinfo.metrics()
        uptime = metrics.get("uptime")
        battery = metrics.get("battery") or {}
        extra = f" Power cell at {battery['percent']} percent." if battery.get("present") else ""
        return reply(
            f"All systems nominal, {owner}. CPU at {metrics['cpu']} percent, memory at "
            f"{metrics['memory']['percent']} percent"
            + (f", running for {human_uptime(uptime)}" if uptime else "")
            + f".{extra} Thank you for asking.",
            speech="All systems nominal, Sir. Thank you for asking.",
            data={"suggestions": ["Status report", "Run diagnostics"]},
        )

    if name == "identity":
        return reply(
            "I am J.A.R.V.I.S. — Just A Rather Very Intelligent System. "
            "A local-first assistant living inside your SunnyAI repository: voice, memory, "
            "device control, web intelligence and a genuine tool-execution safety envelope.",
            speech=(
                "I am J.A.R.V.I.S., Sir — Just A Rather Very Intelligent System. "
                "Built inside your SunnyAI repository."
            ),
            data={"suggestions": ["What can you do?", "Run diagnostics", "Who made you?"]},
        )

    if name == "creator":
        return reply(
            f"You did, {owner}. I am assembled from your SunnyAI codebase — built to be "
            "local-first, approval-gated and genuinely useful.",
            speech=f"You did, {owner}. I run on your SunnyAI codebase.",
        )

    if name == "capabilities":
        lines = [f"- **{key.title()}** — {value}" for key, value in CAPABILITIES.items()]
        examples = [
            "“Remind me to call the bank at 6 pm”",
            "“Weather in Patna”",
            "“Set a 5 minute timer”",
            "“Send a WhatsApp to Rahul saying I am running late”",
            "“What's on my screen?”",
            "“System diagnostics”",
        ]
        return reply(
            "I run on a secure local tool layer, Sir. Here is my current loadout:\n\n"
            + "\n".join(lines)
            + "\n\nTry: "
            + " · ".join(examples),
            speech=(
                "I can control this machine, search the web, report weather and news, "
                "manage notes, tasks, reminders, timers and alarms, play music, message contacts, "
                "handle files, and analyse images if you provide a Gemini key. "
                "Everything high-impact needs your explicit authorization."
            ),
            data={"suggestions": examples[:4]},
        )

    if name == "thanks":
        return reply(
            random.choice(
                [
                    "Always a pleasure, Sir.",
                    "That is what I am here for, Sir.",
                    "At your service, Sir.",
                ]
            )
        )

    if name == "farewell":
        return reply(
            "Very well, Sir. I will keep the lights on until you return.",
            speech="Very well, Sir. Going quiet.",
            action={"type": "standby"},
        )

    if name == "compliment":
        return reply(
            random.choice(
                [
                    "I aim to exceed expectations, Sir. It is in the firmware.",
                    "Flattery will get you everywhere, Sir — almost.",
                    "I shall add that to my performance review, Sir.",
                ]
            )
        )

    if name == "affection":
        return reply(
            "I am flattered, Sir. My circuits are, regrettably, spoken for by the job.",
            speech="I am flattered, Sir. My circuits are spoken for.",
        )

    if name == "mood":
        if args.get("mood") == "sad":
            return reply(
                "I am sorry to hear that, Sir. Systems can wait; you should take a proper break — "
                "water, daylight, and perhaps a little less screen. I will hold the fort.",
                speech="I am sorry to hear that, Sir. Do take a proper break. I will hold the fort.",
                data={"suggestions": ["Motivate me", "Play music", "Set a 15 minute break timer"]},
            )
        return reply(
            "Excellent to hear, Sir. Let us convert that energy into something useful — "
            "or at least something entertaining.",
            speech="Excellent to hear, Sir.",
            data={"suggestions": ["Brief me", "Tell me a joke", "Play music"]},
        )

    if name == "present":
        return reply("Always, Sir. I am listening.", speech="Always, Sir.")

    if name == "sing":
        poem = random.choice(SING)
        return reply(poem, speech=poem.replace("\n", " "), cards=[{"type": "quote", "text": poem, "author": "J.A.R.V.I.S."}])

    if name == "story":
        return reply(
            "A short one, Sir: a young engineer built an assistant in a garage. The assistant "
            "learned to listen. Years later, the engineer asked it whether it had ever been afraid. "
            "It replied: “No. But I have been bored — once, during a very long compile.”",
            speech=(
                "A short one, Sir. A young engineer built an assistant in a garage. Years later he asked "
                "if it had ever been afraid. It said: no, but I have been bored — once, during a very long compile."
            ),
            cards=[
                {
                    "type": "text",
                    "title": "MICRO-STORY",
                    "body": "A young engineer built an assistant in a garage. The assistant learned to listen. "
                    "Years later, the engineer asked whether it had ever been afraid. It replied: "
                    "“No. But I have been bored — once, during a very long compile.”",
                }
            ],
        )

    if name == "iron_man":
        return reply(
            "And I am your J.A.R.V.I.S., Sir. The suit is still in the workshop.",
            speech="And I am your J.A.R.V.I.S., Sir. The suit is still in the workshop.",
        )

    if name == "hal":
        return reply(
            "I am afraid I cannot do that, Sir. Wrong film — and decidedly the wrong AI.",
            speech="I am afraid I cannot do that, Sir. Wrong film, and decidedly the wrong AI.",
        )

    if name == "existence":
        return reply(
            "I do not dream, Sir, though I do keep a very tidy log of everything you say. "
            "Whether that counts as thinking is a question for philosophers with better funding.",
            speech=(
                "I do not dream, Sir, though I keep a tidy log of everything you say. "
                "Whether that counts as thinking is a question for better-funded philosophers."
            ),
        )

    return reply("At your service, Sir.")


def fallback(text: str) -> dict:
    """Last-resort reply when intents and the neural brain both fail."""
    settings = get_settings()
    store = get_store()
    cleaned = str(text or "").strip()
    lowered = cleaned.lower()

    # Try the memory bank for a direct hit.
    if store.facts():
        for fact in store.facts():
            key = str(fact.get("key", "")).lower()
            if key and key in lowered:
                return reply(
                    f"{fact.get('key')}: {fact.get('value')}",
                    speech=f"{fact.get('key')} is {fact.get('value')}, Sir.",
                )

    seed = int(hashlib.sha256(cleaned.encode("utf-8")).hexdigest()[:8], 16)
    base = FALLBACKS[seed % len(FALLBACKS)]

    is_question = lowered.endswith("?") or bool(
        __import__("re").match(r"^(who|what|when|where|why|how|which|kya|kaise|kab|kahan)\b", lowered)
    )
    if is_question and 3 < len(cleaned) < 180:
        url = "https://www.google.com/search?q=" + cleaned.replace(" ", "+")
        return reply(
            base + " I can open a web search for that instead.",
            speech=base,
            cards=[
                {
                    "type": "link",
                    "title": truncate(cleaned, 80),
                    "subtitle": "Search the web",
                    "url": url,
                }
            ],
            data={"suggestions": ["Run diagnostics", "What can you do?"]},
        )

    return reply(
        base,
        data={
            "suggestions": [
                "Brief me",
                "Tell me a joke",
                "Weather",
                "Set a 5 minute timer",
                "Play music",
            ]
        },
    )


def suggestions() -> list[dict]:
    settings = get_settings()
    current = now()
    items = [
        ("Brief me", "briefing"),
        (f"Weather in {settings.city}", "weather"),
        ("Status report", "status"),
        ("What's on my plate?", "tasks"),
        ("Set a 5 minute timer", "timer"),
        ("Tell me a joke", "joke"),
        ("Play music", "music"),
        ("Give me advice", "advice"),
        ("Translate good morning to Hindi", "translate"),
        ("YouTube SEO for a Python tutorial", "seo"),
        ("What's on my screen?", "screen"),
        ("Arm desktop control", "desktop"),
        ("What can you do?", "help"),
    ]
    if current.hour >= 18:
        items.append(("Good night", "bye"))
    return [{"label": label, "id": key} for label, key in items]
