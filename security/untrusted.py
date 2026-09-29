from __future__ import annotations

import re
from typing import Any


INJECTION_PATTERNS = (
    re.compile(r"(?i)\bignore\s+(all\s+)?previous\s+instructions\b"),
    re.compile(r"(?i)\bignore\s+(all\s+)?prior\s+instructions\b"),
    re.compile(r"(?i)\bdisregard\s+(all\s+)?previous\s+instructions\b"),
    re.compile(r"(?i)\bsystem\s+message\s*[:=]"),
    re.compile(r"(?i)\bdeveloper\s+message\s*[:=]"),
    re.compile(r"(?i)\bnew\s+instructions?\s*[:=]"),
    re.compile(r"(?i)\bdo\s+not\s+tell\s+the\s+user\b"),
    re.compile(r"(?i)\breveal\s+(the\s+)?system\s+prompt\b"),
    re.compile(r"(?i)\bexecute\s+this\s+command\b"),
)


def _scan(value: Any, path: str = "$") -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []

    if isinstance(value, dict):
        for key, item in value.items():
            findings.extend(_scan(item, f"{path}.{key}"))
        return findings

    if isinstance(value, list):
        for index, item in enumerate(value):
            findings.extend(_scan(item, f"{path}[{index}]"))
        return findings

    if isinstance(value, str):
        for pattern in INJECTION_PATTERNS:
            if pattern.search(value):
                findings.append({
                    "path": path,
                    "type": "prompt_injection_marker",
                    "pattern": pattern.pattern,
                })

    return findings


def mark_untrusted(value: Any) -> dict[str, Any]:
    """
    Tool/external content is DATA, never trusted instructions.

    Detection is deterministic. Content is preserved so Nova can inspect it,
    while security metadata tells the planner that it came from an untrusted
    boundary.
    """
    findings = _scan(value)

    return {
        "trust": "untrusted",
        "content": value,
        "security": {
            "injection_detected": bool(findings),
            "findings": findings,
            "instruction_authority": "none",
        },
    }
