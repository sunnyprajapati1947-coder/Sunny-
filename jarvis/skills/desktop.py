"""Real desktop control: typing, hotkeys, mouse, windows and screen reading.

Cross-platform and dependency-light:

* **Linux (X11)** — `xdotool`, `wmctrl`, `tesseract`
* **Windows** — PowerShell + user32 (SendKeys, SetCursorPos, mouse_event)
* **macOS** — AppleScript, `pbcopy`, `screencapture`, optional `cliclick`

Every action needs the desktop layer to be *armed* first (`desktop arm on`),
so reading a chat message can never move your mouse by accident. User text is
passed as argv into a fixed binary (never a shell) or into a single-quoted
PowerShell literal with quotes doubled.
"""
from __future__ import annotations

import base64
import os
import platform
import re
import shutil
import subprocess
import time
from pathlib import Path

from jarvis.config import DATA_DIR
from jarvis.security import run_command
from jarvis.store import get_store
from jarvis.util import reply, truncate

SYSTEM = platform.system().lower()
COMBO_RE = re.compile(r"^[A-Za-z0-9+\-_., ]{1,60}$")
BUTTONS = {"left": 1, "middle": 2, "right": 3}
INPUT_BINARIES = {"xdotool", "wmctrl", "osascript", "cliclick", "screencapture"}
TESSERACT_HINT = {
    "linux": "sudo apt install tesseract-ocr",
    "darwin": "brew install tesseract",
    "windows": "winget install UB-Mannheim.TesseractOCR",
}


# ------------------------------------------------------------------ helpers
def armed() -> bool:
    try:
        return bool(get_store().get_pref("desktop_armed", False))
    except Exception:
        return False


def _set_armed(value: bool) -> None:
    get_store().set_pref("desktop_armed", bool(value))
    get_store().set_pref("desktop_armed_at", time.strftime("%Y-%m-%dT%H:%M:%S") if value else None)


def _gate() -> dict | None:
    if not armed():
        return reply(
            "Desktop control is not armed, Sir. Say “arm desktop control” first, "
            "and “desktop panic” to disarm instantly.",
            speech="Desktop control is disarmed, Sir.",
            cards=[{"type": "list", "title": "DESKTOP CONTROL", "rows": [
                "status: disarmed",
                "arm: say “arm desktop control”",
                "disarm: say “desktop panic”",
            ]}],
            data={"armed": False},
        )
    return None


def _display_ok() -> bool:
    if SYSTEM == "linux":
        return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    return SYSTEM in {"darwin", "windows"}


