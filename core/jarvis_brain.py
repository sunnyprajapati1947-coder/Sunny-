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
GREETING = re.compile(r"^(hi|hello|hey|namaste|namaskar|salaam|kaise ho|kya haal|good (morning|afternoon|evening))\b", re.IGNORECASE)
THANKS = re.compile(r"\b(thanks|thank you|shukriya|dhanyavad|dhanyawad)\b", re.IGNORECASE)
TIME_Q = re.compile(r"\b(time|samay|baje|kitne baje|date|tareekh|aaj kaunsa|what day)\b", re.IGNORECASE)
BATTERY_Q = re.compile(r"\b(battery|bettery|charge|charging)\b", re.IGNORECASE)
WEATHER_Q = re.compile(r"\b(weather|mausam|baarish|garmi|thand|temperature|temperature kya)\b", re.IGNORECASE)
REMEMBER_Q = re.compile(r"\b(remember|yad rakho|yaad rakho|yad rakh|yaad rakh|note kar|noted rakho)\b", re.IGNORECASE)
RECALL_Q = re.compile(r"\b(what do you know|kya yaad|kya yad|mera data|my facts|recall)\b", re.IGNORECASE)
NEWS_Q = re.compile(r"\b(news|khabar|khabrein|khabre|headlines|taaza|taza|kya chal raha)\b", re.IGNORECASE)
OPEN_Q = re.compile(r"\b(open|kholo|khol do|kholna|khol de|launch|start karo|chalu karo|on karo)\b", re.IGNORECASE)
TORCH_Q = re.compile(r"\b(torch|flash|flashlight|teer|light jala|light bujha)\b", re.IGNORECASE)
CLIPBOARD_Q = re.compile(r"\b(clipboard|clip board|copy kiya|kya copy)\b", re.IGNORECASE)
VOLUME_Q = re.compile(r"\b(volume|awaz|awaaz|sound|niki|neeche)\b.*\b(badhao|badha|karo|ghatao|kam|kam karo|high|low|full)\b|\bvolume (badhao|ghatao|karo)\b", re.IGNORECASE)
BRIGHTNESS_Q = re.compile(r"\b(brightness|roshni)\b", re.IGNORECASE)
STUDY_Q = re.compile(r"\b(padhai|study|syllabus|exam|board|quiz|mock test|ncert|class ?10|dasvi|science|maths|ganit|vigyan|sst|social science)\b", re.IGNORECASE)
DETAIL_Q = re.compile(r"\b(detail|detailed|explain|samjhao|lambi|pura|poora|list banao|points me|deep)\b", re.IGNORECASE)
WHATSAPP_Q = re.compile(r"\bwhatsapp\b", re.IGNORECASE)
CALL_Q = re.compile(r"\b(call karo|phone lagao|phone karo|dial karo|dial kar|missed call|call lagao)\b", re.IGNORECASE)
UPDATE_Q = re.compile(r"(?:\b(update|upgrade|naya version)\b.*\b(jarvis|nova|repo|code|khud)\b)|(?:\b(jarvis|nova|repo)\b.*\b(update|upgrade)\b)", re.IGNORECASE)


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


def _study_subject(text: str) -> str:
    """Map a study request to a syllabus subject name ('' if none)."""
    from core.study_assistant import SUBJECT_ALIASES
    text = str(text or "").lower()
    for alias, subject in SUBJECT_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", text):
            return subject
    return ""


