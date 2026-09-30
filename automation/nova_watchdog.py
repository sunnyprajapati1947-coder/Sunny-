#!/usr/bin/env python3
"""Small Termux watchdog: self-heal local Qwen and keep Nova automation alive."""
from __future__ import annotations
import os
import time
from repair.self_heal import self_heal_once

INTERVAL = max(15, int(os.getenv("NOVA_WATCHDOG_INTERVAL", "60")))

def main() -> None:
    while True:
        try:
            self_heal_once()
        except Exception as exc:
            print(f"watchdog error: {type(exc).__name__}: {exc}", flush=True)
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
