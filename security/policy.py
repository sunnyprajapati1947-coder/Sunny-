from __future__ import annotations

import re

BLOCKED_PATTERNS = (
    r"\brm\s+-rf\b",
    r"\brm\s+-r\b",
    r"\bmkfs\b",
    r"\bdd\s+if=",
    r"\bshutdown\b",
    r"\breboot\b",
    r"\bformat\b",
    r"\bpasswd\b",
    r"\bsu\b",
    r"\bsudo\b",
    r"\bchmod\s+777\b",
    r"\bchown\b",
    r"\biptables\b",
)

SHELL_META = ("&&", "||", ";", "|", ">", "<", "`", "$(")

SECRET_PATTERNS = (
    r"(?i)(api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*\S+",
    r"(?i)bearer\s+[A-Za-z0-9._-]+",
)

def check_command(command: str) -> tuple[bool, str]:
    text = str(command or "").strip()

    if not text:
        return False, "Empty command."

    if len(text) > 500:
        return False, "Command too long."

    lowered = text.lower()

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, lowered):
            return False, "Blocked by Nova security policy."

    for meta in SHELL_META:
        if meta in text:
            return False, f"Shell operator blocked: {meta}"

    if "\n" in text or "\r" in text:
        return False, "Multi-line commands are blocked."

    return True, "Allowed by policy."


def check_tool(
    tool_name: str,
    *,
    arguments: dict | None = None,
    high_impact: bool = False,
    approved: bool = False,
):
    if high_impact and not approved:
        return False, "Human approval required."

    arguments = arguments or {}

    if tool_name in {"run_command", "shell", "terminal"}:
        command = arguments.get("command", "")
        return check_command(command)

    return True, "Allowed."


SENSITIVE_KEYS = {
    "api_key",
    "apikey",
    "access_token",
    "access-token",
    "token",
    "secret",
    "password",
    "passwd",
    "authorization",
    "cookie",
}


def redact_secrets(value, _key=None):
    # Redact sensitive dictionary fields before serialization.
    if isinstance(value, dict):
        result = {}

        for key, item in value.items():
            key_text = str(key).lower().replace("-", "_")

            if (
                key_text in SENSITIVE_KEYS
                or "api_key" in key_text
                or "access_token" in key_text
                or "password" in key_text
                or key_text.endswith("_secret")
            ):
                result[key] = "<REDACTED>"
            else:
                result[key] = redact_secrets(item, key)

        return result

    if isinstance(value, list):
        return [
            redact_secrets(item, _key)
            for item in value
        ]

    if isinstance(value, str):
        result = value

        for pattern in SECRET_PATTERNS:
            result = re.sub(
                pattern,
                lambda m: m.group(0).split("=")[0] + "=<REDACTED>",
                result,
            )

        return result

    return value
