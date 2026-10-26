"""The phone as a real hand — Android actions through Termux:API.

Jarvis on the phone can do things, not just talk: dial a number, send an SMS,
fire a notification, buzz, toggle the torch, set the volume, read the clipboard,
speak out loud, take a photo, read notifications and fix its own location.

Everything here goes through an allow-listed ``termux-*`` binary with an explicit
argument vector — no shell, no user text concatenated into a command. On a PC
(no Termux bridge) each action says exactly what is missing and, where a browser
can do it, hands back a one-tap ``tel:`` / ``sms:`` link instead of pretending.

Setup is two pieces, both on the phone:

    pkg install termux-api          # the command-line half
    # plus the "Termux:API" app from F-Droid / Play Store (the Android half)
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import time
from pathlib import Path
from urllib.parse import quote

from jarvis.config import DATA_DIR
from jarvis.security import ALLOWED_BINARIES, run_command
from jarvis.skills.communication import _resolve_target
from jarvis.util import reply, truncate

PHONE_DIR = DATA_DIR / "phone"
ANDROID = "ANDROID_DATA" in os.environ or Path("/data/data/com.termux").is_dir()
MODEL_HINT = re.compile(r"[^A-Za-z0-9 ._+-]")

# capability -> (binary, human label)
CAPABILITIES: dict[str, tuple[str, str]] = {
    "call": ("termux-telephony-call", "place a call"),
    "sms": ("termux-sms-send", "send an SMS"),
    "notify": ("termux-notification", "post a notification"),
    "toast": ("termux-toast", "show a toast"),
    "vibrate": ("termux-vibrate", "buzz the phone"),
    "torch": ("termux-torch", "toggle the flashlight"),
    "volume": ("termux-volume", "change volume"),
    "battery": ("termux-battery-status", "read the battery"),
    "clipboard": ("termux-clipboard-set", "copy to the clipboard"),
    "clipboard_get": ("termux-clipboard-get", "read the clipboard"),
    "speak": ("termux-tts-speak", "speak out loud"),
    "contacts": ("termux-contact-list", "read phone contacts"),
    "location": ("termux-location", "get the location"),
    "camera": ("termux-camera-photo", "take a photo"),
    "notifications": ("termux-notification-list", "read notifications"),
    "open": ("termux-open", "open a file or link"),
    "wifi": ("termux-wifi-connectioninfo", "read the Wi-Fi link"),
}
INSTALL_STEPS = [
    "pkg install termux-api        # Termux side",
    "install the Termux:API app   # F-Droid or Play Store",
    "termux-battery-status        # should print JSON, not an error",
]


# ------------------------------------------------------------------ helpers
def has(binary: str) -> bool:
    return bool(shutil.which(binary))


def capabilities() -> dict[str, bool]:
    return {name: has(binary) for name, (binary, _) in CAPABILITIES.items()}


def ready() -> bool:
    caps = capabilities()
    return bool(caps.get("battery") and caps.get("notify"))


def _run(argv: list[str], timeout: float = 15.0, *, free_text: bool = False) -> dict:
    """Run a termux binary with an argv list.

    ``free_text`` is for payloads a human wrote (an SMS, a spoken line, a
    clipboard body). Those may legitimately contain ``;``, ``>`` or ``|`` — and
    because the call is ``shell=False`` with an explicit argv they are still just
    characters, never a pipeline. The binary itself must stay on the allow-list.
    """
    if not argv:
        return {"ok": False, "error": "Empty command"}
    if not free_text:
        return run_command(argv, timeout=timeout)
    binary = Path(str(argv[0])).name
    if binary not in ALLOWED_BINARIES:
        return {"ok": False, "error": f"Binary not permitted: {binary}"}
    resolved = shutil.which(str(argv[0]))
    if not resolved:
        return {"ok": False, "error": f"{binary} is not installed", "missing": binary}
    safe_args = [str(part).replace("\x00", "")[:4000] for part in argv[1:]]
    try:
        process = subprocess.run(
            [resolved, *safe_args],
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"{binary} timed out"}
    except OSError as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return {
        "ok": process.returncode == 0,
        "code": process.returncode,
        "stdout": (process.stdout or "").strip()[:2000],
        "stderr": (process.stderr or "").strip()[:1000],
    }


def _json_or_none(text: str):
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return None


def _install_card() -> dict:
    return {"type": "list", "title": "TERMUX:API SETUP", "rows": list(INSTALL_STEPS)}


def _no_hand(capability: str, *, fallback: dict | None = None) -> dict:
    """Honest refusal when this machine has no Android bridge."""
    label = CAPABILITIES.get(capability, ("", capability))[1]
    if not ANDROID:
        text = (
            f"I cannot {label} from here, Sir — this session is on "
            f"{platform.system().lower()}, not your phone. Run Jarvis in Termux on the "
            "phone (automation/termux_jarvis.sh) and the same command becomes real."
        )
    else:
        text = (
            f"I cannot {label} yet, Sir — the Termux:API bridge is not answering. "
            "Install the Termux:API app and run `pkg install termux-api`."
        )
    payload = reply(
        text,
        speech=f"I have no phone hand for that from here, Sir.",
        cards=[_install_card()],
        data={"phone": False, "capability": capability, **({"fallback": fallback} if fallback else {})},
    )
    if fallback:
        payload["action"] = {"type": "open_url", **fallback}
    return payload


def _append_note(text: str, title: str = "") -> None:
    """Remember what the hand did, so the HUD can show a trail."""
    try:
        PHONE_DIR.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y-%m-%dT%H:%M:%S")
        with (PHONE_DIR / "hand.log").open("a", encoding="utf-8") as handle:
            handle.write(f"{stamp}\t{title}\t{truncate(text, 200)}\n")
    except OSError:
        pass


# -------------------------------------------------------------- diagnostics
def phone_check() -> dict:
    """Exact readiness report for the phone hand."""
    caps = capabilities()
    rows = [
        f"android bridge: {'present' if ANDROID else 'not this machine'}",
        f"termux:api app: {'answering' if ready() else 'not answering'}",
        "",
    ]
    for name, (binary, label) in CAPABILITIES.items():
        rows.append(f"{label}: {'ok' if caps[name] else 'missing'} ({binary})")
    missing = [name for name, ok in caps.items() if not ok]
    if missing:
        rows += ["", *INSTALL_STEPS]
    else:
        rows += ["", "everything works — say “call <name>”, “flashlight on”, “phone battery”"]
    headline = (
        "The phone hand is fully connected, Sir."
        if ready() and not missing
        else ("The phone hand is partly connected, Sir." if ready() else "No phone hand on this machine, Sir.")
    )
    return reply(
        headline,
        speech=headline,
        cards=[{"type": "list", "title": "PHONE HAND", "rows": rows}],
        data={
            "phone": ANDROID,
            "android": ANDROID,
            "ready": ready(),
            "capabilities": caps,
            "missing": missing,
            "platform": platform.system().lower(),
        },
    )


def phone_status() -> dict:
    """One-line health plus the numbers people actually want."""
    caps = capabilities()
    if not ready():
        payload = _no_hand("battery")
        payload["text"] = (
            "I have no phone hand from here, Sir — this is a "
            f"{platform.system().lower()} session, not your phone. Run Jarvis in Termux on "
            "Android and “phone status” reports the battery, Wi-Fi and every live action."
        )
        payload["speech"] = "No phone hand from here, Sir."
        return payload
    battery = _json_or_none(_run(["termux-battery-status"]).get("stdout", ""))
    rows: list[str] = []
    data: dict = {"phone": True, "capabilities": caps}
    if isinstance(battery, dict):
        rows += [
            f"battery: {battery.get('percentage', '?')}% "
            f"({'charging' if battery.get('plugged') not in (None, 'UNPLUGGED') else 'on battery'})",
            f"health: {str(battery.get('health', '')).lower()} · temperature {battery.get('temperature', '?')}°C",
        ]
        data["battery"] = battery
    wifi = _json_or_none(_run(["termux-wifi-connectioninfo"]).get("stdout", "")) if caps.get("wifi") else None
    if isinstance(wifi, dict):
        rows.append(f"wi-fi: {wifi.get('ssid') or 'unknown'} · {wifi.get('link_speed_mbps') or '?'} Mbps")
        data["wifi"] = wifi
    online = ", ".join(name for name, ok in caps.items() if ok) or "none"
    rows += ["", f"hands-on: {online}"]
    return reply(
        "Phone hand online, Sir." if rows else "Phone hand is connected but quiet, Sir.",
        speech="Phone hand online, Sir.",
        cards=[{"type": "list", "title": "PHONE", "rows": rows}],
        data=data,
    )


def phone_battery() -> dict:
    if not has("termux-battery-status"):
        return _no_hand("battery")
    result = _run(["termux-battery-status"])
    data = _json_or_none(result.get("stdout", ""))
    if not isinstance(data, dict):
        return reply(
            "The battery bridge answered with something I could not read, Sir. "
            "Open the Termux:API app once so Android grants it permission.",
            data={"phone": True, "raw": truncate(result.get("stdout", ""), 200)},
        )
    percent = data.get("percentage", "?")
    plugged = data.get("plugged") in {"PLUGGED_AC", "PLUGGED_USB", "PLUGGED_WIRELESS"}
    return reply(
        f"Battery is at {percent}%, Sir — {'charging' if plugged else 'running on battery'}.",
        speech=f"Battery {percent} percent, Sir.",
        cards=[{"type": "telemetry", "title": "PHONE BATTERY", "items": [
            {"label": "charge", "value": f"{percent}%"},
            {"label": "state", "value": "charging" if plugged else "battery"},
            {"label": "temp", "value": f"{data.get('temperature', '?')}°C"},
            {"label": "health", "value": str(data.get('health', '?')).lower()},
        ]}],
        data={"phone": True, "battery": data},
    )


# ------------------------------------------------------------------- calling
def phone_call(contact: str = "") -> dict:
    """Dial a real number with the phone's own dialer."""
    number, label = _resolve_target(contact, "phone")
    if not number:
        return reply(
            f"I do not have a number for “{contact}”, Sir. "
            "Try “save <name>'s number as <number>” or give me the digits.",
            speech=f"No number for {contact}, Sir.",
            data={"unknown_contact": True, "contact": contact},
        )
    if not has("termux-telephony-call"):
        return _no_hand("call", fallback={"url": f"tel:+{number}", "label": f"Call {label}"})
    result = _run(["termux-telephony-call", number])
    if not result.get("ok"):
        return reply(
            f"The dialer refused the call to {label}, Sir ({truncate(result.get('stderr') or 'no answer', 120)}). "
            "Android asks for phone permission the first time — approve it once.",
            data={"phone": True, "number": number, "error": result.get("stderr", "")},
        )
    _append_note(f"called +{number}", "call")
    return reply(
        f"Calling {label} now, Sir.",
        speech=f"Calling {label}, Sir.",
        cards=[{"type": "contact", "name": label, "phone": "+" + number}],
        data={"phone": True, "number": number, "called": True},
    )


