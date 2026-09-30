#!/usr/bin/env python3
"""Interactive Nova terminal chat with automatic local-lane startup and health checks."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
FAST_HEALTH = os.getenv("NOVA_FAST_QWEN_URL", "http://127.0.0.1:8081/v1/chat/completions").rsplit("/chat/completions", 1)[0] + "/models"
DEEP_HEALTH = os.getenv("NOVA_QWEN_URL", "http://127.0.0.1:8080/v1/chat/completions").rsplit("/chat/completions", 1)[0] + "/models"


def healthy(url: str, timeout: float = 1.5) -> bool:
    try:
        with urlopen(url, timeout=timeout) as response:
            return response.status == 200
    except Exception:
        return False


def ensure_lanes() -> tuple[bool, bool]:
    """Start only the existing Nova fast/deep lanes when unavailable."""
    fast_ok = healthy(FAST_HEALTH)
    if not fast_ok:
        script = ROOT / "automation" / "start_fast_lane.sh"
        if script.is_file():
            subprocess.run(["bash", str(script)], cwd=ROOT, check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        fast_ok = healthy(FAST_HEALTH)

    deep_ok = healthy(DEEP_HEALTH)
    if not deep_ok:
        heal = ROOT / "repair" / "self_heal.py"
        if heal.is_file():
            subprocess.run([sys.executable, str(heal)], cwd=ROOT, check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deep_ok = healthy(DEEP_HEALTH)
    return fast_ok, deep_ok


def main() -> int:
    print("⚡ Nova interactive chat")
    print("Starting/checking local Nova lanes...")
    fast_ok, deep_ok = ensure_lanes()
    print(f"Nova lanes: fast={'READY' if fast_ok else 'OFFLINE'}, deep={'READY' if deep_ok else 'OFFLINE'}")
    print("Type your question normally. Commands: /status, /restart, /exit")

    from core.fast_router import ask

    while True:
        try:
            q = input("\nYou → ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nNova chat closed.")
            return 0
        if not q:
            continue

        cmd = q.lower()
        if cmd in {"/exit", "exit", "quit"}:
            print("Nova → Bye.")
            return 0
        if cmd == "/status":
            fast_ok, deep_ok = ensure_lanes()
            print(f"Nova → fast={'READY' if fast_ok else 'OFFLINE'}, deep={'READY' if deep_ok else 'OFFLINE'}")
            continue
        if cmd == "/restart":
            fast_ok, deep_ok = False, False
            script = ROOT / "automation" / "start_fast_lane.sh"
            heal = ROOT / "repair" / "self_heal.py"
            if script.is_file():
                subprocess.run(["bash", str(script)], cwd=ROOT, check=False)
            if heal.is_file():
                subprocess.run([sys.executable, str(heal)], cwd=ROOT, check=False)
            fast_ok, deep_ok = ensure_lanes()
            print(f"Nova → restart check: fast={'READY' if fast_ok else 'OFFLINE'}, deep={'READY' if deep_ok else 'OFFLINE'}")
            continue

        result = ask(q)
        if result.get("success"):
            print(f"\nNova [{result.get('lane', 'local')}] → {result.get('answer', '')}")
            continue

        # Recover once automatically, then retry the same question.
        ensure_lanes()
        result = ask(q)
        if result.get("success"):
            print(f"\nNova [{result.get('lane', 'local')}] → {result.get('answer', '')}")
        else:
            print("\nNova → Local models are still unavailable. Check workspace/logs/fast_lane.log and qwen-self-heal.log.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
