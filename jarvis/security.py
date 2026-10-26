"""Safety envelope for J.A.R.V.I.S.

Rules
-----
* No shell. Every external process is an explicit argv list whose binary must
  be on an allow-list.
* Destructive language is refused before any tool is considered.
* High-impact tools require a one-time human approval token (shown in the UI).
* Every execution and approval is written to an append-only audit log with
  secret redaction.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from secrets import token_urlsafe
from typing import Any

from jarvis.config import DATA_DIR, LOG_DIR

AUDIT_FILE = LOG_DIR / "jarvis_audit.jsonl"
HOME = Path.home().resolve()

# Binaries J.A.R.V.I.S. is allowed to launch directly (never through a shell).
ALLOWED_BINARIES = {
    # URL / file openers
    "xdg-open",
    "open",
    "termux-open",
    "gio",
    # windows / desktop control
    "wmctrl",
    "xdotool",
    "xrandr",
    "xset",
    "loginctl",
    "gnome-screensaver-command",
    "xdg-screensaver",
    "systemctl",
    "notify-send",
    "osascript",
    "powershell",
    "pwsh",
    "rundll32",
    "explorer",
    # audio
    "amixer",
    "pactl",
    "wpctl",
    "playerctl",
    "nircmd",
    # brightness / capture
    "brightnessctl",
    "scrot",
    "gnome-screenshot",
    "grim",
    "import",
    "tesseract",
    "screencapture",
    # clipboard
    "xclip",
    "xsel",
    "pbcopy",
    "pbpaste",
    "clip",
    # termux:android (the phone hand)
    "termux-battery-status",
    "termux-volume",
    "termux-notification",
    "termux-notification-list",
    "termux-toast",
    "termux-vibrate",
    "termux-wifi-connectioninfo",
    "termux-open",
    "termux-open-url",
    "termux-telephony-call",
    "termux-sms-send",
    "termux-torch",
    "termux-clipboard-get",
    "termux-clipboard-set",
    "termux-tts-speak",
    "termux-contact-list",
    "termux-location",
    "termux-camera-photo",
    "termux-share",
    "termux-wake-lock",
    "termux-wake-unlock",
    # speech (CLI voice mode)
    "espeak-ng",
    "espeak",
    "say",
    "shutdown",
    "reboot",
    "poweroff",
    "pmset",
}

SHELL_META = ("&&", "||", ";", "|", "`", "$(", ">", "<", "\n")

DANGER_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\brm\s+-[a-z]*[rf]", "recursive delete"),
    (r"\bmkfs(\.[a-z0-9]+)?\b", "filesystem format"),
    (r"\bdd\s+if=", "raw disk write"),
    (r":\(\)\s*\{", "fork bomb"),
    (r"\bdel\s+/[sqf]", "recursive windows delete"),
    (r"\bformat\s+[a-z]:", "drive format"),
    (r"\b(wipe|erase|delete)\s+(all|everything|the\s+entire|whole)", "mass deletion"),
    (r"\b(drop|truncate)\s+(table|database|schema)\b", "database destruction"),
    (r"\bchmod\s+777\b", "insecure permissions"),
    (r"\bchown\s+", "ownership change"),
    (r"\bpasswd\b", "password change"),
    (r"\bsudo\b", "privilege escalation"),
    (r"\bsu\s+-", "privilege escalation"),
    (r"\b(curl|wget)\b[^|]{0,120}\|\s*(ba)?sh", "remote code execution"),
    (r"invoke-expression|iex\s*\(", "remote code execution"),
    (r"\bbcdedit\b", "boot configuration edit"),
    (r"netsh\s+(adv)?firewall\s+(off|disable)", "firewall disable"),
    (r"\breg\s+delete\b", "registry deletion"),
    (r"\b(shutdown|reboot|poweroff)\s+-[hf]", "forced power action"),
)

# Tool families that must be approved by a human before execution.
HIGH_IMPACT_TOOLS = {
    "power",
    "whatsapp_send",
    "email_compose",
    "call_contact",
    "close_app",
    "create_file",
    "delete_file",
    "clear_notes",
    "clear_todos",
    "run_shortcut",
    "vision_look_at_screen",
}

APPROVAL_TTL = 180.0

try:  # reuse the repository's existing redaction rules when available
    from security.policy import redact_secrets as _repo_redact  # type: ignore
except Exception:  # pragma: no cover
    _repo_redact = None

SECRET_KEYS = {
    "api_key",
    "apikey",
    "access_token",
    "token",
    "secret",
    "password",
    "passwd",
    "authorization",
    "cookie",
    "gemini_key",
    "approval_token",
}


def redact(value: Any, key: str | None = None) -> Any:
    if isinstance(value, dict):
        out = {}
        for item_key, item_value in value.items():
            lowered = str(item_key).lower().replace("-", "_")
            if lowered in SECRET_KEYS or lowered.endswith("_secret"):
                out[item_key] = "<REDACTED>"
            else:
                out[item_key] = redact(item_value, str(item_key))
        return out
    if isinstance(value, (list, tuple)):
        return [redact(item, key) for item in value]
    if isinstance(value, str) and _repo_redact is not None:
        try:
            return _repo_redact(value)
        except Exception:
            return value
    return value


class Audit:
    """Append-only JSONL audit trail."""

    def __init__(self, path: Path | str | None = None):
        self.path = Path(path) if path else AUDIT_FILE
        self._lock = threading.Lock()
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass

    def record(self, event: str, **data) -> dict:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "event": event,
            **redact(data),
        }
        line = json.dumps(entry, ensure_ascii=False, default=str)
        with self._lock:
            try:
                with self.path.open("a", encoding="utf-8") as handle:
                    handle.write(line + "\n")
            except OSError:
                pass
        return entry

    def recent(self, limit: int = 30) -> list[dict]:
        try:
            lines = self.path.read_text(encoding="utf-8").splitlines()[-max(1, limit):]
        except OSError:
            return []
        entries = []
        for line in lines:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return entries


@dataclass
class PendingAction:
    token: str
    tool: str
    arguments: dict
    summary: str
    created: float = field(default_factory=time.time)

    def expires_in(self) -> int:
        return max(0, int(APPROVAL_TTL - (time.time() - self.created)))


class ApprovalGate:
    """One-time, expiring approvals for high-impact actions."""

    def __init__(self, ttl: float = APPROVAL_TTL):
        self.ttl = ttl
        self._pending: dict[str, PendingAction] = {}
        self._lock = threading.Lock()

    def request(self, tool: str, arguments: dict, summary: str | None = None) -> PendingAction:
        token = token_urlsafe(18)
        action = PendingAction(
            token=token,
            tool=tool,
            arguments=dict(arguments or {}),
            summary=summary or summarize_action(tool, arguments or {}),
        )
        with self._lock:
            self._prune()
            self._pending[token] = action
        return action

    def resolve(self, token: str) -> PendingAction | None:
        with self._lock:
            self._prune()
            return self._pending.pop(str(token), None)

    def deny(self, token: str) -> PendingAction | None:
        with self._lock:
            return self._pending.pop(str(token), None)

    def pending(self) -> list[PendingAction]:
        with self._lock:
            self._prune()
            return list(self._pending.values())

    def _prune(self) -> None:
        cutoff = time.time() - self.ttl
        for token in [key for key, item in self._pending.items() if item.created < cutoff]:
            self._pending.pop(token, None)


def summarize_action(tool: str, arguments: dict) -> str:
    args = arguments or {}
    mapping = {
        "power": lambda: {
            "shutdown": "Shut down this computer",
            "reboot": "Reboot this computer",
            "sleep": "Suspend this computer",
        }.get(str(args.get("action", "")), "Power down this computer"),
        "whatsapp_send": lambda: (
            f"Send WhatsApp to {args.get('contact', '?')}: “{str(args.get('message', ''))[:140]}”"
        ),
        "email_compose": lambda: (
            f"Compose email to {args.get('to', '?')} — {args.get('subject', 'No subject')}"
        ),
        "call_contact": lambda: f"Start a phone call to {args.get('contact', '?')}",
        "close_app": lambda: f"Close application: {args.get('app', '?')}",
        "create_file": lambda: f"Write file {args.get('path', '?')}",
        "delete_file": lambda: f"Delete file {args.get('path', '?')}",
        "clear_notes": lambda: "Erase every stored note",
        "clear_todos": lambda: "Erase the task list",
        "vision_look_at_screen": lambda: "Capture the screen and analyse it",
        "open_path": lambda: f"Open path {args.get('path', '?')}",
    }
    handler = mapping.get(tool)
    if handler:
        try:
            return handler()
        except Exception:
            pass
    pretty = tool.replace("_", " ").title()
    compact = ", ".join(f"{key}={str(value)[:40]}" for key, value in args.items())
    return f"{pretty} — {compact}" if compact else pretty


def check_user_text(text: str) -> tuple[bool, str]:
    """Return (blocked, reason) for destructive natural-language requests."""
    lowered = str(text or "").lower()
    for pattern, label in DANGER_PATTERNS:
        if re.search(pattern, lowered):
            return True, label
    if len(lowered) > 600:
        return True, "request too large"
    return False, ""


def safe_path(value: str, *, base: Path | None = None, must_exist: bool = False) -> Path:
    base = (base or HOME).resolve()
    raw = str(value or "").strip().strip('"').strip("'")
    if not raw:
        raise ValueError("No path supplied")
    if raw.startswith("~"):
        candidate = Path(os.path.expanduser(raw))
    else:
        candidate = Path(raw)
        if not candidate.is_absolute():
            candidate = base / candidate
    resolved = candidate.expanduser().resolve()
    data_root = DATA_DIR.resolve()
    allowed_roots = [base, data_root]
    if not any(_is_within(resolved, root) for root in allowed_roots):
        raise ValueError("Path is outside the allowed workspace")
    if must_exist and not resolved.exists():
        raise ValueError("Path does not exist")
    return resolved


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def is_within(path: str | Path, root: str | Path) -> bool:
    return _is_within(Path(path), Path(root))


def run_command(
    argv: list[str],
    *,
    timeout: float = 12.0,
    input_text: str | None = None,
) -> dict:
    """Run an allow-listed binary with an explicit argument vector."""
    if not argv or not isinstance(argv, list):
        return {"ok": False, "error": "Empty command"}

    binary = Path(str(argv[0])).name
    if binary not in ALLOWED_BINARIES:
        return {"ok": False, "error": f"Binary not permitted: {binary}"}
    if any(meta in str(part) for part in argv[1:] for meta in SHELL_META):
        return {"ok": False, "error": "Shell metacharacters are not permitted"}

    resolved = shutil.which(str(argv[0]))
    if not resolved:
        return {"ok": False, "error": f"{binary} is not installed", "missing": binary}

    try:
        process = subprocess.run(
            [resolved, *[str(part) for part in argv[1:]]],
            capture_output=True,
            text=True,
            timeout=timeout,
            input=input_text,
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


AUDIT = Audit()
AGATE = ApprovalGate()