def phone_sms(contact: str = "", message: str = "") -> dict:
    """Send a real SMS from the phone's SIM."""
    number, label = _resolve_target(contact, "phone")
    text = str(message or "").strip()
    if not number:
        return reply(
            f"I do not have an SMS number for “{contact}”, Sir.",
            data={"unknown_contact": True, "contact": contact},
        )
    if not text:
        return reply(
            f"What should the SMS to {label} say, Sir?",
            speech=f"What should I text {label}, Sir?",
            data={"needs_message": True, "number": number, "label": label},
        )
    if not has("termux-sms-send"):
        fallback = {"url": f"sms:+{number}?body={text}", "label": f"SMS {label}"}
        return _no_hand("sms", fallback=fallback)
    result = _run(["termux-sms-send", "-n", number, text], free_text=True)
    if not result.get("ok"):
        return reply(
            f"The SMS to {label} failed, Sir ({truncate(result.get('stderr') or 'no answer', 120)}). "
            "Grant the SMS permission in the Termux:API app once.",
            data={"phone": True, "number": number, "error": result.get("stderr", "")},
        )
    _append_note(f"sms to +{number}: {text}", "sms")
    return reply(
        f"SMS sent to {label}, Sir.",
        speech=f"Text sent to {label}, Sir.",
        cards=[{"type": "message", "title": f"SMS · {label}", "body": text, "subtitle": f"+{number}"}],
        data={"phone": True, "number": number, "sent": True},
    )


