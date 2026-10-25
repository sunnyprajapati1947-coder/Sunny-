"""Allow `python3 -m jarvis …` (same commands as run_jarvis.py)."""

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
