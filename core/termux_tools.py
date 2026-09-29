from __future__ import annotations

import json
import shutil
import subprocess
from typing import Any


def _run(command: list[str], timeout: int = 10) -> dict[str, Any]:
    if not command or shutil.which(command[0]) is None:
        return {
            "success": False,
            "error": f"Command unavailable: {command[0] if command else 'unknown'}",
        }

    try:
        p = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        stdout = p.stdout.strip()
        stderr = p.stderr.strip()

        if stdout:
            try:
                data = json.loads(stdout)
            except json.JSONDecodeError:
                data = stdout
        else:
            data = stderr

        return {
            "success": p.returncode == 0,
            "returncode": p.returncode,
            "data": data,
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": "Termux API command timed out",
        }


def battery_status() -> dict[str, Any]:
    return _run(["termux-battery-status"])


def device_volume() -> dict[str, Any]:
    return _run(["termux-volume"])


def notify(title: str, content: str) -> dict[str, Any]:
    return _run([
        "termux-notification",
        "--title", str(title),
        "--content", str(content),
    ])


def toast(message: str) -> dict[str, Any]:
    return _run(["termux-toast", str(message)])


def vibrate(duration_ms: int = 200) -> dict[str, Any]:
    duration_ms = max(50, min(int(duration_ms), 3000))
    return _run(["termux-vibrate", "-d", str(duration_ms)])