def phone_sms_preflight(contact: str = "", message: str = "") -> dict | None:
    number, label = _resolve_target(contact, "phone")
    if not number:
        return reply(f"I do not have an SMS number for “{contact}”, Sir.", data={"unknown_contact": True})
    if not str(message or "").strip():
        return reply(f"What should the SMS to {label} say, Sir?", data={"needs_message": True})
    if not has("termux-sms-send"):
        text = str(message or "").strip()
        return _no_hand(
            "sms",
            fallback={"url": f"sms:+{number}?body={quote(text)}", "label": f"SMS {label}"},
        )
    return None


# ------------------------------------------------------------------- device
def phone_notify(title: str = "", message: str = "") -> dict:
    if not has("termux-notification"):
        return _no_hand("notify")
    heading = MODEL_HINT.sub("", str(title or "J.A.R.V.I.S."))[:60] or "J.A.R.V.I.S."
    body = str(message or "").strip()[:400] or "At your service, Sir."
    result = _run(["termux-notification", "--title", heading, "--content", body], free_text=True)
    if not result.get("ok"):
        return reply("The notification bridge refused, Sir. Open Termux:API once and retry.")
    _append_note(body, "notify")
    return reply(f"Notification posted: “{heading}”, Sir.", data={"phone": True, "title": heading})


