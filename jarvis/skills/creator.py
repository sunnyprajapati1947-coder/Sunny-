"""Creator toolkit (Jarvis 1.0 · episode 40).

Builds a YouTube SEO pack — clickable titles, a description and tags — fully
offline. When a model is available it adds a few extra hooks, but the
deterministic pack is always complete, so the feature never depends on a key.
"""
from __future__ import annotations

import re
from datetime import datetime

from jarvis.util import reply, truncate

STOPWORDS = {
    "a", "an", "the", "to", "for", "of", "on", "in", "with", "and", "or", "my",
    "your", "how", "what", "why", "is", "are", "do", "does", "i", "me", "it",
    "this", "that", "kaise", "kya", "ka", "ki", "ke", "me", "mein", "ko",
}
MODIFIERS = [
    "tutorial", "for beginners", "step by step", "in hindi", "2026",
    "complete guide", "explained", "project", "tips", "course",
]


def _clean_topic(topic: str) -> str:
    text = re.sub(r"\s+", " ", str(topic or "")).strip(" .!?,-")
    text = re.sub(r"^(?:seo|youtube seo|video seo|seo pack)\s*(?:for|on|about|of)?\s*", "", text, flags=re.I)
    text = re.sub(r"^(?:a|an|the)\s+", "", text, flags=re.I)
    return text[:120]


def _keywords(topic: str) -> list[str]:
    words = [w for w in re.findall(r"[a-zA-Z0-9\u0900-\u097F]+", topic.lower()) if w not in STOPWORDS]
    seen: list[str] = []
    for word in words:
        if word not in seen:
            seen.append(word)
    return seen


def _title(topic: str) -> str:
    return topic[:1].upper() + topic[1:] if topic else "Your next video"


def build_seo_pack(topic: str = "") -> dict:
    topic = _clean_topic(topic)
    if not topic:
        return reply(
            "Give me a topic, Sir — for example “YouTube SEO for a Python tutorial”.",
            speech="What is the video about, Sir?",
        )

    year = datetime.now().year
    pretty = _title(topic)
    keys = _keywords(topic)
    anchor = pretty
    titles = [
        f"{anchor} — Complete Guide ({year})",
        f"{anchor} for Beginners: Step by Step",
        f"{anchor} in 10 Minutes | {year} Tutorial",
        f"I Tried {anchor} — Here's What Actually Worked",
        f"{anchor}: 7 Mistakes Everyone Makes",
        f"{anchor} Explained Simply (Hindi + English)",
    ]
    topic_words = set(topic.lower().split())
    modifiers = [m for m in MODIFIERS if not set(m.split()) <= topic_words]
    tags: list[str] = []
    for candidate in [topic.lower(), *keys, *[f"{topic.lower()} {m}" for m in modifiers[:6]]]:
        tag = re.sub(r"\s+", " ", candidate).strip()
        if tag and len(tag) <= 60 and tag not in tags:
            tags.append(tag)
    tags = tags[:15]
    hashtags: list[str] = []
    for word in [*keys[:3], "youtube", "tutorial"]:
        tag = "#" + re.sub(r"[^a-zA-Z0-9]", "", word)
        if len(tag) > 2 and tag.lower() not in {item.lower() for item in hashtags}:
            hashtags.append(tag)
    hashtags = hashtags[:5]

    description = (
        f"{pretty} — a practical, beginner-friendly walkthrough.\n\n"
        f"In this video we cover {', '.join(keys[:5]) or topic} without the fluff. "
        f"You will see the exact steps, the mistakes to avoid, and how to apply it today.\n\n"
        f"⏱ Timestamps\n00:00 — Intro\n00:45 — What you need\n"
        f"02:00 — {pretty} step by step\n07:30 — Common mistakes\n"
        f"10:00 — Result and next steps\n\n"
        f"👉 Subscribe for more practical builds.\n"
        f"{' '.join(hashtags)}"
    )

    hooks = [
        f"Everyone talks about {topic}. Almost nobody shows the failure points — I will.",
        f"I rebuilt {topic} from scratch so you do not have to repeat my mistakes.",
    ]

    cards = [
        {
            "type": "list",
            "title": "TITLE OPTIONS",
            "items": titles,
            "footer": f"keyword: {topic}",
        },
        {
            "type": "text",
            "title": "DESCRIPTION",
            "body": description,
        },
        {
            "type": "list",
            "title": "TAGS",
            "items": tags,
            "footer": f"{len(tags)} tags · {len(hashtags)} hashtags",
        },
    ]

    provider = "offline"
    try:
        from jarvis.brain import get_brain

        brain = get_brain()
        if brain.gemini_available() or brain.qwen_available():
            extra, used = brain.complete(
                "You are a YouTube growth strategist. Answer with three short, "
                "specific video title ideas separated by new lines. No numbering.",
                f"Topic: {topic}",
                timeout=10.0,
            )
            lines = [line.strip(" -•") for line in str(extra or "").splitlines() if line.strip()]
            if lines:
                titles.extend(lines[:3])
                provider = used or "offline"
                cards[0] = {
                    "type": "list",
                    "title": "TITLE OPTIONS",
                    "items": titles,
                    "footer": f"keyword: {topic} · {provider}",
                }
    except Exception:
        pass

    return reply(
        f"SEO pack ready for “{topic}”, Sir. {len(titles)} titles, {len(tags)} tags and a "
        f"ready description.",
        speech=f"Your SEO pack for {topic} is ready, Sir.",
        cards=cards,
        data={
            "topic": topic,
            "titles": titles,
            "tags": tags,
            "hashtags": hashtags,
            "description": description,
            "hooks": hooks,
            "provider": provider,
        },
    )
