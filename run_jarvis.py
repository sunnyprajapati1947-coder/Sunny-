#!/usr/bin/env python3
"""JARVIS launcher — the one file you type.

    python3 run_jarvis.py doctor
    python3 run_jarvis.py serve
    python3 run_jarvis.py chat "namaste"

It is a thin wrapper so the app can also be run as `python3 -m jarvis`.
Python 3.9+ and zero third-party packages.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from jarvis.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