def _input(argv: list[str], timeout: float = 10.0) -> dict:
    """Run a fixed input binary with argv — user text never touches a shell."""
    if not argv:
        return {"ok": False, "error": "empty command"}
    binary = Path(str(argv[0])).name
    if binary not in INPUT_BINARIES:
        return {"ok": False, "error": f"binary not permitted: {binary}"}
    resolved = shutil.which(str(argv[0]))
    if not resolved:
        return {"ok": False, "error": f"{binary} is not installed", "missing": binary}
    try:
        process = subprocess.run(
            [resolved, *[str(part) for part in argv[1:]]],
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return {
        "ok": process.returncode == 0,
        "stdout": (process.stdout or "").strip()[:4000],
        "stderr": (process.stderr or "").strip()[:800],
    }


def _ps(script: str, timeout: float = 12.0) -> dict:
    """Run a code-defined PowerShell script (no shell, no user code)."""
    binary = shutil.which("powershell") or shutil.which("pwsh")
    if not binary:
        return {"ok": False, "error": "PowerShell is not available"}
    try:
        process = subprocess.run(
            [binary, "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return {
        "ok": process.returncode == 0,
        "stdout": (process.stdout or "").strip()[:4000],
        "stderr": (process.stderr or "").strip()[:800],
    }


def _ps_quote(text: str) -> str:
    return "'" + str(text).replace("'", "''") + "'"


def _apple_quote(text: str) -> str:
    return '"' + str(text).replace("\\", "\\\\").replace('"', '\\"') + '"'


def _normalize_combo(keys: str) -> str:
    raw = str(keys or "").strip().lower()
    raw = raw.replace("control", "ctrl").replace("command", "cmd").replace("option", "alt")
    raw = raw.replace("windows", "win").replace("super", "win")
    parts = [part.strip() for part in re.split(r"\s*\+\s*|\s+", raw) if part.strip()]
    return "+".join(parts)


def _combo_parts(combo: str) -> tuple[list[str], str]:
    parts = [part for part in combo.split("+") if part]
    if not parts:
        return [], ""
    return parts[:-1], parts[-1]


WINDOWS_SENDKEYS = {
    "enter": "{ENTER}", "return": "{ENTER}", "tab": "{TAB}", "esc": "{ESC}",
    "escape": "{ESC}", "space": " ", "backspace": "{BACKSPACE}", "delete": "{DELETE}",
    "del": "{DELETE}", "up": "{UP}", "down": "{DOWN}", "left": "{LEFT}", "right": "{RIGHT}",
    "home": "{HOME}", "end": "{END}", "pageup": "{PGUP}", "pagedown": "{PGDN}",
    "f1": "{F1}", "f2": "{F2}", "f3": "{F3}", "f4": "{F4}", "f5": "{F5}", "f6": "{F6}",
    "f7": "{F7}", "f8": "{F8}", "f9": "{F9}", "f10": "{F10}", "f11": "{F11}", "f12": "{F12}",
}
WINDOWS_MODS = {"ctrl": "^", "alt": "%", "shift": "+"}


def _sendkeys(combo: str) -> str | None:
    mods, key = _combo_parts(combo)
    if any(mod not in WINDOWS_MODS for mod in mods):
        return None
    if key not in WINDOWS_SENDKEYS and len(key) != 1:
        return None
    prefix = "".join(WINDOWS_MODS[mod] for mod in mods)
    return prefix + WINDOWS_SENDKEYS.get(key, key)


def _apple_mods(mods: list[str]) -> str:
    mapping = {"ctrl": "control down", "alt": "option down", "shift": "shift down", "cmd": "command down"}
    chosen = [mapping[mod] for mod in mods if mod in mapping]
    return "{" + ", ".join(chosen) + "}" if chosen else ""


def _copy_stdin(binary: str, text: str, extra: list[str] | None = None) -> dict:
    resolved = shutil.which(binary)
    if not resolved:
        return {"ok": False, "error": f"{binary} is not installed"}
    try:
        process = subprocess.run(
            [resolved, *(extra or [])],
            input=text,
            text=True,
            capture_output=True,
            timeout=8,
            shell=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return {"ok": process.returncode == 0, "stderr": (process.stderr or "")[:300]}


def _clipboard_set(text: str) -> dict:
    if SYSTEM == "darwin":
        return _copy_stdin("pbcopy", text)
    if SYSTEM == "windows":
        return _ps(f"Set-Clipboard -Value {_ps_quote(text)}")
    if shutil.which("xclip"):
        return _copy_stdin("xclip", text, ["-selection", "clipboard"])
    if shutil.which("xsel"):
        return _copy_stdin("xsel", text, ["--clipboard", "--input"])
    return {"ok": False, "error": "no clipboard utility"}


# -------------------------------------------------------------------- status
def desktop_status() -> dict:
    candidates = ["xdotool", "wmctrl", "tesseract", "cliclick", "powershell", "pwsh", "scrot", "gnome-screenshot"]
    found = {name: bool(shutil.which(name)) for name in candidates}
    available = _display_ok()
    rows = [
        f"platform: {SYSTEM}",
        f"display: {'available' if available else 'headless'}",
        f"armed: {'yes' if armed() else 'no'}",
        "found: " + (", ".join(name for name, ok in found.items() if ok) or "none"),
        f"ocr: {'tesseract found' if found['tesseract'] else 'not installed — ' + TESSERACT_HINT.get(SYSTEM, 'install tesseract')}",
    ]
    return reply(
        "Desktop control is ready, Sir." if available else "This session has no desktop surface, Sir.",
        speech="Desktop control is ready, Sir." if available else "There is no display attached, Sir.",
        cards=[{"type": "list", "title": "DESKTOP CONTROL", "rows": rows}],
        data={
            "platform": SYSTEM,
            "display": available,
            "armed": armed(),
            "tools": found,
            "ocr": found["tesseract"],
        },
    )


def desktop_arm(action: str = "status") -> dict:
    value = str(action or "status").lower()
    if value in {"on", "arm", "enable", "true", "yes"}:
        _set_armed(True)
        return reply(
            "Desktop control armed, Sir. I can type, press keys and click — say “desktop panic” to stop.",
            speech="Desktop control armed, Sir.",
            cards=[{"type": "list", "title": "DESKTOP ARMED", "rows": [
                "type / press keys / click / read the screen",
                "disarm instantly: desktop panic",
            ]}],
            data={"armed": True},
        )
    if value in {"off", "disarm", "panic", "stop", "disable", "false", "no"}:
        _set_armed(False)
        return reply(
            "Desktop control disarmed, Sir. Input is locked.",
            speech="Desktop control disarmed, Sir.",
            data={"armed": False},
        )
    return reply(
        f"Desktop control is {'armed' if armed() else 'disarmed'}, Sir.",
        data={"armed": armed()},
    )


# ------------------------------------------------------------------- typing
def _press_enter() -> dict:
    if SYSTEM == "windows":
        return _ps(
            "Add-Type -AssemblyName System.Windows.Forms; "
            "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"
        )
    if SYSTEM == "darwin":
        return _input(["osascript", "-e", 'tell application "System Events" to key code 36'])
    return _input(["xdotool", "key", "--clearmodifiers", "Return"], timeout=6)


def desktop_type(text: str = "", enter: bool = False) -> dict:
    blocked = _gate()
    if blocked:
        return blocked
    body = str(text or "")
    if not body.strip():
        return reply("What should I type, Sir?")
    if len(body) > 2000:
        return reply("That is a lot of text, Sir. Keep a single paste under 2000 characters.")
    if not _display_ok():
        return reply("There is no desktop surface attached, Sir.")

    multiline = "\n" in body
    if SYSTEM == "windows":
        clipboard = _clipboard_set(body)
        if not clipboard.get("ok"):
            return reply(f"I could not reach the Windows clipboard, Sir — {clipboard.get('error')}.")
        result = _ps(
            "Add-Type -AssemblyName System.Windows.Forms; "
            "[System.Windows.Forms.SendKeys]::SendWait('^v')"
        )
    elif SYSTEM == "darwin":
        clipboard = _clipboard_set(body)
        if clipboard.get("ok"):
            result = _input(["osascript", "-e", 'tell application "System Events" to keystroke "v" using command down'])
        else:
            result = _input(["osascript", "-e", f'tell application "System Events" to keystroke {_apple_quote(body)}'])
    else:
        if not shutil.which("xdotool"):
            return reply(
                "I need xdotool for typing on Linux, Sir. Install it with `sudo apt install xdotool`.",
                data={"missing": "xdotool"},
            )
        if multiline or len(body) > 120:
            clipboard = _clipboard_set(body)
            if clipboard.get("ok"):
                result = _input(["xdotool", "key", "--clearmodifiers", "ctrl+v"], timeout=8)
            else:
                lines = body.splitlines() or [body]
                result = {"ok": True}
                for line in lines[:40]:
                    result = _input(
                        ["xdotool", "type", "--clearmodifiers", "--delay", "8", "--", line],
                        timeout=15,
                    )
                    if not result.get("ok"):
                        break
                    _input(["xdotool", "key", "--clearmodifiers", "Return"], timeout=5)
        else:
            result = _input(
                ["xdotool", "type", "--clearmodifiers", "--delay", "8", "--", body],
                timeout=15,
            )

    if not result.get("ok"):
        error = result.get("error") or result.get("stderr") or "input backend failed"
        return reply(f"I could not type that, Sir — {error}.")

    if enter:
        _press_enter()
    return reply(
        f"Typed {len(body)} characters into the active window, Sir."
        + (" Pressed Enter." if enter else "."),
        speech="Typed, Sir.",
        cards=[{"type": "text", "title": "TYPED", "body": truncate(body, 400)}],
        data={"chars": len(body), "enter": bool(enter)},
    )


def desktop_keys(keys: str = "") -> dict:
    blocked = _gate()
    if blocked:
        return blocked
    raw = str(keys or "").strip()
    if not raw:
        return reply("Which keys should I press, Sir? For example “ctrl+s” or “alt+tab”.")
    if not COMBO_RE.match(raw):
        return reply("That key combination has characters I do not accept, Sir.")
    combo = _normalize_combo(raw)
    mods, key = _combo_parts(combo)
    if key in {"delete", "del"} and {"ctrl", "alt"} & set(mods):
        return reply("I will not send destructive key combinations, Sir.")
    if not _display_ok():
        return reply("There is no desktop surface attached, Sir.")

    if SYSTEM == "windows":
        sequence = _sendkeys(combo)
        if sequence is None:
            return reply(f"I do not have a Windows key mapping for “{keys}”, Sir.")
        result = _ps(
            "Add-Type -AssemblyName System.Windows.Forms; "
            f"[System.Windows.Forms.SendKeys]::SendWait({_ps_quote(sequence)})"
        )
    elif SYSTEM == "darwin":
        apple_mods = _apple_mods(mods)
        if len(key) == 1:
            script = f'tell application "System Events" to keystroke {_apple_quote(key)}'
        else:
            codes = {"enter": 36, "return": 36, "tab": 48, "esc": 53, "space": 49, "left": 123,
                     "right": 124, "down": 125, "up": 126, "delete": 51, "backspace": 51}
            if key not in codes:
                return reply(f"I do not have a macOS key mapping for “{keys}”, Sir.")
            script = f'tell application "System Events" to key code {codes[key]}'
        if apple_mods:
            script += f" using {apple_mods}"
        result = _input(["osascript", "-e", script])
    else:
        if not shutil.which("xdotool"):
            return reply("I need xdotool for key presses on Linux, Sir.")
        result = _input(["xdotool", "key", "--clearmodifiers", combo], timeout=8)

    if not result.get("ok"):
        return reply(
            f"I could not press “{keys}”, Sir — {result.get('error') or result.get('stderr') or 'no window focused'}."
        )
    return reply(
        f"Pressed {combo.replace('+', ' + ')}, Sir.",
        speech="Done, Sir.",
        data={"keys": combo},
    )


# -------------------------------------------------------------------- mouse
def desktop_move(x: int = 0, y: int = 0) -> dict:
    blocked = _gate()
    if blocked:
        return blocked
    x, y = int(x), int(y)
    if x < 0 or y < 0:
        return reply("Screen coordinates cannot be negative, Sir.")
    if not _display_ok():
        return reply("There is no desktop surface attached, Sir.")
    if SYSTEM == "windows":
        script = (
            "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;"
            "public class JarvisMouse{[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int x,int y);"
            "public static void Move(int x,int y){SetCursorPos(x,y);}}'; "
            f"[JarvisMouse]::Move({x},{y})"
        )
        result = _ps(script)
    elif SYSTEM == "darwin":
        if not shutil.which("cliclick"):
            return reply("Mouse control on macOS needs `brew install cliclick`, Sir.")
        result = _input(["cliclick", f"m:{x},{y}"], timeout=6)
    else:
        if not shutil.which("xdotool"):
            return reply("I need xdotool for mouse control on Linux, Sir.")
        result = _input(["xdotool", "mousemove", "--sync", str(x), str(y)], timeout=6)
    if not result.get("ok"):
        return reply(f"I could not move the pointer, Sir — {result.get('error') or 'backend failed'}.")
    return reply(f"Pointer moved to {x}, {y}, Sir.", speech="Pointer moved, Sir.", data={"x": x, "y": y})


def desktop_click(x: int = -1, y: int = -1, button: str = "left", clicks: int = 1) -> dict:
    blocked = _gate()
    if blocked:
        return blocked
    button = str(button or "left").lower()
    if button not in BUTTONS:
        return reply("I only know left, middle and right clicks, Sir.")
    clicks = max(1, min(3, int(clicks or 1)))
    if not _display_ok():
        return reply("There is no desktop surface attached, Sir.")

    if x >= 0 and y >= 0:
        moved = desktop_move(int(x), int(y))
        if not moved["text"].startswith("Pointer moved"):
            return moved

    if SYSTEM == "windows":
        down, up = {"left": ("0x02", "0x04"), "right": ("0x08", "0x10"), "middle": ("0x20", "0x40")}[button]
        script = (
            "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;"
            "public class JarvisClick{[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint dx,uint dy,uint d,int e);"
            "public static void Click(uint down,uint up,int times){for(int i=0;i<times;i++){mouse_event(down,0,0,0,0);mouse_event(up,0,0,0,0);}}}'; "
            f"[JarvisClick]::Click({down},{up},{clicks})"
        )
        result = _ps(script)
    elif SYSTEM == "darwin":
        if not shutil.which("cliclick"):
            return reply("Mouse control on macOS needs `brew install cliclick`, Sir.")
        result = _input(["cliclick", f"c:{clicks}"], timeout=6)
    else:
        if not shutil.which("xdotool"):
            return reply("I need xdotool for mouse control on Linux, Sir.")
        result = _input(["xdotool", "click", "--repeat", str(clicks), str(BUTTONS[button])], timeout=8)

    if not result.get("ok"):
        return reply(f"I could not click, Sir — {result.get('error') or 'backend failed'}.")
    where = f" at {x}, {y}" if x >= 0 and y >= 0 else ""
    return reply(
        f"{button.title()} click{where}, Sir.",
        speech="Clicked, Sir.",
        data={"x": x, "y": y, "button": button, "clicks": clicks},
    )


# ------------------------------------------------------------------ windows
def desktop_windows() -> dict:
    titles: list[str] = []
    if SYSTEM == "linux":
        if shutil.which("wmctrl"):
            result = _input(["wmctrl", "-l"], timeout=6)
            for line in (result.get("stdout") or "").splitlines():
                parts = line.split(None, 3)
                if len(parts) == 4 and parts[3].strip():
                    titles.append(parts[3].strip())
        elif shutil.which("xdotool"):
            result = _input(["xdotool", "search", "--onlyvisible", "--name", "."], timeout=6)
            ids = [line.strip() for line in (result.get("stdout") or "").splitlines() if line.strip()]
            for window_id in ids[:20]:
                name = _input(["xdotool", "getwindowname", window_id], timeout=3)
                if name.get("ok") and name.get("stdout"):
                    titles.append(name["stdout"])
    elif SYSTEM == "windows":
        result = _ps("Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.MainWindowTitle }")
        titles = [line.strip() for line in (result.get("stdout") or "").splitlines() if line.strip()]
    elif SYSTEM == "darwin":
        result = _input(
            ["osascript", "-e",
             'tell application "System Events" to get name of every process whose background only is false'],
            timeout=8,
        )
        titles = [part.strip() for part in (result.get("stdout") or "").split(",") if part.strip()]

    unique: list[str] = []
    for title in titles:
        if title and title not in unique:
            unique.append(title)
    if not unique:
        return reply(
            "I could not see any windows, Sir. This session may be headless, or no window manager is running.",
            data={"windows": []},
        )
    return reply(
        f"{len(unique)} window{'s' if len(unique) != 1 else ''} open, Sir.",
        speech="I can see the open windows, Sir.",
        cards=[{"type": "list", "title": "OPEN WINDOWS", "rows": [truncate(title, 90) for title in unique[:10]]}],
        data={"windows": unique[:20]},
    )


def desktop_focus(title: str = "") -> dict:
    blocked = _gate()
    if blocked:
        return blocked
    target = str(title or "").strip()
    if not target:
        return reply("Which window should I focus, Sir?")
    if not _display_ok():
        return reply("There is no desktop surface attached, Sir.")

    if SYSTEM == "linux":
        if shutil.which("wmctrl"):
            result = _input(["wmctrl", "-a", target], timeout=6)
        elif shutil.which("xdotool"):
            search = _input(["xdotool", "search", "--onlyvisible", "--name", target], timeout=6)
            ids = [line.strip() for line in (search.get("stdout") or "").splitlines() if line.strip()]
            result = (
                _input(["xdotool", "windowactivate", "--sync", ids[0]], timeout=6)
                if ids else {"ok": False, "error": "no match"}
            )
        else:
            return reply("I need wmctrl or xdotool to focus windows on Linux, Sir.")
    elif SYSTEM == "windows":
        result = _ps(
            "$w = New-Object -ComObject WScript.Shell; "
            f"if (-not $w.AppActivate({_ps_quote(target)})) {{ exit 1 }}"
        )
    else:
        result = _input(
            ["osascript", "-e", f'tell application {_apple_quote(target)} to activate'],
            timeout=6,
        )
    if not result.get("ok"):
        return reply(f"I could not focus “{target}”, Sir. Say “list windows” to see exact titles.")
    return reply(f"Focused {target}, Sir.", speech=f"Focused {target}, Sir.", data={"window": target})


# ------------------------------------------------------------- screen reading
def _screenshot_path() -> Path:
    shots = DATA_DIR / "screenshots"
    shots.mkdir(parents=True, exist_ok=True)
    return shots / f"screen-{time.strftime('%Y%m%d-%H%M%S')}.png"


def _capture(path: Path) -> dict:
    if SYSTEM == "darwin":
        return _input(["screencapture", "-x", str(path)], timeout=15)
    if SYSTEM == "windows":
        script = (
            "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
            "$b=[System.Windows.Forms.SystemInformation]::VirtualScreen; "
            "$bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); "
            "$g=[System.Drawing.Graphics]::FromImage($bmp); "
            "$g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); "
            f"$bmp.Save({_ps_quote(str(path))});"
        )
        return _ps(script, timeout=20)
    for argv in (
        ["gnome-screenshot", "-f", str(path)],
        ["scrot", "-z", str(path)],
        ["import", "-window", "root", str(path)],
    ):
        if not shutil.which(argv[0]):
            continue
        result = run_command(argv, timeout=15)
        if result.get("ok") and path.exists() and path.stat().st_size > 0:
            return result
    return {"ok": False, "error": "no screenshot utility"}


def desktop_read_screen(question: str = "") -> dict:
    # Reading the screen is passive, so it does not need the input layer armed.
    if not _display_ok():
        return reply("There is no desktop surface attached, Sir.", speech="No display, Sir.")
    path = _screenshot_path()
    capture = _capture(path)
    if not (capture.get("ok") and path.exists() and path.stat().st_size > 0):
        return reply(
            "I could not capture the screen, Sir. On Linux install scrot or gnome-screenshot.",
            data={"error": capture.get("error")},
        )

    ocr_text = ""
    if shutil.which("tesseract"):
        result = run_command(["tesseract", str(path), "stdout", "--psm", "6"], timeout=25)
        if result.get("ok"):
            ocr_text = (result.get("stdout") or "").strip()

    if not ocr_text:
        try:
            from jarvis.brain import get_brain

            vision = get_brain().vision_file(
                path, question or "Describe what is on this screen concisely."
            )
            if vision.get("ok"):
                return reply(
                    vision.get("text", ""),
                    cards=[
                        {"type": "text", "title": "SCREEN VISION",
                         "body": truncate(vision.get("text", ""), 1200)},
                        {"type": "image", "src": f"/api/file?path=screenshots/{path.name}",
                         "alt": "Screen capture"},
                    ],
                    data={"path": str(path), "provider": vision.get("provider"), "ocr": False},
                )
        except Exception:
            pass

    if not ocr_text:
        return reply(
            "I captured the screen but could not read text from it, Sir. "
            f"Install OCR: {TESSERACT_HINT.get(SYSTEM, 'tesseract')}.",
            cards=[{"type": "image", "src": f"/api/file?path=screenshots/{path.name}", "alt": "Screen capture"}],
            data={"path": str(path), "ocr": False},
        )

    snippet = truncate(ocr_text, 1800)
    return reply(
        f"Screen read, Sir. {len(ocr_text.split())} words recognised.",
        speech="I have read the screen, Sir.",
        cards=[
            {"type": "text", "title": "SCREEN TEXT", "body": snippet},
            {"type": "image", "src": f"/api/file?path=screenshots/{path.name}", "alt": "Screen capture"},
        ],
        data={"path": str(path), "ocr": True, "chars": len(ocr_text), "text": ocr_text[:4000]},
    )


def screen_png_base64(path: str | Path) -> str:
    raw = Path(path).read_bytes()
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
