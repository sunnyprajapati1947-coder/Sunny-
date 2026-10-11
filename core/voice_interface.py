"""Jarvis voice interface for Termux — speak and listen like a human.

Uses the Termux:API add-on commands, which need no extra Python packages:
- termux-tts-speak  -> text to speech (offline, Android engine)
- termux-speech-to-text -> one-shot Google speech dictation

Both degrade gracefully: without Termux:API the interface falls back to plain
terminal input/output so Jarvis still works on any Linux box or CI runner.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from typing import Any

TTS_ENGINE = "default"
TTS_PITCH = "1.05"   # thoda sweet
TTS_RATE = "0.9"     # thoda slow, natural
SPEAK_TIMEOUT = 60.0
LISTEN_TIMEOUT = 120.0

# Words that sound terrible when read aloud by a TTS engine.
_STRIP_FOR_TTS = re.compile(r"[*_`#>\[\](){}|~^]|:(?:-?\)|-?\()|<[^>]+>")
_MARKDOWN_LINK = re.compile(r"\[([^\]]*)\]\((https?://[^)]+)\)")
_BARE_URL = re.compile(r"https?://\S+")
# Emoji and misc symbols - most TTS engines choke on them or stay silent.
_EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F0FF"
    "\U00002190-\U000021FF\U00002B00-\U00002BFF\U0000FE0F\U0000200D]"
)


def _setting(name: str, default: str) -> str:
    """Read a TTS setting at call time so env changes take effect."""
    return os.getenv(name, default)


def tts_available() -> bool:
    return shutil.which("termux-tts-speak") is not None


def stt_available() -> bool:
    return shutil.which("termux-speech-to-text") is not None


def clean_for_speech(text: str) -> str:
    """Strip markdown/emoji-ish noise so spoken audio sounds natural."""
    text = _MARKDOWN_LINK.sub(r"\1", str(text or ""))  # [label](url) -> label
    text = _BARE_URL.sub("", text)                      # bare urls -> gone
    text = _STRIP_FOR_TTS.sub(" ", text)
    text = _EMOJI.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def speak(text: str) -> dict[str, Any]:
    """Say something out loud on the phone (falls back to print)."""
    words = clean_for_speech(text)
    if not words:
        return {"success": False, "error": "Nothing to say."}
    if not tts_available():
        print(f"[voice-off] {words}")
        return {"success": True, "spoken": False, "text": words, "engine": "text"}
    engine = _setting("NOVA_TTS_ENGINE", TTS_ENGINE)
    language = _setting("NOVA_TTS_LANGUAGE", "")
    pitch = _setting("NOVA_TTS_PITCH", TTS_PITCH)
    rate = _setting("NOVA_TTS_RATE", TTS_RATE)
    try:
        timeout = float(_setting("NOVA_TTS_TIMEOUT", str(SPEAK_TIMEOUT)))
    except ValueError:
        timeout = SPEAK_TIMEOUT
    command = ["termux-tts-speak"]
    if engine and engine != "default":
        command += ["-e", engine]
    if language:
        command += ["-l", language]
    if pitch:
        command += ["-p", pitch]
    if rate:
        command += ["-r", rate]
    command.append(words)
    try:
        done = subprocess.run(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            check=False,
        )
        ok = done.returncode == 0
    except (subprocess.TimeoutExpired, OSError):
        ok = False
    if not ok:
        print(f"[voice-failed] {words}")
        return {"success": True, "spoken": False, "text": words, "engine": "text"}
    return {"success": True, "spoken": True, "text": words, "engine": "termux-tts-speak"}


def listen(prompt: str = "") -> dict[str, Any]:
    """Listen once via the Android speech dialog (falls back to typing).

    Returns {"success": True, "text": ...} or {"success": False, "error": ...}.
    """
    if not stt_available():
        try:
            text = input(prompt or "You (type) → ").strip()
        except (EOFError, KeyboardInterrupt):
            return {"success": False, "error": "input closed"}
        if not text:
            return {"success": False, "error": "empty input"}
        return {"success": True, "text": text, "source": "typed"}

    # termux-speech-to-text blocks until the user finishes one dictation.
    try:
        done = subprocess.run(
            ["termux-speech-to-text"],
            capture_output=True,
            text=True,
            timeout=LISTEN_TIMEOUT,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "listening timed out"}
    except OSError as exc:
        return {"success": False, "error": f"speech-to-text failed: {exc}"}

    text = (done.stdout or "").strip()
    if not text:
        return {"success": False, "error": "kuch sunai nahi diya"}
    return {"success": True, "text": text, "source": "speech"}


def status() -> dict[str, Any]:
    return {
        "success": True,
        "tts_available": tts_available(),
        "stt_available": stt_available(),
        "mode": "voice" if (tts_available() and stt_available()) else "text",
        "tts_engine": _setting("NOVA_TTS_ENGINE", TTS_ENGINE),
        "tts_language": _setting("NOVA_TTS_LANGUAGE", "") or "device default",
    }
