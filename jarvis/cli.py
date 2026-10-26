"""Terminal interface, voice mode and self-diagnostics."""
from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

from jarvis import __version__, net, sysinfo
from jarvis.brain import get_brain
from jarvis.config import DATA_DIR, get_settings
from jarvis.core import JarvisCore
from jarvis.security import ALLOWED_BINARIES
from jarvis.util import human_uptime

RESET = "\033[0m"
CYAN = "\033[96m"
GOLD = "\033[93m"
DIM = "\033[2m"
GREEN = "\033[92m"
RED = "\033[91m"
BOLD = "\033[1m"


def _c(text: str, color: str) -> str:
    if not sys.stdout.isatty():
        return text
    return f"{color}{text}{RESET}"


def banner() -> str:
    return (
        _c("╔══════════════════════════════════════════════════════════╗\n", CYAN)
        + _c("║  J.A.R.V.I.S. · MARK VII · Just A Rather Very Intelligent System\n", CYAN)
        + _c("╚══════════════════════════════════════════════════════════╝", CYAN)
    )


def print_reply(result: dict) -> None:
    meta = result.get("meta") or {}
    tags = " · ".join(
        str(part)
        for part in (
            meta.get("intent"),
            meta.get("provider"),
            f"{meta.get('ms', 0)}ms",
        )
        if part
    )
    print(_c(f"\nJARVIS [{tags}]", GOLD))
    print(result.get("reply") or "(no reply)")
    for card in (result.get("cards") or [])[:4]:
        kind = card.get("type")
        if kind in {"link"} and card.get("url"):
            print(_c(f"  ↗ {card.get('title')} — {card.get('url')}", DIM))
        elif kind in {"list"}:
            print(_c(f"  {card.get('title')}", DIM))
            for item in (card.get("items") or [])[:8]:
                print(_c(f"    · {item}", DIM))
        elif kind == "weather":
            print(
                _c(
                    f"  {card.get('city')}: {card.get('temp')}°C, {card.get('condition')} "
                    f"(H {card.get('high')} / L {card.get('low')})",
                    DIM,
                )
            )
    if result.get("approval"):
        approval = result["approval"]
        print(_c(f"  ⚠ Approval required: {approval.get('summary')}", RED))
        print(_c("  Use the HUD to authorize, or run with the web interface.", DIM))


class Voice:
    """Optional speech I/O. Degrades gracefully when libraries are absent."""

    def __init__(self):
        self.tts = None
        self.stt = None
        self.mic = None
        try:
            import pyttsx3  # type: ignore

            self.tts = pyttsx3.init()
            self.tts.setProperty("rate", 170)
        except Exception:
            self.tts = None
        try:
            import speech_recognition as sr  # type: ignore

            self.stt = sr.Recognizer()
            self.stt.dynamic_energy_threshold = True
            self.mic = sr.Microphone()
        except Exception:
            self.stt = None
            self.mic = None

    def speak(self, text: str) -> None:
        text = str(text or "").strip()
        if not text:
            return
        if self.tts is not None:
            try:
                self.tts.say(text[:600])
                self.tts.runAndWait()
                return
            except Exception:
                pass
        for binary in ("espeak-ng", "espeak", "say"):
            if shutil.which(binary):
                from jarvis.security import run_command

                argv = [binary, "-v", "en-gb", text[:400]] if binary.startswith("espeak") else [binary, text[:400]]
                run_command(argv, timeout=30)
                return

    def listen(self, wake: str = "") -> str | None:
        if self.stt is None or self.mic is None:
            return None
        import speech_recognition as sr  # type: ignore

        try:
            with self.mic as source:
                self.stt.adjust_for_ambient_noise(source, duration=0.4)
                print(_c("◉ listening…", CYAN))
                audio = self.stt.listen(source, timeout=8, phrase_time_limit=12)
            text = self.stt.recognize_google(audio, language=get_settings().language)
            print(_c(f"  heard: {text}", DIM))
            lowered = text.lower()
            if wake and wake.lower() not in lowered:
                print(_c(f"  (wake word “{wake}” not heard)", DIM))
                return None
            return text
        except sr.WaitTimeoutError:
            return None
        except Exception as exc:
            print(_c(f"  speech error: {type(exc).__name__}: {exc}", RED))
            return None