def _intents(text: str) -> str | None:
    """Deterministic real-work intents; returns a spoken-style answer."""
    registry = _registry()

    if TIME_Q.search(text) and len(text.split()) <= 8:
        now = datetime.now()
        return f"{OWNER_NAME}, abhi {now.strftime('%I:%M %p')} baje hain, {now.strftime('%A, %d %B %Y')}."

    if BATTERY_Q.search(text):
        try:
            result = _unwrap(registry.execute("phone_battery", {}))
            data = result.get("data") if isinstance(result.get("data"), dict) else {}
            pct = data.get("percentage") or data.get("percent")
            status = str(data.get("status") or data.get("plugged") or "").lower()
            temp = data.get("temperature")
            if pct is not None:
                reply = f"Battery {pct} percent pe hai {OWNER_NAME}"
                if "charg" in status:
                    reply += ", charge ho rahi hai"
                if temp:
                    reply += f", temperature {temp} degree"
                return reply + "."
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

    # Hath: kholo/khol do/open X -> app ya website kholta hai.
    if OPEN_Q.search(text):
        # Strip the verb words, take the rest as the target.
        target = OPEN_Q.sub(" ", text, count=1)
        target = re.sub(r"\b(karo|kar|do|de|dena|jara|zara|please|plz|boss|jarvis|nova)\b", " ", target, flags=re.IGNORECASE)
        target = target.strip(" ?.,!")
        if target:
            try:
                result = _unwrap(registry.execute("phone_open", {"target": target}))
                if result.get("success"):
                    opened = result.get("opened")
                    mode = "app" if result.get("mode") == "app" else "browser"
                    return f"Khol diya {OWNER_NAME} — {opened} ({mode} me)."
                known = result.get("known", "")
                return f"Ye nahi khul paya {OWNER_NAME}. Meri list me hai: {known}"
            except Exception:
                return f"Open karne me dikkat aayi {OWNER_NAME}."
        return f"Kya kholna hai {OWNER_NAME}? Instagram, YouTube, WhatsApp... bolo."

    # News: live headlines from the web search tool.
    if NEWS_Q.search(text):
        topic = re.sub(NEWS_Q, " ", text, count=1)
        topic = re.sub(r"\b(batao|bata|do|de|kya|hai|ki|ka|me|mein|aaj|today|latest)\b", " ", topic, flags=re.IGNORECASE).strip(" ?.,!")
        query = f"latest news today {topic}".strip() if topic else "top news headlines today India"
        try:
            result = _unwrap(registry.execute("web_search", {"query": query, "max_results": 5}))
            results = result.get("results") or []
            # Prefer real headlines read from a news page over generic site titles.
            headlines: list[str] = []
            for item in results[:3]:
                if "news" not in str(item.get("url", "")):
                    continue
                try:
                    page = _unwrap(registry.execute("web_fetch", {"url": item["url"]}))
                    body = str(page.get("text") or page.get("content") or "")
                    for line in body.splitlines():
                        line = line.strip()
                        if 35 <= len(line) <= 140 and line.count(" ") >= 4 \
                                and not line.lower().startswith(("http", "ad", "subscribe", "sign in", "log in")):
                            headlines.append(line)
                        if len(headlines) >= 3:
                            break
                except Exception:
                    continue
                if len(headlines) >= 3:
                    break
            if not headlines:
                headlines = [r.get("title", "").strip() for r in results[:3] if r.get("title")]
            headlines = [h[:120] for h in headlines if h]
            if headlines:
                return (
                    f"{OWNER_NAME}, aaj ki khabrein: Ek — {headlines[0]}. "
                    + (f"Do — {headlines[1]}. " if len(headlines) > 1 else "")
                    + (f"Teen — {headlines[2]}." if len(headlines) > 2 else "")
                )
            return f"News nahi la paya {OWNER_NAME} — internet check karo."
        except Exception:
            return f"News lane me dikkat aayi {OWNER_NAME}."

    # Torch (flashlight).
    if TORCH_Q.search(text):
        off = re.search(r"\b(off|bujha|band|band karo)\b", text, re.IGNORECASE)
        try:
            result = _unwrap(registry.execute("phone_torch", {"on": not off}))
            if result.get("success"):
                return f"Torch {'band' if off else 'on'} kar di {OWNER_NAME}."
            return result.get("error", "Torch nahi chala.")
        except Exception:
            return "Torch nahi chala — Termux app ko Camera permission chahiye."

    # Clipboard.
    if CLIPBOARD_Q.search(text):
        try:
            result = _unwrap(registry.execute("phone_clipboard_get", {}))
            if result.get("success"):
                content = str(result.get("text") or "").strip()
                if content:
                    return f"Clipboard me ye hai {OWNER_NAME}: {content[:200]}"
                return "Clipboard khali hai Boss."
            return "Clipboard padh nahi paya."
        except Exception:
            return "Clipboard access nahi mila."

    # Volume.
    if VOLUME_Q.search(text):
        stream = "music"
        if re.search(r"\b(ringtone|ring|caller)\b", text, re.IGNORECASE):
            stream = "ring"
        if re.search(r"\b(full|max|100|poori|highest)\b", text, re.IGNORECASE):
            level = 100
        elif re.search(r"\b(kam|ghatao|low|neeche|niki|dhema|slow)\b", text, re.IGNORECASE):
            level = 30
        else:
            level = 70
        try:
            result = _unwrap(registry.execute("phone_set_volume", {"volume": level, "stream": stream}))
            if result.get("success"):
                return f"{stream} volume {level} percent kar di {OWNER_NAME}."
            return "Volume set nahi hua."
        except Exception:
            return "Volume control nahi mila."

    # Brightness.
    if BRIGHTNESS_Q.search(text):
        if re.search(r"\b(kam|low|dhimi|dhema|neeche)\b", text, re.IGNORECASE):
            level = 30
        elif re.search(r"\b(full|poori|high|tez|max)\b", text, re.IGNORECASE):
            level = 100
        else:
            level = 70
        try:
            result = _unwrap(registry.execute("phone_brightness", {"percent": level}))
            if result.get("success"):
                return f"Brightness {level} percent kar di {OWNER_NAME}."
            return "Brightness set nahi hui."
        except Exception:
            return "Brightness control nahi mila."

    # Study coach (CBSE Class 10, Board 2027).
    if STUDY_Q.search(text):
        subject = _study_subject(text)
        if re.search(r"\b(quiz|mock|test|practice|mcq)\b", text, re.IGNORECASE) and subject:
            try:
                result = _unwrap(registry.execute("study_quiz", {"subject": subject, "count": 3}))
                if result.get("success"):
                    q1 = result["questions"][0]
                    opts = ", ".join(f"{chr(65 + i)}) {o}" for i, o in enumerate(q1["options"]))
                    return (
                        f"{OWNER_NAME}, {subject} ka quiz shuru! Sawal 1: {q1['q']} "
                        f"Options: {opts}. Jawab soch lo, phir 'answer batao' bolo."
                    )
            except Exception:
                pass
            return f"Quiz load nahi hua {OWNER_NAME}."
        if subject:
            try:
                plan = _unwrap(registry.execute("study_plan", {"subject": subject}))
                if plan.get("success"):
                    chapters = plan["chapters"]
                    total = len(chapters)
                    first = chapters[0] if chapters else ""
                    return (
                        f"{OWNER_NAME}, {subject} me {total} chapters hain. "
                        f"Pehla: {first}. Poora list aur tips chahiye to 'detail me syllabus batao' bolo. "
                        "NCERT se hi 75+ aate hain, bahar ki book zaroori nahi."
                    )
            except Exception:
                pass
        try:
            tips = _unwrap(registry.execute("study_tips", {"subject": subject}))
            if tips.get("success"):
                general = tips.get("general_tips") or tips.get("tips") or []
                if general:
                    return f"{OWNER_NAME}, padhai ke liye: " + " ".join(general[:3])
        except Exception:
            pass
        return "Padhai mode ready hai Boss — subject bolo (science, maths, sst, hindi, english)."

    # Self-update: Jarvis khud GitHub se naya code leta hai (safe + rollback).
    if UPDATE_Q.search(text):
        import subprocess as _sp
        from pathlib import Path as _P
        script = _P(__file__).resolve().parent.parent / "automation" / "jarvis_update.sh"
        if not script.is_file():
            return f"Update script nahi mila {OWNER_NAME}."
        try:
            done = _sp.run(
                ["bash", str(script)], capture_output=True, text=True,
                timeout=600, cwd=str(script.parent.parent), check=False,
            )
            output = (done.stdout or "") + (done.stderr or "")
            lines = [l.strip() for l in output.splitlines() if l.strip()]
            summary = " ".join(lines[-2:])[:350] if lines else "koi output nahi aaya"
            status = "ho gaya" if done.returncode == 0 else "me dikkat aayi"
            return f"Update check {status} {OWNER_NAME}. {summary}"
        except Exception as exc:
            return f"Update chala nahi {OWNER_NAME}: {exc}"

    # WhatsApp: number + pre-filled message ke saath chat kholo (send button Boss ke haath me).
    if WHATSAPP_Q.search(text):
        from core.termux_tools import PHONE_NUMBER_RE
        m = PHONE_NUMBER_RE.search(text)
        number = m.group(0) if m else ""
        msg = _extract_message(text)
        try:
            result = _unwrap(registry.execute(
                "phone_whatsapp", {"number": number, "text": msg}))
            if result.get("success"):
                who = result.get("number") or "picker"
                extra = "message likha hua ready hai" if result.get("message_prefilled") else "chat khuli hai"
                return f"WhatsApp {who} ke liye khol di {OWNER_NAME}, {extra}. Send button tumhara hai."
            return result.get("error", "WhatsApp khula nahi.")
        except Exception:
            return "WhatsApp kholne me dikkat aayi."

    # Call: dialer kholega (call button Boss ke haath me).
    if CALL_Q.search(text):
        from core.termux_tools import PHONE_NUMBER_RE
        m = PHONE_NUMBER_RE.search(text)
        if not m:
            return f"Number bolo {OWNER_NAME}, dialer khol deta hu."
        try:
            result = _unwrap(registry.execute("phone_dial", {"number": m.group(0)}))
            if result.get("success"):
                return f"Dialer me {result.get('dialer')} laga di {OWNER_NAME} - call button dabao."
            return result.get("error", "Dialer nahi khula.")
        except Exception:
            return "Dialer kholne me dikkat aayi."

    return None


