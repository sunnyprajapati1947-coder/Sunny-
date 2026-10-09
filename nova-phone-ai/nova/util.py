"""Small shared helpers: secret redaction, truncation, timestamps, hashing, logging."""

from __future__ import annotations

import datetime as _dt
import hashlib
import re
from pathlib import Path

_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{10,}"),
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[=:]\s*\S+"),
]

_known_secrets: set[str] = set()


def register_secret(value: str) -> None:
    """Remember a secret value (from secrets.env) so it is never echoed back."""
    if value and len(value) >= 8:
        _known_secrets.add(value)


def redact(text: str) -> str:
    out = str(text)
    for secret in sorted(_known_secrets, key=len, reverse=True):
        out = out.replace(secret, "[REDACTED]")
    for pattern in _SECRET_PATTERNS:
        out = pattern.sub("[REDACTED]", out)
    return out


def truncate(text: str, limit: int = 4000) -> str:
    text = str(text)
    if len(text) <= limit:
        return text
    return text[: limit - 40] + f"\n...[truncated {len(text) - limit + 40} chars]"


def now_iso() -> str:
    return _dt.datetime.now().astimezone().isoformat(timespec="seconds")


def now_ts() -> float:
    return _dt.datetime.now().timestamp()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def append_log(path: Path, message: str) -> None:
    """Append a timestamped, redacted line to a log file (never raises)."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(f"{now_iso()} {redact(message)}\n")
    except OSError:
        pass