def interactive(voice: bool = False, wake: str = "") -> int:
    settings = get_settings()
    core = JarvisCore()
    core.start()
    print(banner())
    print(_c(f"  {settings.owner} · {settings.city} · brain: {core.brain.status().get('mode')}", DIM))
    print(_c("  Type a command, or /help for controls. Ctrl+C to exit.\n", DIM))

    speaker = Voice() if voice else None
    if voice and (speaker.tts is None and not any(shutil.which(b) for b in ("espeak-ng", "espeak", "say"))):
        print(_c("  Voice output unavailable: install pyttsx3 or espeak-ng.", GOLD))
    if voice and speaker.stt is None:
        print(_c("  Speech recognition unavailable: install SpeechRecognition + PyAudio.", GOLD))

    listening = voice and speaker.stt is not None
    while True:
        try:
            if listening:
                query = speaker.listen(wake)
                if not query:
                    continue
            else:
                query = input(_c("You → ", CYAN)).strip()
        except (EOFError, KeyboardInterrupt):
            print("\n" + _c("JARVIS → Powering down, Sir.", GOLD))
            core.stop()
            return 0

        if not query:
            continue
        lowered = query.lower().strip()
        if lowered in {"/exit", "exit", "quit", "/quit"}:
            print(_c("JARVIS → Going dark, Sir.", GOLD))
            core.stop()
            return 0
        if lowered in {"/help", "/commands"}:
            print(_c(
                "Controls: /status · /voice · /wake · /tools · /history · /exit\n"
                "Try: “Remind me to call the bank at 6 pm”, “Weather in Patna”, "
                "“Set a 5 minute timer”, “Send a WhatsApp to Rahul saying I am late”.",
                DIM,
            ))
            continue
        if lowered == "/status":
            status = core.status()
            print(_c(
                f"CPU {status['metrics']['cpu']}% · MEM {status['metrics']['memory']['percent']}% · "
                f"DISK {status['metrics']['disk']['percent']}% · tools {status['tools']} · "
                f"brain {status['brain']['mode']}",
                DIM,
            ))
            continue
        if lowered == "/tools":
            for category, items in core.status()["tool_categories"].items():
                names = ", ".join(tool.name for tool in __import__("jarvis.tools", fromlist=["TOOLS"]).by_category()[category])
                print(_c(f"  {category}: {names}", DIM))
            continue
        if lowered == "/history":
            for entry in core.store.history(10):
                print(_c(f"  {entry.get('ts', '')[11:19]} {entry.get('role')}: {entry.get('text', '')[:120]}", DIM))
            continue
        if lowered == "/voice":
            if speaker is None:
                speaker = Voice()
            listening = speaker.stt is not None
            print(_c(f"Voice input {'ON' if listening else 'UNAVAILABLE'}", GOLD))
            continue
        if lowered == "/wake":
            wake = "" if wake else (settings.wake_word or "jarvis")
            print(_c(f"Wake word {'set to ' + wake if wake else 'disabled'}", GOLD))
            continue
        if lowered == "/mute":
            voice = not voice
            print(_c(f"Speech output {'ON' if voice else 'OFF'}", GOLD))
            continue

        result = core.handle(query, source="voice" if listening else "cli")
        print_reply(result)
        if voice and speaker and result.get("speech"):
            speaker.speak(result["speech"])


def run_checks() -> int:
    settings = get_settings()
    core = JarvisCore()
    status = core.status()
    results: list[tuple[str, str, str]] = []

    def add(label: str, ok: bool, detail: str = "") -> None:
        results.append((label, "PASS" if ok else "WARN", detail))

    add("Python", sys.version_info >= (3, 9), sys.version.split()[0])
    add("Tools registered", status["tools"] > 20, f"{status['tools']} capabilities")
    add("Data directory", DATA_DIR.exists() or DATA_DIR.parent.exists(), str(DATA_DIR))
    metrics = status["metrics"]
    add("Telemetry", metrics is not None, f"CPU {metrics['cpu']}% · MEM {metrics['memory']['percent']}%")
    add("Network", bool((metrics.get("network") or {}).get("online")), str(metrics.get("ip")))
    add("Gemini link", bool(settings.gemini_key), settings.gemini_model if settings.gemini_key else "set GEMINI_API_KEY to enable")
    from jarvis.skills import system as system_skill

    display = system_skill.has_display()
    add("Display", display, "desktop control available" if display else "headless session (HUD still works)")
    audio = next((b for b in ("pactl", "amixer", "wpctl") if shutil.which(b)), "")
    add("Audio control", bool(audio), audio or "no mixer found")
    nux = shutil.which("termux-battery-status")
    add("Termux bridge", bool(nux), nux or "optional")

    try:
        import speech_recognition  # type: ignore  # noqa: F401

        stt = True
    except Exception:
        stt = False
    try:
        import pyttsx3  # type: ignore  # noqa: F401

        tts = True
    except Exception:
        tts = False
    add("Speech input (CLI)", stt, "SpeechRecognition installed" if stt else "optional: pip install SpeechRecognition pyaudio")
    add("Speech output (CLI)", tts, "pyttsx3 installed" if tts else "browser TTS covers the HUD")

    brain = get_brain().status()
    add("Brain mode", True, brain["mode"])
    for label, url in (("Qwen deep lane", settings.qwen_url), ("Qwen fast lane", settings.fast_qwen_url)):
        base = url.rsplit("/chat/completions", 1)[0]
        try:
            net.get_json(base + "/models", timeout=1.2)
            add(label, True, base)
        except Exception:
            add(label, False, "not running (optional)")

    print(banner())
    print(_c(f"\n  Self-diagnostic · J.A.R.V.I.S. v{__version__} · {settings.owner}\n", BOLD))
    failures = 0
    for label, state, detail in results:
        if state == "PASS":
            mark = _c("  PASS ", GREEN)
        else:
            failures += 1
            mark = _c("  WARN ", GOLD)
        print(f"{mark} {label:<22} {detail}")
    print()
    print(_c(f"  {len(results) - failures}/{len(results)} checks passed. Start the HUD with: python3 jarvis.py", DIM))
    print()
    critical = {"Python", "Tools registered", "Data directory", "Telemetry", "Brain mode"}
    core_failures = sum(1 for label, state, _ in results if state != "PASS" and label in critical)
    return 0 if core_failures == 0 else 1