def phone_vibrate(duration_ms: int = 300) -> dict:
    if not has("termux-vibrate"):
        return _no_hand("vibrate")
    length = max(50, min(int(duration_ms or 300), 3000))
    result = _run(["termux-vibrate", "-d", str(length)])
    if not result.get("ok"):
        return reply("The phone did not buzz, Sir — the vibration permission may be off.")
    return reply(f"Buzzed for {length} ms, Sir.", data={"phone": True, "ms": length})


def phone_torch(action: str = "toggle") -> dict:
    if not has("termux-torch"):
        return _no_hand("torch")
    state = str(action or "toggle").strip().lower()
    if state in {"on", "true", "1"}:
        want = "on"
    elif state in {"off", "false", "0"}:
        want = "off"
    else:
        want = "on" if not _torch_is_on() else "off"
    result = _run(["termux-torch", want])
    if not result.get("ok"):
        return reply("The flashlight did not respond, Sir (camera permission is needed once).")
    return reply(
        f"Flashlight {want}, Sir.",
        speech=f"Torch {want}, Sir.",
        data={"phone": True, "torch": want},
    )


def _torch_is_on() -> bool:
    # termux-torch has no query mode; treat unknown as off so "toggle" lights up.
    return False


def phone_volume(level: int | None = None, stream: str = "music") -> dict:
    if not has("termux-volume"):
        return _no_hand("volume")
    name = str(stream or "music").strip().lower()
    if name not in {"music", "ring", "notification", "alarm", "call", "system"}:
        name = "music"
    if level is None:
        result = _run(["termux-volume"])
        data = _json_or_none(result.get("stdout", ""))
        if isinstance(data, list):
            rows = [
                f"{item.get('stream')}: {item.get('volume')}/{item.get('max_volume')}"
                for item in data
                if isinstance(item, dict)
            ]
            return reply(
                "Current phone volumes, Sir.",
                cards=[{"type": "list", "title": "PHONE VOLUME", "rows": rows}],
                data={"phone": True, "streams": data},
            )
        return reply("The volume bridge did not answer, Sir.")
    value = max(0, min(int(level), 100))
    result = _run(["termux-volume", name, str(value)])
    if not result.get("ok"):
        return reply(f"Could not set {name} volume, Sir ({truncate(result.get('stderr') or 'refused', 120)}).")
    return reply(f"{name.title()} volume set to {value}%, Sir.", data={"phone": True, "stream": name, "level": value})


