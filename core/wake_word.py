"""Nova wake word — "Jarvis" bolke bulao, baaki awaazein ignore.

Real JARVIS experience: assistant hamesha sun raha hai, par sirf tab react
karta hai jab usko naam se pukara jaye ("Jarvis kya time hai?", "Nova,
mausam batao"). TV/baatein/awaaz ko ignore kar deta hai.

Env:
    NOVA_WAKE_WORD  = 1|on (default) | 0|off|false
Slash commands (/status, /reminders ...) kabhi ignore nahi hoti, aur
text (typing) mode me filter lagta hi nahi — wahan har line diliberate hai.
"""
from __future__ import annotations

import os
import re

# Speech engines "Jarvis" ko kai tarah se likhte hain — sab accept.
_WAKE_WORDS = (
    "jarvis", "jarwis", "jervis", "jarvez", "jarvas", "jarvis:",
    "jervous", "service",  # STT mis-hears
    "nova", "nova:", "novva",
    "जार्विस", "नोवा",
    "hey jarvis", "ok jarvis",
)

_WAKE_RE = re.compile(
    r"^(hey|ok|oye|are|a)\s+(" + "|".join(re.escape(w) for w in _WAKE_WORDS) + r")\b|"
    r"\b(" + "|".join(re.escape(w) for w in _WAKE_WORDS) + r")\b",
    re.IGNORECASE,
)

_TRUE = {"1", "on", "true", "yes", "haan"}
_FALSE = {"0", "off", "false", "no", "nahi", "band"}


def enabled() -> bool:
    """Wake word filter on hai ya nahi (voice mode me use hota hai)."""
    val = os.getenv("NOVA_WAKE_WORD", "1").strip().lower()
    if val in _FALSE:
        return False
    return True  # default ON, khali string bhi ON


def set_enabled(on: bool) -> None:
    """Runtime toggle (os.environ set karta hai — process ke liye)."""
    os.environ["NOVA_WAKE_WORD"] = "1" if on else "0"


def is_wake(text: str) -> bool:
    """Transcript me wake word hai ya slash command hai."""
    text = str(text or "").strip()
    if not text:
        return False
    if text.startswith("/"):
        return True  # commands hamesha chalenge
    return bool(_WAKE_RE.search(text))


def strip_wake(text: str) -> str:
    """Aage/lagatar bola wake word hata do: 'Jarvis, kya time hai' -> 'kya time hai'."""
    text = str(text or "").strip()
    # "hey jarvis ..." / "ok nova ..." jaisa leading pair
    text = re.sub(
        r"^(hey|ok|oye|are|a)\s+(jarvis|jarwis|jervis|jarvez|jarvas|nova|novva|जार्विस|नोवा)\b[\s,:.!?-]*",
        "", text, flags=re.IGNORECASE)
    # akela leading wake word "jarvis, ..."
    text = re.sub(
        r"^(jarvis|jarwis|jervis|jarvez|jarvas|nova|novva|जार्विस|नोवा)\b[\s,:.!?-]*",
        "", text, flags=re.IGNORECASE)
    return text.strip()
