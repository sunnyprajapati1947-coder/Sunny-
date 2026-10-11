#!/usr/bin/env python3
"""Jarvis — the voice-first Nova experience on Termux.

Baat karo, kaam karwao:
    python3 jarvis.py            # voice mode (Termux:API) ya auto text mode
    python3 jarvis.py --text     # force typing mode

Loop: suno -> socho (tools + local model + memory) -> bolo.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _load_env_file(path: Path) -> None:
    """Load config/nova.env without overriding real environment variables."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(ROOT / "config" / "nova.env")

from core.conversation import add as history_add
from core.conversation import reset as history_reset
from core.conversation import summarize_load
from core.identity import NOVA_NAME, OWNER_NAME
from core.voice_interface import listen, speak, status as voice_status

THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def clean_reply(text: str) -> str:
    """Local reasoning models emit <think>...</think>; strip before speaking."""
    text = THINK_BLOCK.sub("", str(text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def ensure_lanes() -> tuple[bool, bool]:
    """Start/check Nova's local model lanes (same logic as nova_chat)."""
    import subprocess
    from urllib.request import urlopen

    def healthy(url: str) -> bool:
        try:
            with urlopen(url, timeout=1.5) as response:
                return response.status == 200
        except Exception:
            return False

    fast_url = "http://127.0.0.1:8081/v1/models"
    deep_url = "http://127.0.0.1:8080/v1/models"
    fast_ok = healthy(fast_url)
    if not fast_ok:
        script = ROOT / "automation" / "start_fast_lane.sh"
        if script.is_file():
            subprocess.run(["bash", str(script)], cwd=ROOT, check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        fast_ok = healthy(fast_url)
    deep_ok = healthy(deep_url)
    return fast_ok, deep_ok


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    force_text = "--text" in argv

    from core.jarvis_brain import respond

    voice = voice_status()
    if force_text:
        voice = {**voice, "mode": "text", "tts_available": False, "stt_available": False}

    print(f"⚡ {NOVA_NAME} voice assistant — {OWNER_NAME} ka apna Jarvis")
    print(f"Mode: {voice['mode'].upper()} | TTS: {'ON' if voice['tts_available'] else 'OFF'} | STT: {'ON' if voice['stt_available'] else 'OFF'}")
    if voice["mode"] == "text":
        print("(Termux:API app + 'pkg install termux-api' se voice ON hoga)")

    print("Local lanes check kar raha hu...")
    fast_ok, deep_ok = ensure_lanes()
    lane = "READY" if (fast_ok or deep_ok) else "OFFLINE"
    print(f"Thinking lane: {lane} (fast={'ON' if fast_ok else 'OFF'}, deep={'ON' if deep_ok else 'OFF'})")
    try:
        from core.gemini_lane import has_key, _model
        if has_key():
            print(f"Smart lane: GEMINI ON ({_model()}) — complex sawaal yahan jayenge")
        else:
            print("Smart lane: GEMINI OFF (key nahi hai) — add: bash automation/add_gemini_key.sh")
    except Exception:
        pass
    # Wake lock: screen off ho tab bhi Jarvis zinda rahe.
    import shutil as _shutil
    if _shutil.which("termux-wake-lock"):
        subprocess.run(["termux-wake-lock"], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, check=False)
        print("Wake lock ON (phone lock hone pe bhi sunta rahunga)")
    mem = summarize_load()
    print(f"Memory: {mem['turns_stored']} turns stored | Commands: /status, /reset, /exit")

    greeting = f"{OWNER_NAME}, {NOVA_NAME} online. Bolo, kya kaam karna hai?"
    print(f"\n{NOVA_NAME} → {greeting}")
    speak(greeting)

    while True:
        heard = listen(f"You ({voice['mode']}) → ")
        if not heard.get("success"):
            continue
        text = heard["text"].strip()
        if not text:
            continue

        cmd = text.lower()
        if cmd == "/status":
            fast_ok, deep_ok = ensure_lanes()
            gem = "OFF"
            try:
                from core.gemini_lane import has_key
                if has_key():
                    gem = "ON"
            except Exception:
                pass
            line = f"fast={'ON' if fast_ok else 'OFF'}, deep={'ON' if deep_ok else 'OFF'}, gemini={gem}, turns={summarize_load()['turns_stored']}"
            print(f"{NOVA_NAME} → {line}")
            speak(f"Fast {'on' if fast_ok else 'off'}, deep {'on' if deep_ok else 'off'}, Gemini {gem.lower()}.")
            continue
        if cmd == "/reset":
            history_reset()
            line = "Chat memory mit gayi. Personal facts safe hain."
            print(f"{NOVA_NAME} → {line}")
            speak(line)
            continue

        result = respond(text)
        if not result.get("success"):
            print(f"{NOVA_NAME} → {result.get('error', 'kuch gadbad ho gayi')}")
            continue

        reply = clean_reply(result["reply"])
        via = result.get("via", "local")
        print(f"{NOVA_NAME} [{via}] → {reply}")
        speak(reply)

        history_add("user", text)
        history_add("assistant", reply)

        if result.get("exit"):
            break
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyboardInterrupt, EOFError):
        print(f"\n{NOVA_NAME} → Bye Boss.")
        raise SystemExit(0)