def phone_clipboard(action: str = "read", text: str = "") -> dict:
    mode = str(action or "read").strip().lower()
    if mode in {"write", "set", "copy"}:
        if not has("termux-clipboard-set"):
            return _no_hand("clipboard")
        content = str(text or "").strip()
        if not content:
            return reply("What should I copy, Sir?")
        result = _run(["termux-clipboard-set", content], free_text=True)
        if not result.get("ok"):
            return reply("The clipboard refused the write, Sir.")
        return reply("Copied to the phone clipboard, Sir.", data={"phone": True, "copied": truncate(content, 120)})
    if not has("termux-clipboard-get"):
        return _no_hand("clipboard")
    result = _run(["termux-clipboard-get"])
    content = (result.get("stdout") or "").strip()
    if not result.get("ok") or not content:
        return reply("The phone clipboard is empty, Sir.", data={"phone": True, "text": ""})
    return reply(
        f"Clipboard says: “{truncate(content, 400)}”",
        cards=[{"type": "message", "title": "PHONE CLIPBOARD", "body": content}],
        data={"phone": True, "text": content},
    )


def phone_speak(text: str = "") -> dict:
    if not has("termux-tts-speak"):
        return _no_hand("speak")
    content = str(text or "").strip()
    if not content:
        return reply("What should I say out loud, Sir?")
    result = _run(["termux-tts-speak", content[:800]], free_text=True)
    if not result.get("ok"):
        return reply("The phone's speech engine refused, Sir.")
    return reply("Speaking on the phone, Sir.", data={"phone": True, "spoken": truncate(content, 120)})


def phone_photo(path: str = "") -> dict:
    if not has("termux-camera-photo"):
        return _no_hand("camera")
    PHONE_DIR.mkdir(parents=True, exist_ok=True)
    target = Path(path) if path else PHONE_DIR / f"photo-{time.strftime('%Y%m%d-%H%M%S')}.jpg"
    try:
        target = target.expanduser().resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        return reply("I could not prepare a place for that photo, Sir.")
    result = _run(["termux-camera-photo", "-c", "0", str(target)], timeout=25.0)
    if not result.get("ok") or not target.exists():
        return reply(
            "The camera did not answer, Sir. Grant camera permission to Termux:API once, then retry.",
            data={"phone": True, "error": truncate(result.get("stderr") or "", 160)},
        )
    size = target.stat().st_size
    _append_note(str(target), "photo")
    return reply(
        f"Photo saved, Sir ({size // 1024} KB).",
        speech="Photo saved, Sir.",
        cards=[{"type": "file", "name": target.name, "path": str(target)}],
        data={"phone": True, "path": str(target), "bytes": size},
    )


