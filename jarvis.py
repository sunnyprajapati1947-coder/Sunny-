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


if __name__ == "__main__":
    raise SystemExit(main())
