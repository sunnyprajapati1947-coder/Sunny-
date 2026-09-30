#!/usr/bin/env python3
"""Interactive terminal chat for Nova. Use this instead of a heredoc + input()."""
from __future__ import annotations
from core.fast_router import ask

def main() -> int:
    print("⚡ Nova interactive chat")
    print("Type your question normally. Commands: /exit, /status")
    while True:
        try:
            q = input("\nYou → ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nNova chat closed.")
            return 0
        if not q:
            continue
        if q.lower() in {"/exit", "exit", "quit"}:
            print("Nova → Bye.")
            return 0
        if q.lower() == "/status":
            print("Nova → fast/deep local router active; checking models on demand.")
            continue
        result = ask(q)
        if result.get("success"):
            print(f"\nNova [{result.get('lane', 'local')}] → {result.get('answer', '')}")
        else:
            print("\nNova → Local model is not reachable right now. Start/check the Nova lanes, then retry.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
