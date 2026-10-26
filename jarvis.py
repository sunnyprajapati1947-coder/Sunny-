#!/usr/bin/env python3
"""J.A.R.V.I.S. launcher.

    python3 jarvis.py                # start the HUD (http://127.0.0.1:7777)
    python3 jarvis.py --no-browser   # start without opening a browser
    python3 jarvis.py --cli          # terminal assistant
    python3 jarvis.py --cli --voice  # terminal assistant with microphone + speech
    python3 jarvis.py --check        # self-diagnostics
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis import __version__  # noqa: E402
from jarvis.config import LOG_DIR, ensure_dirs, get_settings  # noqa: E402


def setup_logging(verbose: bool = False) -> None:
    ensure_dirs()
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    level = logging.DEBUG if verbose else logging.INFO
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    try:
        handlers.append(logging.FileHandler(LOG_DIR / "jarvis.log", encoding="utf-8"))
    except OSError:
        pass
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
        handlers=handlers,
    )
    logging.getLogger("jarvis.server").setLevel(logging.WARNING)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="jarvis",
        description="J.A.R.V.I.S. — Just A Rather Very Intelligent System",
    )
    parser.add_argument("--host", default=None, help="Bind address (default 0.0.0.0)")
    parser.add_argument("--port", type=int, default=None, help="Port (default 7777)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser window")
    parser.add_argument("--cli", action="store_true", help="Run the terminal assistant")
    parser.add_argument("--voice", action="store_true", help="Voice I/O in CLI mode (implies --cli)")
    parser.add_argument("--wake", default="", help="Require this wake word in voice mode")
    parser.add_argument("--check", action="store_true", help="Run self-diagnostics and exit")
    parser.add_argument("--desktop-check", dest="desktop_check", action="store_true",
                        help="Report desktop-control readiness and exit")
    parser.add_argument("--phone-check", dest="phone_check", action="store_true",
                        help="Report the Android phone hand (Termux:API) and exit")
    parser.add_argument("--brain", action="store_true", help="Show local brain status and exit")
    parser.add_argument("--brain-setup", dest="brain_setup", action="store_true", help="Print local Qwen setup commands and exit")
    parser.add_argument("--test-brain", dest="test_brain", action="store_true", help="Ping the fastest local Qwen lane and exit")
    parser.add_argument("--agent", metavar="GOAL", default="", help="Run the multi-step agent on a goal and exit")
    parser.add_argument("--plans", action="store_true", help="List persistent plans and exit")
    parser.add_argument("--memory", metavar="QUERY", default=None, help="Search the memory journal and exit")
    parser.add_argument("--verbose", action="store_true", help="Verbose logging")
    parser.add_argument("--version", action="version", version=f"J.A.R.V.I.S. {__version__}")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    setup_logging(args.verbose or bool(os.getenv("JARVIS_DEBUG")))
    settings = get_settings()

    if args.check:
        from jarvis.cli import run_checks

        return run_checks()

    terminal_actions = {
        "desktop_check": ("desktop_check", {}),
        "phone_check": ("phone_check", {}),
        "brain": ("brain_status", {}),
        "brain_setup": ("brain_setup", {}),
        "test_brain": ("brain_test", {}),
        "plans": ("plan_show", {}),
    }
    for flag, (tool_name, arguments) in terminal_actions.items():
        if getattr(args, flag):
            return _run_tool(tool_name, arguments)
    if args.agent:
        return _run_tool("agent_run", {"goal": args.agent})
    if args.memory is not None:
        return _run_tool("memory_search", {"query": args.memory})

    if args.cli or args.voice:
        from jarvis.cli import interactive

        wake = args.wake or (settings.wake_word if settings.wake_word_enabled else "")
        return interactive(voice=args.voice, wake=wake)

    from jarvis.server import run

    run(
        host=args.host or settings.host,
        port=args.port or settings.port,
        open_browser=not args.no_browser,
    )
    return 0


def _run_tool(name: str, arguments: dict) -> int:
    """Small terminal renderer for the one-shot CLI tools."""
    from jarvis import tools

    result = tools.TOOLS[name].run(**arguments)
    print()
    print("  " + str(result.get("text") or "").strip())
    for card in result.get("cards") or []:
        title = str(card.get("title") or card.get("type") or "").upper()
        rows = card.get("rows") or card.get("items") or []
        if title:
            print()
            print(f"  {title}")
        for row in rows:
            print(f"    {row}")
        if card.get("text"):
            print(f"    {card['text']}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
