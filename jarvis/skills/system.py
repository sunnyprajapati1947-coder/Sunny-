"""System control: metrics, apps, audio, power, screenshots, clipboard, locks."""
from __future__ import annotations

import os
import platform
import random
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path

from jarvis import sysinfo
from jarvis.config import DATA_DIR, get_settings
from jarvis.security import run_command
from jarvis.util import (
    daypart,
    human_duration,
    human_size,
    human_uptime,
    now,
    reply,
    spoken_date,
    spoken_time,
)

SYSTEM = platform.system().lower()

WEB_APPS = {
    "youtube": "https://www.youtube.com",
    "google": "https://www.google.com",
    "gmail": "https://mail.google.com",
    "mail": "https://mail.google.com",
    "maps": "https://maps.google.com",
    "google maps": "https://maps.google.com",
    "whatsapp": "https://web.whatsapp.com",
    "whatsapp web": "https://web.whatsapp.com",
    "github": "https://github.com",
    "chatgpt": "https://chat.openai.com",
    "instagram": "https://www.instagram.com",
    "facebook": "https://www.facebook.com",
    "twitter": "https://x.com",
    "x": "https://x.com",
    "linkedin": "https://www.linkedin.com",
    "netflix": "https://www.netflix.com",
    "amazon": "https://www.amazon.in",
    "flipkart": "https://www.flipkart.com",
    "spotify web": "https://open.spotify.com",
    "drive": "https://drive.google.com",
    "calendar": "https://calendar.google.com",
    "stack overflow": "https://stackoverflow.com",
    "wikipedia": "https://en.wikipedia.org",
    "news": "https://news.google.com",
    "weather": "https://weather.com",
}

LINUX_APPS = {
    "chrome": ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser"],
    "browser": ["xdg-open"],
    "firefox": ["firefox"],
    "code": ["code", "code-insiders", "codium"],
    "vscode": ["code", "code-insiders", "codium"],
    "vs code": ["code", "code-insiders", "codium"],
    "terminal": ["x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"],
    "files": ["nautilus", "dolphin", "thunar", "nemo"],
    "file manager": ["nautilus", "dolphin", "thunar", "nemo"],
    "calculator": ["gnome-calculator", "kcalc", "galculator"],
    "text editor": ["gedit", "kate", "mousepad", "xed"],
    "notepad": ["gedit", "kate", "mousepad", "xed"],
    "settings": ["gnome-control-center", "systemsettings5", "systemsettings"],
    "spotify": ["spotify"],
    "vlc": ["vlc"],
    "camera": ["cheese"],
    "telegram": ["telegram-desktop", "telegram"],
    "discord": ["discord"],
    "steam": ["steam"],
    "obs": ["obs"],
    "libreoffice": ["libreoffice"],
}

MAC_APPS = {
    "chrome": "Google Chrome",
    "browser": "Safari",
    "firefox": "Firefox",
    "code": "Visual Studio Code",
    "vscode": "Visual Studio Code",
    "vs code": "Visual Studio Code",
    "terminal": "Terminal",
    "files": "Finder",
    "file manager": "Finder",
    "calculator": "Calculator",
    "text editor": "TextEdit",
    "notepad": "TextEdit",
    "settings": "System Settings",
    "spotify": "Spotify",
    "vlc": "VLC",
    "camera": "Photo Booth",
    "telegram": "Telegram",
    "discord": "Discord",
    "steam": "Steam",
    "obs": "OBS",
    "libreoffice": "LibreOffice",
}

WINDOWS_APPS = {
    "chrome": ["chrome.exe"],
    "browser": ["msedge.exe"],
    "firefox": ["firefox.exe"],
    "code": ["code.cmd", "code.exe"],
    "vscode": ["code.cmd", "code.exe"],
    "vs code": ["code.cmd", "code.exe"],
    "terminal": ["wt.exe", "powershell.exe"],
    "files": ["explorer.exe"],
    "file manager": ["explorer.exe"],
    "calculator": ["calc.exe"],
    "text editor": ["notepad.exe"],
    "notepad": ["notepad.exe"],
    "settings": ["ms-settings:"],
    "spotify": ["spotify.exe"],
    "vlc": ["vlc.exe"],
    "camera": ["microsoft.windows.camera:"],
    "telegram": ["telegram.exe"],
    "discord": ["discord.exe"],
    "steam": ["steam.exe"],
}