def phone_contacts(query: str = "", save: bool = False) -> dict:
    if not has("termux-contact-list"):
        return _no_hand("contacts")
    result = _run(["termux-contact-list"], timeout=20.0)
    entries = _json_or_none(result.get("stdout", ""))
    if not isinstance(entries, list):
        return reply("I could not read the phone contacts, Sir (permission needed once).")
    needle = str(query or "").strip().lower()
    matches = [
        item for item in entries
        if isinstance(item, dict)
        and (not needle or needle in str(item.get("name", "")).lower() or needle in str(item.get("number", "")))
    ]
    if not matches:
        return reply(f"No phone contact matches “{query}”, Sir.", data={"phone": True, "matches": 0})
    if save:
        from jarvis.store import get_store

        saved = 0
        for item in matches[:10]:
            name = str(item.get("name") or "").strip()
            number = re.sub(r"[^\d+]", "", str(item.get("number") or ""))
            if name and len(re.sub(r"\D", "", number)) >= 8:
                get_store().set_contact(name, phone=number)
                saved += 1
        return reply(
            f"Imported {saved} phone contact{'s' if saved != 1 else ''} into my address book, Sir.",
            data={"phone": True, "saved": saved, "matches": len(matches)},
        )
    rows = [f"{item.get('name', '?')} · {item.get('number', '?')}" for item in matches[:12]]
    return reply(
        f"{len(matches)} match{'es' if len(matches) != 1 else ''} in your phone, Sir.",
        cards=[{"type": "list", "title": "PHONE CONTACTS", "rows": rows}],
        data={"phone": True, "matches": len(matches), "results": matches[:12]},
    )


def phone_notifications(limit: int = 8) -> dict:
    if not has("termux-notification-list"):
        return _no_hand("notifications")
    result = _run(["termux-notification-list"])
    entries = _json_or_none(result.get("stdout", ""))
    if not isinstance(entries, list):
        return reply("The notification listener is not allowed yet, Sir — enable it in Termux:API.")
    count = max(1, min(int(limit or 8), 20))
    rows = [
        f"{str(item.get('appName') or item.get('packageName') or 'app')[:22]}: "
        f"{truncate(str(item.get('title') or item.get('content') or ''), 70)}"
        for item in entries[:count]
        if isinstance(item, dict)
    ]
    return reply(
        f"{len(entries)} notification{'s' if len(entries) != 1 else ''} on the phone, Sir.",
        cards=[{"type": "list", "title": "PHONE NOTIFICATIONS", "rows": rows or ["nothing pending"]}],
        data={"phone": True, "count": len(entries), "items": entries[:count]},
    )


def phone_location() -> dict:
    if not has("termux-location"):
        return _no_hand("location")
    result = _run(["termux-location", "-p", "network"], timeout=25.0)
    data = _json_or_none(result.get("stdout", ""))
    if not isinstance(data, dict) or "latitude" not in data:
        return reply("Location is unavailable, Sir — allow location for Termux:API once.")
    lat, lon = data.get("latitude"), data.get("longitude")
    return reply(
        f"I have the phone's position, Sir ({float(lat):.5f}, {float(lon):.5f}).",
        cards=[{"type": "list", "title": "PHONE LOCATION", "rows": [
            f"lat: {lat}", f"lon: {lon}", f"accuracy: {data.get('accuracy', '?')} m",
        ], "footer": f"https://maps.google.com/?q={lat},{lon}"}],
        data={"phone": True, "latitude": lat, "longitude": lon},
    )


def phone_open(target: str = "") -> dict:
    value = str(target or "").strip()
    if not value:
        return reply("What should I open on the phone, Sir?")
    binary = "termux-open-url" if re.match(r"^(?:https?|tel|sms|mailto|whatsapp):", value, re.I) else "termux-open"
    if not has(binary):
        return _no_hand("open", fallback={"url": value, "label": "Open on phone"})
    result = _run([binary, value])
    if not result.get("ok"):
        return reply(f"The phone refused to open that, Sir ({truncate(result.get('stderr') or '', 120)}).")
    return reply("Opened on the phone, Sir.", data={"phone": True, "target": value})


def phone_hand_summary() -> dict:
    """Small dict for /api/status and the HUD chip."""
    caps = capabilities()
    return {
        "android": ANDROID,
        "ready": ready(),
        "available": [name for name, ok in caps.items() if ok],
        "count": sum(1 for ok in caps.values() if ok),
        "total": len(caps),
    }
