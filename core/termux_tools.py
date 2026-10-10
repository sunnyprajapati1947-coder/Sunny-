from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path
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


# Whitelisted apps Jarvis can open: name -> (app scheme uri, web fallback).
KNOWN_APPS: dict[str, tuple[str, str]] = {
    "instagram": ("instagram://app", "https://instagram.com"),
    "whatsapp": ("whatsapp://send", "https://www.whatsapp.com"),
    "youtube": ("https://www.youtube.com", "https://www.youtube.com"),
    "facebook": ("fb://facewebmodal/f?href=https://www.facebook.com", "https://www.facebook.com"),
    "fb": ("fb://facewebmodal/f?href=https://www.facebook.com", "https://www.facebook.com"),
    "gmail": ("googlegmail://", "https://mail.google.com"),
    "mail": ("googlegmail://", "https://mail.google.com"),
    "maps": ("geo:0,0", "https://maps.google.com"),
    "google": ("https://www.google.com", "https://www.google.com"),
    "chrome": ("googlechrome://", "https://www.google.com"),
    "twitter": ("twitter://home", "https://x.com"),
    "x": ("twitter://home", "https://x.com"),
    "telegram": ("tg://", "https://web.telegram.org"),
    "spotify": ("spotify://", "https://open.spotify.com"),
    "playstore": ("market://", "https://play.google.com"),
    "play store": ("market://", "https://play.google.com"),
    "github": ("https://github.com", "https://github.com"),
    "chatgpt": ("https://chat.openai.com", "https://chat.openai.com"),
    "wikipedia": ("https://wikipedia.org", "https://wikipedia.org"),
    "amazon": ("https://www.amazon.in", "https://www.amazon.in"),
    "flipkart": ("https://www.flipkart.com", "https://www.flipkart.com"),
}

_APP_NAME_RE = re.compile(r"\b(" + "|".join(sorted(KNOWN_APPS, key=len, reverse=True)) + r")\b")


def open_app(target: str) -> dict[str, Any]:
    """Open an app or website on the phone.

    Only whitelisted app names and safe http(s) URLs are accepted; nothing
    else is executed. App schemes are tried first (opens the native app),
    falling back to the browser.
    """
    target = str(target or "").strip().lower()
    if not target:
        return {"success": False, "error": "Kya kholna hai? Naam bolo."}

    def _open(uri: str) -> bool:
        # `am` lives at /system/bin/am on Android - not on Termux's PATH.
        if Path(AM_BIN).exists():
            done = subprocess.run(
                [AM_BIN, "start", "-a", "android.intent.action.VIEW", "-d", uri],
                capture_output=True, text=True, timeout=10, check=False,
            )
            if done.returncode == 0:
                return True
        return _run(["termux-open-url", uri]).get("success") is True

    # Direct URL in the request.
    if target.startswith(("http://", "https://")):
        if _open(target):
            return {"success": True, "opened": target, "mode": "url"}
        return {"success": False, "error": "Open nahi ho paya."}

    # Whitelisted app name (allow 'instagram kholo' style extra words).
    m = _APP_NAME_RE.search(target)
    if not m:
        return {
            "success": False,
            "error": "Ye app meri list me nahi hai.",
            "known": ", ".join(sorted(set(KNOWN_APPS))[:12]),
        }
    name = m.group(0)
    scheme, web = KNOWN_APPS[name]
    if _open(scheme):
        return {"success": True, "opened": name, "mode": "app"}
    if _open(web):
        return {"success": True, "opened": name, "mode": "browser"}
    return {"success": False, "error": f"{name} open nahi ho paya."}


def torch_light(on: bool = True) -> dict[str, Any]:
    """Phone torch (flashlight) on/off. Needs Termux:API + camera permission."""
    state = "on" if on else "off"
    result = _run(["termux-torch", state])
    if result.get("success"):
        return {"success": True, "torch": state}
    return {
        "success": False,
        "error": "Torch nahi chala — Termux app ko Camera permission do (Android Settings > Apps > Termux > Permissions).",
    }


def clipboard_get() -> dict[str, Any]:
    """Read the phone clipboard."""
    if shutil.which("termux-clipboard-get") is None:
        return {"success": False, "error": "termux-clipboard-get unavailable."}
    try:
        done = subprocess.run(
            ["termux-clipboard-get"], capture_output=True, text=True,
            timeout=10, check=False,
        )
        text = (done.stdout or "").strip()
        return {"success": done.returncode == 0, "text": text}
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {"success": False, "error": str(exc)}


def clipboard_set(text: str) -> dict[str, Any]:
    """Write to the phone clipboard."""
    if shutil.which("termux-clipboard-set") is None:
        return {"success": False, "error": "termux-clipboard-set unavailable."}
    try:
        done = subprocess.run(
            ["termux-clipboard-set"], input=str(text or "")[:5000],
            capture_output=True, text=True, timeout=10, check=False,
        )
        return {"success": done.returncode == 0, "copied": str(text or "")[:200]}
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {"success": False, "error": str(exc)}


VOLUME_STREAMS = {"music", "ring", "notification", "alarm", "system"}

# `am` lives at /system/bin/am on Android - not on Termux's PATH.
AM_BIN = "/system/bin/am"


def set_volume(volume: int, stream: str = "music") -> dict[str, Any]:
    """Set a phone volume stream (0-100)."""
    stream = str(stream or "music").strip().lower()
    if stream not in VOLUME_STREAMS:
        return {"success": False, "error": f"Stream must be one of: {', '.join(sorted(VOLUME_STREAMS))}."}
    try:
        volume = max(0, min(int(volume), 100))
    except (TypeError, ValueError):
        return {"success": False, "error": "Volume 0-100 me do."}
    result = _run(["termux-volume", stream, str(volume)])
    if result.get("success"):
        return {"success": True, "stream": stream, "volume": volume}
    return {"success": False, "error": "Volume set nahi hua — Termux:API check karo."}


def set_brightness(percent: int) -> dict[str, Any]:
    """Set screen brightness (0-100)."""
    try:
        percent = max(1, min(int(percent), 100))
    except (TypeError, ValueError):
        return {"success": False, "error": "Brightness 1-100 me do."}
    result = _run(["termux-brightness", str(percent)])
    if result.get("success"):
        return {"success": True, "brightness": percent}
    return {"success": False, "error": "Brightness set nahi hui — Termux:API check karo."}