APP_LABELS = {
    "code": "VS Code",
    "vscode": "VS Code",
    "vs code": "VS Code",
    "files": "File Manager",
    "file manager": "File Manager",
    "youtube": "YouTube",
    "google": "Google",
    "gmail": "Gmail",
    "mail": "Gmail",
    "maps": "Google Maps",
    "google maps": "Google Maps",
    "whatsapp": "WhatsApp",
    "whatsapp web": "WhatsApp Web",
    "github": "GitHub",
    "chatgpt": "ChatGPT",
    "instagram": "Instagram",
    "facebook": "Facebook",
    "twitter": "X",
    "x": "X",
    "linkedin": "LinkedIn",
    "netflix": "Netflix",
    "amazon": "Amazon",
    "flipkart": "Flipkart",
    "spotify web": "Spotify Web",
    "drive": "Google Drive",
    "calendar": "Google Calendar",
    "stack overflow": "Stack Overflow",
    "wikipedia": "Wikipedia",
    "news": "Google News",
    "weather": "Weather",
    "chrome": "Chrome",
    "browser": "Browser",
    "firefox": "Firefox",
    "terminal": "Terminal",
    "calculator": "Calculator",
    "spotify": "Spotify",
    "vlc": "VLC",
    "camera": "Camera",
    "telegram": "Telegram",
    "discord": "Discord",
    "steam": "Steam",
    "settings": "Settings",
}


def has_display() -> bool:
    if SYSTEM == "linux":
        return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    return SYSTEM in {"darwin", "windows"}