def _extract_message(text: str) -> str:
    """WhatsApp message nikaalo: '... bhejo ki <msg>' ya 'message <msg>'."""
    m = re.search(r"\bki\b\s+(.+)$", text, re.IGNORECASE)
    if m:
        msg = m.group(1)
    else:
        m = re.search(r"\b(?:message|msg|bhejo|bhej|text)\b\s*(?:ki|:)?\s*(.+)$", text, re.IGNORECASE)
        msg = m.group(1) if m else ""
    # Number aur command words hatao.
    from core.termux_tools import PHONE_NUMBER_RE
    msg = PHONE_NUMBER_RE.sub(" ", msg)
    msg = re.sub(r"\b(whatsapp|pe|par|ko|karo|kar|do|de|bhejo|bhej|message|msg|jarvis|nova|boss|wa)\b", " ", msg, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", msg).strip(" ?.,-")[:400]


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

    # 3) Human-like conversation: Gemini (smart lane) -> local Qwen fallback.
    # Voice speed: 1.7B on a phone is ~8-15 tokens/s, so cap tokens normally
    # and only allow a long generation when detail was explicitly requested.
    detail = bool(DETAIL_Q.search(text))
    max_tokens = 800 if detail else 300
    timeout = float(os.getenv("NOVA_CHAT_TIMEOUT", "60"))
    history = history_context(history_load())

    reply = ""
    via = "local"
    result: dict = {"success": False}

    # Smart lane pehle: Boss ka Gemini key (agar set hai).
    try:
        from core.gemini_lane import ask_gemini, has_key
        if has_key():
            gem = ask_gemini(
                text,
                history=history,
                system=JARVIS_PERSONALITY,
                timeout=45.0,
                max_tokens=1500 if detail else 700,
            )
            if gem.get("success"):
                reply = str(gem.get("answer") or "").strip()
                via = "gemini"
                result = gem
    except Exception:
        reply = ""

    # Local Qwen lane: Gemini na ho ya fail ho jaye.
    if not reply:
        try:
            from core.fast_router import ask
            result = ask(
                text,
                timeout=timeout,
                history=history,
                system=JARVIS_PERSONALITY,
                temperature=0.7,
                max_tokens=max_tokens,
            )
            if result.get("success"):
                reply = str(result.get("answer") or "").strip()
                via = result.get("lane", "local")
        except Exception as exc:
            return {"success": False, "error": f"brain unavailable: {exc}"}

    # Anti-repetition: tiny models love to echo the same greeting. If the
    # reply matches the last thing Jarvis said, regenerate once with a nudge.
    last_assistant = next(
        (t["content"] for t in reversed(history) if t["role"] == "assistant"), ""
    )
    if reply and reply.strip().lower() == last_assistant.strip().lower():
        try:
            from core.fast_router import ask
            retry = ask(
                f"{text}\n(Dobara wahi jawab mat do. Naya, alag jawab do, Hinglish me.)",
                timeout=timeout,
                history=history,
                system=JARVIS_PERSONALITY,
                temperature=0.9,
                max_tokens=max_tokens,
            )
            if retry.get("success") and str(retry.get("answer") or "").strip():
                reply = str(retry["answer"]).strip()
                result = retry
                via = retry.get("lane", "local")
        except Exception:
            pass

    if reply:
        return {"success": True, "reply": reply, "via": via}

    return {
        "success": True,
        "reply": (
            f"{OWNER_NAME}, mera thinking lane abhi offline hai — local model start karo "
            "(bash automation/start_fast_lane.sh). Tab tak time, battery, weather, news, "
            "yaad rakhna, app kholna — ye sab main bina model ke bhi kar sakta hu."
        ),
        "via": "offline",
    }


def enabled() -> bool:
    return os.getenv("NOVA_JARVIS_ENABLED", "true").lower() == "true"
