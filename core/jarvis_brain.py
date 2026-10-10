"""Jarvis brain — decides how to answer: act first, talk second.

Flow for every user message:
1. Smalltalk/intent detection (deterministic, free): greetings, time, thanks.
2. Real-work intents routed to actual Nova tools through the registry:
   battery, weather, currency, remember/recall, books — so Jarvis *does*
   the work instead of chatting about it.
3. Everything else -> the local Qwen lane with the Jarvis personality and
   the rolling conversation memory, so replies feel human and continuous.

If the local model lanes are offline, Jarvis still answers the deterministic
intents and says honestly that its "thinking lane" is down.
"""
from __future__ import annotations

import os
import re
from datetime import datetime
from typing import Any

from core.conversation import context as history_context
from core.conversation import load as history_load
from core.identity import JARVIS_PERSONALITY, NOVA_NAME, OWNER_NAME
from core.tool_bridge import build_registry

EXIT_PATTERNS = re.compile(r"^\s*(/exit|exit|quit|band karo|chup ho jao|so jao|bye|alvida)\s*$", re.IGNORECASE)
GREETING = re.compile(r"\b(hi|hello|hey|namaste|namaskar|salaam|kaise ho|kya haal|good (morning|afternoon|evening)|jarvis)\b", re.IGNORECASE)
THANKS = re.compile(r"\b(thanks|thank you|shukriya|dhanyavad|dhanyawad)\b", re.IGNORECASE)
TIME_Q = re.compile(r"\b(time|samay|baje|kitne baje|date|tareekh|aaj kaunsa|what day)\b", re.IGNORECASE)
BATTERY_Q = re.compile(r"\b(battery|bettery|charge|charging)\b", re.IGNORECASE)
WEATHER_Q = re.compile(r"\b(weather|mausam|baarish|garmi|thand|temperature|temperature kya)\b", re.IGNORECASE)
REMEMBER_Q = re.compile(r"\b(remember|yad rakho|yaad rakho|yad rakh|yaad rakh|note kar|noted rakho)\b", re.IGNORECASE)
RECALL_Q = re.compile(r"\b(what do you know|kya yaad|kya yad|mera data|my facts|recall)\b", re.IGNORECASE)


def _registry():
    return build_registry()


def _unwrap(result: dict[str, Any]) -> dict[str, Any]:
    """Registry results arrive in an untrusted-content envelope; open it."""
    content = result.get("result")
    if isinstance(content, dict) and isinstance(content.get("content"), dict):
        return content["content"]
    if isinstance(content, dict):
        return content
    return result


def _extract_city(text: str) -> str:
    """Pull a likely city name out of a weather question."""
    filler = {
        "please", "hai", "ha", "ka", "ki", "ke", "kya", "kaisa", "kaisi",
        "batao", "bata", "tell", "me", "about", "aj", "aaj", "today",
        "mausam", "weather", "temperature", "baarish", "barish", "garmi",
        "thand", "kaisa", "hawa",
    }
    m = re.search(
        r"(?:in|me|mein|of)\s+([a-z\u0900-\u097F]+(?:\s+[a-z\u0900-\u097F]+)?)",
        text,
        re.IGNORECASE,
    )
    if m:
        words = [w for w in m.group(1).split() if w.lower() not in filler]
        if words:
            return " ".join(words).strip(" ?.")
    # Hindi word order: "<city> me/ka mausam" -> take the word before the marker.
    m = re.search(r"([a-z\u0900-\u097F]+)\s+(?:me|mein|ka|ki|in|of)\b", text, re.IGNORECASE)
    if m and m.group(1).lower() not in filler:
        return m.group(1).strip(" ?.")
    # Fallback: last capitalized-looking word sequence.
    words = re.findall(r"[A-Za-z\u0900-\u097F]+", text)
    for word in reversed(words):
        if word.lower() not in {"weather", "mausam", "in", "me", "mein", "kya", "hai", "ka", "ki", "kaisa", "kaisi", "batao", "jarvis"}:
            return word
    return ""