def _spawn(argv: list[str]) -> dict:
    """Launch a desktop application (argv is code-defined, never user text)."""
    try:
        subprocess.Popen(
            argv,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
        return {"ok": True}
    except (OSError, ValueError) as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def _looks_like_url(target: str) -> bool:
    value = target.strip().lower()
    return bool(
        value.startswith(("http://", "https://", "www."))
        or (("." in value) and " " not in value and not value.startswith("/"))
    )


def _normalize_url(target: str) -> str | None:
    value = target.strip()
    if not value:
        return None
    if value.lower().startswith(("http://", "https://")):
        return value
    if value.lower().startswith("www."):
        return "https://" + value
    if "." in value and " " not in value:
        return "https://" + value
    return None


# --------------------------------------------------------------- time/date
def get_time() -> dict:
    current = now()
    return reply(
        f"It is {spoken_time(current)} on {spoken_date(current)}.",
        speech=f"It is {spoken_time(current)}, Sir.",
        cards=[
            {
                "type": "clock",
                "time": current.strftime("%H:%M:%S"),
                "time12": current.strftime("%I:%M %p"),
                "day": current.strftime("%A"),
                "date": current.strftime("%d %B %Y"),
                "part": daypart(current),
            }
        ],
        data={"iso": current.isoformat()},
    )


def get_date() -> dict:
    current = now()
    return reply(
        f"Today is {spoken_date(current)}.",
        speech=f"Today is {current.strftime('%A, %d %B')}, Sir.",
        cards=[
            {
                "type": "clock",
                "time": current.strftime("%H:%M"),
                "day": current.strftime("%A"),
                "date": current.strftime("%d %B %Y"),
                "part": daypart(current),
            }
        ],
    )


# ---------------------------------------------------------------- metrics
def _metric_items(metrics: dict) -> list[dict]:
    items = [
        {"label": "CPU LOAD", "value": f"{metrics['cpu']}%", "pct": metrics["cpu"]},
        {
            "label": "MEMORY",
            "value": f"{metrics['memory']['percent']}%",
            "pct": metrics["memory"]["percent"],
            "hint": f"{human_size(metrics['memory']['used'])} / {human_size(metrics['memory']['total'])}",
        },
        {
            "label": "STORAGE",
            "value": f"{metrics['disk']['percent']}%",
            "pct": metrics["disk"]["percent"],
            "hint": f"{human_size(metrics['disk']['free'])} free",
        },
    ]
    battery = metrics.get("battery") or {}
    if battery.get("present"):
        items.append(
            {
                "label": "POWER CELL",
                "value": f"{battery['percent']}%",
                "pct": battery["percent"],
                "hint": "Charging" if battery.get("plugged") else "On battery",
            }
        )
    network = metrics.get("network") or {}
    items.append(
        {
            "label": "UPLINK",
            "value": "ONLINE" if network.get("online") else "OFFLINE",
            "hint": (
                f"{network.get('latency_ms')} ms"
                if network.get("latency_ms") is not None
                else "No route"
            ),
        }
    )
    return items


def system_status() -> dict:
    metrics = sysinfo.metrics()
    battery = metrics.get("battery") or {}
    power = ""
    if battery.get("present"):
        power = f" Battery at {battery['percent']} percent{' and charging' if battery.get('plugged') else ''}."
    network = metrics.get("network") or {}
    uptime = metrics.get("uptime")
    speech = (
        f"All systems nominal, Sir. CPU at {metrics['cpu']} percent, memory "
        f"{metrics['memory']['percent']} percent, storage {metrics['disk']['percent']} percent."
        f"{power}"
        f" Uplink is {'stable' if network.get('online') else 'offline'}."
    )
    return reply(
        speech,
        cards=[
            {
                "type": "metrics",
                "title": "SYSTEM TELEMETRY",
                "items": _metric_items(metrics),
                "footer": (
                    f"{metrics.get('host', 'host')} · "
                    f"{human_uptime(uptime) if uptime else 'n/a'} uptime · "
                    f"{metrics.get('ip', '')}"
                ),
            }
        ],
        data=metrics,
    )


def battery_status() -> dict:
    battery = sysinfo.battery()
    if not battery.get("present"):
        return reply(
            "This machine does not expose a battery, Sir — I suspect it is on mains power.",
            speech="No battery telemetry is available on this machine, Sir.",
        )
    state = "charging" if battery.get("plugged") else "on battery power"
    return reply(
        f"Power cell at {battery['percent']} percent, {state}.",
        speech=f"Power cell at {battery['percent']} percent, {state}.",
        cards=[
            {
                "type": "metrics",
                "title": "POWER CELL",
                "items": [
                    {
                        "label": "CHARGE",
                        "value": f"{battery['percent']}%",
                        "pct": battery["percent"],
                        "hint": battery.get("status", "").title(),
                    }
                ],
            }
        ],
        data=battery,
    )


def network_info() -> dict:
    metrics = sysinfo.metrics(force=True)
    network = metrics.get("network") or {}
    return reply(
        (
            f"Uplink is {metrics.get('ip')} on {metrics.get('host')}. "
            f"Internet is {'reachable' if network.get('online') else 'unreachable'}"
            + (
                f" with {network.get('latency_ms')} milliseconds of latency."
                if network.get('latency_ms') is not None
                else "."
            )
        ),
        speech=(
            f"Internet is {'reachable' if network.get('online') else 'unreachable'}, Sir."
        ),
        cards=[
            {
                "type": "metrics",
                "title": "NETWORK",
                "items": [
                    {"label": "LOCAL IP", "value": metrics.get("ip", "—")},
                    {"label": "HOST", "value": metrics.get("host", "—")},
                    {
                        "label": "LATENCY",
                        "value": (
                            f"{network.get('latency_ms')} ms"
                            if network.get("latency_ms") is not None
                            else "—"
                        ),
                    },
                    {
                        "label": "UPLINK",
                        "value": "ONLINE" if network.get("online") else "OFFLINE",
                    },
                ],
            }
        ],
        data=metrics,
    )


def internet_speed() -> dict:
    from jarvis import net

    settings = get_settings()
    try:
        size, seconds = net.download(settings.speedtest_url, timeout=15.0, limit_bytes=6_000_000)
    except net.NetError as exc:
        return reply(
            f"I could not run a speed test, Sir — {exc}.",
            speech="The speed test endpoint is unreachable, Sir.",
        )
    mbps = (size * 8) / max(0.001, seconds) / 1_000_000
    probe = sysinfo.network_probe()
    return reply(
        f"Downlink measured at {mbps:.1f} megabits per second, Sir."
        + (f" Latency {probe['latency_ms']} milliseconds." if probe.get("latency_ms") else ""),
        speech=f"Downlink is {mbps:.1f} megabits per second, Sir.",
        cards=[
            {
                "type": "metrics",
                "title": "UPLINK BENCHMARK",
                "items": [
                    {"label": "DOWNLOAD", "value": f"{mbps:.1f} Mbps", "pct": min(100, mbps)},
                    {"label": "SAMPLE", "value": human_size(size)},
                    {
                        "label": "LATENCY",
                        "value": f"{probe.get('latency_ms', '—')} ms",
                    },
                ],
            }
        ],
        data={"mbps": round(mbps, 2), "bytes": size, "seconds": round(seconds, 3)},
    )


# ------------------------------------------------------------------- apps
def open_app(app: str) -> dict:
    key = app.strip().lower()
    label = APP_LABELS.get(key, app.strip().title())

    if key in WEB_APPS:
        url = WEB_APPS[key]
        return reply(
            f"Opening {label} in your browser, Sir.",
            speech=f"Opening {label}, Sir.",
            action={"type": "open_url", "url": url, "label": label},
            cards=[{"type": "link", "title": label, "subtitle": url, "url": url}],
            data={"app": key, "mode": "web"},
        )

    if SYSTEM == "linux":
        candidates = LINUX_APPS.get(key)
        if not candidates:
            return reply(
                f"I do not have a launcher entry for “{label}”, Sir. "
                "You can open it from the terminal or teach me a web shortcut.",
            )
        if not has_display():
            return reply(
                f"This session is headless, Sir, so I cannot draw {label} on screen. "
                "Start J.A.R.V.I.S. on your desktop session and I will open it there.",
                speech=f"This session is headless, so I cannot launch {label}, Sir.",
            )
        for candidate in candidates:
            resolved = shutil.which(candidate)
            if resolved:
                result = _spawn([resolved])
                if result["ok"]:
                    return reply(
                        f"Opening {label}, Sir.",
                        speech=f"Opening {label}, Sir.",
                        action={"type": "app_launched", "app": label},
                    )
        return reply(
            f"{label} does not appear to be installed on this machine, Sir.",
            speech=f"{label} is not installed, Sir.",
        )

    if SYSTEM == "darwin":
        application = MAC_APPS.get(key)
        if not application:
            return reply(
                f"I do not have an application entry for “{label}”, Sir.",
                speech=f"I do not know {label}, Sir.",
            )
        result = run_command(["open", "-a", application], timeout=8)
        if result.get("ok"):
            return reply(
                f"Opening {label}, Sir.",
                speech=f"Opening {label}, Sir.",
                action={"type": "app_launched", "app": label},
            )
        return reply(f"I could not open {label}, Sir. {result.get('error', '')}".strip())

    if SYSTEM == "windows":
        candidates = WINDOWS_APPS.get(key)
        if not candidates:
            return reply(f"I do not have an application entry for “{label}”, Sir.")
        target = candidates[0]
        if target.endswith(":"):
            try:
                os.startfile(target)  # type: ignore[attr-defined]
                return reply(f"Opening {label}, Sir.", speech=f"Opening {label}, Sir.")
            except OSError:
                pass
        resolved = shutil.which(target)
        if resolved:
            result = _spawn([resolved])
            if result["ok"]:
                return reply(f"Opening {label}, Sir.", speech=f"Opening {label}, Sir.")
        return reply(f"{label} does not appear to be installed, Sir.")

    return reply("I cannot determine how to open applications on this platform, Sir.")


def close_app(app: str) -> dict:
    name = app.strip()
    if SYSTEM == "darwin":
        result = run_command(
            ["osascript", "-e", f'tell application "{name}" to quit'], timeout=8
        )
    elif SYSTEM == "windows":
        exe = name if name.lower().endswith(".exe") else f"{name}.exe"
        result = run_command(["taskkill", "/IM", exe, "/F"], timeout=8)
    else:
        result = run_command(["wmctrl", "-c", name], timeout=8)
    if result.get("ok"):
        return reply(f"Closing {name}, Sir.", speech=f"Closing {name}, Sir.")
    return reply(
        f"I could not close {name}, Sir. {result.get('error') or 'No matching window.'}".strip()
    )


def open_target(target: str) -> dict:
    value = str(target or "").strip().strip('"').strip("'")
    if not value:
        return reply("What should I open, Sir?")

    if value.lower() in {"file manager", "files"} or value.startswith("~") or value.startswith("/"):
        from jarvis.skills import files

        if value.lower() in {"file manager", "files"}:
            return open_app("files")
        return files.open_path(value)

    if _looks_like_url(value):
        from jarvis.skills import web

        return web.open_url(value)

    if value.lower() in WEB_APPS or value.lower() in LINUX_APPS or value.lower() in MAC_APPS:
        return open_app(value)

    from jarvis.skills import files

    try:
        resolved = files.resolve_for_user(value)
        if resolved.exists():
            return files.open_path(str(resolved))
    except Exception:
        pass

    url = "https://www.google.com/search?q=" + value.replace(" ", "+")
    return reply(
        f"I do not have an app called “{value}”, Sir. I can search the web for it instead.",
        speech=f"I do not have {value} installed, Sir. I can search the web instead.",
        cards=[
            {"type": "link", "title": f"Search: {value}", "subtitle": "google.com", "url": url}
        ],
    )


# ------------------------------------------------------------------ audio
def set_volume(level: int | None = None, action: str = "set") -> dict:
    action = str(action or "set").lower()
    level = max(0, min(100, int(level))) if level is not None else None
    attempts: list[list[str]] = []

    if SYSTEM == "darwin":
        if action == "mute":
            attempts.append(["osascript", "-e", "set volume output muted true"])
        elif action == "unmute":
            attempts.append(["osascript", "-e", "set volume output muted false"])
        elif action in {"up", "down"}:
            step = 10 if action == "up" else -10
            attempts.append(
                [
                    "osascript",
                    "-e",
                    f"set v to output volume of (get volume settings)\nset volume output volume (v + {step})",
                ]
            )
        else:
            attempts.append(["osascript", "-e", f"set volume output volume {level if level is not None else 50}"])
    elif SYSTEM == "windows":
        return reply(
            "Windows volume control needs a helper utility, Sir. Use the media keys for now.",
            speech="I cannot control Windows volume without a helper utility, Sir.",
        )
    else:
        if action == "mute":
            attempts.extend(
                [
                    ["pactl", "set-sink-mute", "@DEFAULT_SINK@", "1"],
                    ["amixer", "-q", "sset", "Master", "mute"],
                    ["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "1"],
                ]
            )
        elif action == "unmute":
            attempts.extend(
                [
                    ["pactl", "set-sink-mute", "@DEFAULT_SINK@", "0"],
                    ["amixer", "-q", "sset", "Master", "unmute"],
                    ["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "0"],
                ]
            )
        elif action in {"up", "down"}:
            step = 10 if action == "up" else -10
            attempts.extend(
                [
                    ["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{step:+d}%"],
                    ["amixer", "-q", "sset", "Master", f"{max(0, min(100, 50 + step))}%"],
                    ["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", f"{step}%{'+' if step > 0 else '-'}"],
                ]
            )
        else:
            target = level if level is not None else 50
            attempts.extend(
                [
                    ["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{target}%"],
                    ["amixer", "-q", "sset", "Master", f"{target}%"],
                    ["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", f"{target / 100:.2f}"],
                ]
            )

    for argv in attempts:
        if not shutil.which(argv[0]):
            continue
        result = run_command(argv, timeout=6)
        if result.get("ok") or not result.get("missing"):
            if result.get("ok"):
                description = {
                    "mute": "Muting audio, Sir.",
                    "unmute": "Audio restored, Sir.",
                    "up": "Volume up, Sir.",
                    "down": "Volume down, Sir.",
                }.get(action, f"Volume set to {level} percent, Sir.")
                return reply(description, speech=description, data={"action": action, "level": level})

    return reply(
        "No audio mixer responded, Sir. This machine may be headless.",
        speech="I could not reach an audio mixer, Sir.",
    )


def set_brightness(level: int) -> dict:
    level = max(5, min(100, int(level)))
    if SYSTEM == "linux":
        if shutil.which("brightnessctl"):
            result = run_command(["brightnessctl", "set", f"{level}%"], timeout=6)
            if result.get("ok"):
                return reply(f"Brightness set to {level} percent, Sir.", speech=f"Brightness {level} percent, Sir.")
        if shutil.which("xrandr"):
            query = run_command(["xrandr"], timeout=6)
            output = ""
            for line in str(query.get("stdout", "")).splitlines():
                if " connected" in line:
                    output = line.split()[0]
                    break
            if output:
                factor = max(0.1, level / 100.0)
                result = run_command(
                    ["xrandr", "--output", output, "--brightness", f"{factor:.2f}"], timeout=6
                )
                if result.get("ok"):
                    return reply(
                        f"Brightness set to {level} percent, Sir.",
                        speech=f"Brightness set to {level} percent, Sir.",
                    )
    return reply(
        "I cannot reach a brightness controller on this machine, Sir.",
        speech="No brightness controller is available, Sir.",
    )


# ---------------------------------------------------------------- display
def screenshot() -> dict:
    shots = DATA_DIR / "screenshots"
    shots.mkdir(parents=True, exist_ok=True)
    name = f"screen-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
    target = shots / name

    attempts: list[list[str]] = []
    if SYSTEM == "darwin":
        attempts.append(["screencapture", "-x", str(target)])
    elif SYSTEM == "windows":
        attempts = []
    else:
        attempts.extend(
            [
                ["gnome-screenshot", "-f", str(target)],
                ["scrot", "-z", str(target)],
                ["import", "-window", "root", str(target)],
            ]
        )

    for argv in attempts:
        if not shutil.which(argv[0]):
            continue
        result = run_command(argv, timeout=15)
        if result.get("ok") and target.exists() and target.stat().st_size > 0:
            return reply(
                "Screen captured, Sir.",
                speech="Screen captured, Sir.",
                cards=[
                    {
                        "type": "image",
                        "src": f"/api/file?path=screenshots/{name}",
                        "alt": "Screen capture",
                        "title": "SCREEN CAPTURE",
                    }
                ],
                data={"path": str(target)},
            )

    if not has_display():
        return reply(
            "There is no display attached to this session, Sir — screenshot capture needs a desktop.",
            speech="There is no display attached, Sir, so I cannot capture the screen.",
        )
    return reply(
        "No screenshot utility responded, Sir. Install scrot or gnome-screenshot.",
        speech="I could not capture the screen, Sir.",
    )


def window_action(action: str) -> dict:
    action = str(action or "minimize_all").lower()
    if SYSTEM == "darwin":
        script = {
            "minimize_all": 'tell application "Finder" to activate\ntell application "System Events" to keystroke "f3" using {control down}',
            "show_desktop": 'tell application "System Events" to key code 103',
            "switch": 'tell application "System Events" to key code 48 using {command down}',
        }.get(action, 'tell application "System Events" to key code 48 using {command down}')
        result = run_command(["osascript", "-e", script], timeout=6)
    elif SYSTEM == "windows":
        return reply("Window tiling on Windows needs additional automation, Sir.")
    else:
        if action in {"minimize_all", "show_desktop"}:
            result = run_command(["wmctrl", "-k", "on"], timeout=6)
            if not result.get("ok") and shutil.which("xdotool"):
                result = run_command(["xdotool", "key", "super+d"], timeout=6)
        else:
            result = run_command(["xdotool", "key", "alt+Tab"], timeout=6)
    if result.get("ok"):
        return reply("As you wish, Sir.", speech="As you wish, Sir.")
    return reply("I could not reach a window manager, Sir.", speech="No window manager responded, Sir.")


def lock_screen() -> dict:
    attempts: list[list[str]] = []
    if SYSTEM == "darwin":
        attempts.append(["pmset", "displaysleepnow"])
    elif SYSTEM == "windows":
        attempts.append(["rundll32", "user32.dll,LockWorkStation"])
    else:
        attempts.extend(
            [
                ["loginctl", "lock-session"],
                ["gnome-screensaver-command", "-l"],
                ["xdg-screensaver", "lock"],
            ]
        )
    for argv in attempts:
        if not shutil.which(argv[0]):
            continue
        result = run_command(argv, timeout=6)
        if result.get("ok"):
            return reply("Locking the workstation, Sir.", speech="Locking the workstation, Sir.")
    return reply(
        "No screen locker responded, Sir. This session may be headless.",
        speech="I cannot lock this session, Sir.",
    )


def power(action: str) -> dict:
    action = str(action or "shutdown").lower()
    if action not in {"shutdown", "reboot", "sleep"}:
        return reply("I only support shutdown, reboot or sleep, Sir.")
    command = action
    if SYSTEM == "darwin":
        script = {
            "shutdown": 'tell application "System Events" to shut down',
            "reboot": 'tell application "System Events" to restart',
            "sleep": 'tell application "System Events" to sleep',
        }[action]
        result = run_command(["osascript", "-e", script], timeout=6)
    elif SYSTEM == "windows":
        args = {"shutdown": "/s", "reboot": "/r", "sleep": "/h"}[action]
        result = run_command(["shutdown", args, "/t", "0"], timeout=6)
    else:
        if action == "sleep":
            result = run_command(["systemctl", "suspend"], timeout=6)
            if not result.get("ok"):
                result = run_command(["loginctl", "suspend"], timeout=6)
        else:
            result = run_command(["systemctl", "poweroff" if action == "shutdown" else "reboot"], timeout=6)
    if result.get("ok"):
        return reply(f"{action.title()} initiated, Sir. Going dark.", speech=f"{action.title()} initiated, Sir.")
    return reply(
        f"The system refused the {command} command, Sir. {result.get('error', '')}".strip(),
        speech=f"I could not {command} the system, Sir.",
    )


# -------------------------------------------------------------- clipboard
def clipboard(action: str = "read", text: str = "") -> dict:
    action = str(action or "read").lower()
    if action in {"copy", "write", "set"}:
        if not text:
            return reply("What should I copy, Sir?")
        attempts = [
            ["xclip", "-selection", "clipboard"],
            ["xsel", "--clipboard", "--input"],
            ["pbcopy"],
            ["clip"],
        ]
        for argv in attempts:
            if not shutil.which(argv[0]):
                continue
            result = run_command(argv, input_text=text, timeout=6)
            if result.get("ok"):
                return reply("Copied to the clipboard, Sir.", speech="Copied, Sir.")
        return reply("I cannot reach a clipboard on this machine, Sir.")
    attempts = [
        ["xclip", "-selection", "clipboard", "-o"],
        ["xsel", "--clipboard", "--output"],
        ["pbpaste"],
    ]
    for argv in attempts:
        if not shutil.which(argv[0]):
            continue
        result = run_command(argv, timeout=6)
        if result.get("ok"):
            content = result.get("stdout", "")
            return reply(
                f"The clipboard contains: {content[:800]}" if content else "The clipboard is empty, Sir.",
                speech="I have read the clipboard, Sir.",
                cards=[{"type": "text", "title": "CLIPBOARD", "body": content[:2000] or "Empty"}],
            )
    return reply("I cannot read the clipboard on this machine, Sir.")


# ---------------------------------------------------------------- reports
def status_report() -> dict:
    from jarvis.config import get_settings
    from jarvis.store import get_store

    metrics = sysinfo.metrics()
    settings = get_settings()
    store = get_store()
    battery = metrics.get("battery") or {}
    network = metrics.get("network") or {}
    open_tasks = [item for item in store.todos() if not item.get("done")]
    reminders = store.reminders()
    next_reminder = reminders[0] if reminders else None
    brain = (
        "Gemini uplink available"
        if settings.gemini_key and settings.llm_enabled
        else ("local model lane configured" if settings.llm_enabled else "offline personality core")
    )

    parts = [
        f"CPU {metrics['cpu']} percent",
        f"memory {metrics['memory']['percent']} percent",
        f"storage {metrics['disk']['percent']} percent",
    ]
    if battery.get("present"):
        parts.append(f"power cell {battery['percent']} percent")
    parts.append(f"uplink {'stable' if network.get('online') else 'down'}")
    speech = (
        f"Systems report, Sir. {', '.join(parts)}. "
        f"You have {len(open_tasks)} open task{'s' if len(open_tasks) != 1 else ''}."
    )
    if next_reminder:
        due = next_reminder.get("due", "")
        speech += f" Next reminder at {due[11:16] if len(due) > 16 else due}."
    speech += f" Neural core: {brain}."

    return reply(
        speech,
        cards=[
            {
                "type": "metrics",
                "title": "DIAGNOSTIC",
                "items": _metric_items(metrics),
                "footer": f"{metrics.get('host', '')} · {brain}",
            },
            {
                "type": "list",
                "title": f"OPEN TASKS ({len(open_tasks)})",
                "items": [item.get("text", "") for item in open_tasks[:5]] or ["Nothing pending, Sir."],
            },
        ],
        data={"metrics": metrics, "tasks": len(open_tasks), "brain": brain},
    )
