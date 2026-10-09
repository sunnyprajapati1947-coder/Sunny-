"""Termux:API wrappers. Each tool checks that the command exists and reports NOT AVAILABLE
with a fix hint instead of pretending. Voice listening is only started by the user (CLI), never by the AI."""

from __future__ import annotations

import json
import shutil
import subprocess

from nova.context import Context
from nova.security import sanitized_env
from nova.tools.registry import Tool, ToolResult
from nova.util import truncate

HINT = "Install the Termux:API app (F-Droid/GitHub release) AND run: pkg install termux-api"


def _need(cmd: str) -> ToolResult | None:
    if shutil.which(cmd) is None:
        return ToolResult(False, error=f"NOT AVAILABLE: '{cmd}' not found. {HINT}")
    return None


def _run(argv: list[str], timeout: int = 15, stdin: str | None = None) -> ToolResult:
    try:
        proc = subprocess.run(argv, capture_output=True, text=True, timeout=timeout,
                              input=stdin, env=sanitized_env(), shell=False)
    except subprocess.TimeoutExpired:
        return ToolResult(False, error=f"{argv[0]} timed out (the Termux:API app may need permission)")
    if proc.returncode != 0:
        return ToolResult(False, error=(proc.stderr or proc.stdout or f"exit {proc.returncode}").strip()[:500])
    return ToolResult(True, output=truncate(proc.stdout.strip() or "(ok)", 3000))


def battery(args: dict, ctx: Context) -> ToolResult:
    missing = _need("termux-battery-status")
    if missing:
        return missing
    res = _run(["termux-battery-status"])
    if not res.ok:
        return res
    try:
        info = json.loads(res.output)
    except ValueError:
        return ToolResult(False, error="unexpected output from termux-battery-status")
    summary = f"battery {info.get('percentage')}% status={info.get('status')} plugged={info.get('plugged')}"
    return ToolResult(True, output=summary, data=info)


def notify(args: dict, ctx: Context) -> ToolResult:
    missing = _need("termux-notification")
    if missing:
        return missing
    res = _run(["termux-notification", "--title", args.get("title") or "Nova", "--content", args["content"][:500]])
    return ToolResult(res.ok, output="notification shown" if res.ok else "", error=res.error)


def speak(args: dict, ctx: Context) -> ToolResult:
    missing = _need("termux-tts-speak")
    if missing:
        return missing
    argv = ["termux-tts-speak"]
    if args.get("language"):
        argv += ["-l", args["language"]]
    res = _run(argv + [args["text"][:800]], timeout=60)
    return ToolResult(res.ok, output="spoken" if res.ok else "", error=res.error)


def clipboard_get(args: dict, ctx: Context) -> ToolResult:
    missing = _need("termux-clipboard-get")
    if missing:
        return missing
    return _run(["termux-clipboard-get"])


def clipboard_set(args: dict, ctx: Context) -> ToolResult:
    missing = _need("termux-clipboard-set")
    if missing:
        return missing
    res = _run(["termux-clipboard-set"], stdin=args["text"])
    return ToolResult(res.ok, output="clipboard updated" if res.ok else "", error=res.error)


TOOLS = [
    Tool("phone_battery", "Read battery level and charging state via Termux:API.", {}, battery),
    Tool("phone_notify", "Show a notification on the phone via Termux:API.",
         {"title": {"type": "str"}, "content": {"type": "str", "required": True}}, notify),
    Tool("phone_speak", "Speak text aloud with the phone's text-to-speech (Termux:API).",
         {"text": {"type": "str", "required": True}, "language": {"type": "str"}}, speak),
    Tool("phone_clipboard_get", "Read the phone clipboard (privacy sensitive; needs approval).", {},
         clipboard_get, risk="confirm"),
    Tool("phone_clipboard_set", "Write text to the phone clipboard.",
         {"text": {"type": "str", "required": True}}, clipboard_set),
]


def capabilities() -> dict[str, bool]:
    """Which Termux:API commands are installed (does not call them)."""
    names = ["termux-battery-status", "termux-notification", "termux-tts-speak", "termux-speech-to-text",
             "termux-clipboard-get", "termux-clipboard-set", "termux-wake-lock"]
    return {n: shutil.which(n) is not None for n in names}
