"""Bounded, allowlisted executor for explicitly requested queued tasks.

Only read-only status checks are executable. Arbitrary task descriptions are
never translated into shell commands or passed to a model as executable plans.
"""
from __future__ import annotations

import re
from typing import Any

from tasks.jarvis_task_commands import _queue
from tasks.verified_queue import NovaVerifiedQueue

# Keep this allowlist deliberately small and read-only.
_TASK_RULES = (
    (re.compile(r"\b(check|show|get)?\s*(the\s*)?battery( status)?\b", re.I), "phone_battery", {}),
    (re.compile(r"\b(check|show|get)?\s*(the\s*)?(phone )?volume( status)?\b", re.I), "phone_volume", {}),
    (re.compile(r"\b(check|show|get)?\s*(the\s*)?github agent status\b", re.I), "github_agent_status", {}),
    (re.compile(r"\b(check|show|get)?\s*(the\s*)?youtube status\b", re.I), "youtube_status", {}),
    (re.compile(r"\b(check|show|get)?\s*(the\s*)?youtube channel status\b", re.I), "youtube_channel_status", {}),
)


def plan_safe_task(description: str) -> dict[str, Any] | None:
    """Return a fixed tool call for a supported status request, otherwise None."""
    text = str(description or "").strip()
    if not text or len(text) > 500:
        return None
    for pattern, tool_name, arguments in _TASK_RULES:
        if pattern.search(text):
            return {"tool": tool_name, "arguments": dict(arguments)}
    return None


def _unwrap(value: Any) -> Any:
    """Unwrap Nova's untrusted-result envelope without treating it as instructions."""
    current = value
    for _ in range(4):
        if not isinstance(current, dict):
            return current
        nested = current.get("result")
        if isinstance(nested, dict) and isinstance(nested.get("content"), dict):
            current = nested["content"]
            continue
        if isinstance(nested, dict) and "success" in nested:
            current = nested
            continue
        return current
    return current


def execute_safe_task(task, arguments: dict[str, Any], registry=None) -> dict[str, Any]:
    """Execute one allowlisted read-only task through the normal registry boundary."""
    plan = plan_safe_task(task.description)
    if plan is None:
        return {
            "success": False,
            "error": (
                "Unsupported queued task. Only allowlisted read-only status checks "
                "can run automatically; no command was executed."
            ),
        }

    if registry is None:
        from core.tool_bridge import build_registry
        registry = build_registry()

    try:
        raw = registry.execute(plan["tool"], plan["arguments"])
        inner = _unwrap(raw)
        if not isinstance(inner, dict) or inner.get("success") is not True:
            error = inner.get("error", "Tool did not report verified success.") if isinstance(inner, dict) else "Tool returned no structured result."
            return {"success": False, "error": str(error), "tool": plan["tool"]}
        return {
            "success": True,
            "tool": plan["tool"],
            "result": inner,
        }
    except Exception as exc:
        return {
            "success": False,
            "error": f"{type(exc).__name__}: {exc}",
            "tool": plan["tool"],
        }


def run_next_safe_task(registry=None):
    """Run pending tasks sequentially through verification and bounded repair."""
    queue = _queue()
    runner = NovaVerifiedQueue(queue=queue)
    return runner.run_next(
        lambda task, args: execute_safe_task(task, args, registry=registry)
    )