def _smalltalk(text: str) -> str | None:
    now = datetime.now()
    if EXIT_PATTERNS.match(text):
        return None
    if THANKS.search(text):
        return f"Koi baat nahi {OWNER_NAME}, hamesha hazir. Aur kuch?"
    if re.search(r"\b(kaise ho|kya haal|how are you)\b", text, re.IGNORECASE):
        return f"Main ekdam set hu {OWNER_NAME}, systems ready. Tum batao, kya haal hai? Kaam bolo!"
    if GREETING.search(text) and len(text.split()) <= 4:
        hour = now.hour
        wish = "Good morning" if 5 <= hour < 12 else ("Good afternoon" if 12 <= hour < 17 else "Good evening")
        return f"{wish} {OWNER_NAME}! {NOVA_NAME} ready hai. Bolo, kya kaam karna hai?"
    if re.search(r"\b(kaun ho tum|who are you|tumhara naam|your name)\b", text, re.IGNORECASE):
        return f"Main {NOVA_NAME} hu — tumhara personal AI assistant, is phone ke andar chalta hu. Data kahin nahi jata."
    return None


def _intents(text: str) -> str | None:
    """Deterministic real-work intents; returns a spoken-style answer."""
    registry = _registry()

    if TIME_Q.search(text) and len(text.split()) <= 8:
        now = datetime.now()
        return f"{OWNER_NAME}, abhi {now.strftime('%I:%M %p')} baje hain, {now.strftime('%A, %d %B %Y')}."

    if BATTERY_Q.search(text):
        try:
            result = _unwrap(registry.execute("phone_battery", {}))
            if result.get("success"):
                pct = result.get("percent") or result.get("battery_percent") or result.get("level")
                if pct is not None:
                    return f"Battery {pct} percent pe hai {OWNER_NAME}."
                return f"Battery status mil gaya: {str(result)[:200]}"
        except Exception:
            pass
        return "Battery check nahi ho paya — Termux:API app install hai kya?"

    if WEATHER_Q.search(text):
        city = _extract_city(text)
        if city:
            try:
                result = _unwrap(registry.execute("api_weather", {"location": city}))
                if result.get("success"):
                    return (
                        f"{city} me {result.get('description', 'weather')} hai, "
                        f"temperature {result.get('temperature_c')} degree, "
                        f"feel like {result.get('feels_like_c')} degree."
                    )
                return f"{city} ka weather nahi la paya — internet check karo."
            except Exception:
                return "Weather service tak nahi pahunch paya."
        return f"Kis sheher ka mausam batau {OWNER_NAME}? Naam bolo."

    if REMEMBER_Q.search(text):
        fact = re.sub(REMEMBER_Q, "", text, count=1).strip(" ,-:.")
        if len(fact) >= 3:
            try:
                result = _unwrap(registry.execute(
                    "personal_remember", {"fact": fact, "category": "note"}))
                if result.get("success"):
                    return f"Noted {OWNER_NAME}! Yaad rakh liya."
            except Exception:
                pass
        return "Kya yaad rakhna hai? Poora bolo."

    if RECALL_Q.search(text):
        try:
            result = _unwrap(registry.execute("personal_recall", {"query": ""}))
            if result.get("success") and result.get("count"):
                facts = "; ".join(f["text"] for f in result["facts"][:5])
                return f"Jo mujhe pata hai: {facts}"
            return f"Abhi kuch khaas yaad nahi hai {OWNER_NAME}. Bolo kya yaad rakhna hai."
        except Exception:
            pass

    return None


def respond(text: str) -> dict[str, Any]:
    """Answer one user message: act first, then talk."""
    text = str(text or "").strip()
    if not text:
        return {"success": False, "error": "empty message"}

    if EXIT_PATTERNS.match(text):
        return {"success": True, "reply": f"Thik hai {OWNER_NAME}, main so raha hu. Jab chahiye bula lena.", "exit": True}

    # 1) Free deterministic answers.
    small = _smalltalk(text)
    if small:
        return {"success": True, "reply": small, "via": "smalltalk"}

    # 2) Real work through tools.
    worked = _intents(text)
    if worked:
        return {"success": True, "reply": worked, "via": "tool"}

    # 3) Human-like conversation on the local lane, with memory.
    try:
        from core.fast_router import ask
        result = ask(
            text,
            timeout=15.0,
            history=history_context(history_load()),
            system=JARVIS_PERSONALITY,
        )
    except Exception as exc:
        return {"success": False, "error": f"brain unavailable: {exc}"}

    if result.get("success"):
        return {"success": True, "reply": str(result.get("answer") or "").strip(), "via": result.get("lane", "local")}

    return {
        "success": True,
        "reply": (
            f"{OWNER_NAME}, mera thinking lane abhi offline hai — local model start karo "
            "(bash automation/start_fast_lane.sh). Tab tak time, battery, weather, yaad rakhna — "
            "ye sab main bina model ke bhi kar sakta hu."
        ),
        "via": "offline",
    }


def enabled() -> bool:
    return os.getenv("NOVA_JARVIS_ENABLED", "true").lower() == "true"
