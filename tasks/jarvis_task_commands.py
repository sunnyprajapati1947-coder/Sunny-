"""Safe voice/text commands for the persistent task queue.

This module queues and reports work; it does not pretend queued descriptions
are executable plans. Execution requires a separately verified planner and
allowlisted executor.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from tasks.task_queue import NovaTaskQueue
from tasks.task_state import TaskState


ADD_RE = re.compile(
    r"^\s*(?:jarvis[,: ]+)?(?:task|kaam)\s+"
    r"(?:add|queue|save|jod(?:o)?|daal(?:o)?|likh(?:\s+do)?)"
    r"\s*(?:[:\-]\s*|\s+)(.+?)\s*$",
    re.IGNORECASE,
)
LIST_RE = re.compile(
    r"\b(?:pending tasks?|task list|tasks? dikhao|kaam ki list|"
    r"pending kaam|mere pending kaam|kaam batao|queue dikhao)\b",
    re.IGNORECASE,
)
STATUS_RE = re.compile(r"\btask\s+status\s+(nova-[a-f0-9]{6,20})\b", re.IGNORECASE)
RESUME_RE = re.compile(r"\b(?:task\s+resume|resume task|task dobara chalao)\s+(nova-[a-f0-9]{6,20})\b", re.IGNORECASE)
RUN_RE = re.compile(
    r"^\s*(?:jarvis[,: ]+)?(?:task run pending|run pending tasks|"
    r"pending tasks run|pending kaam chalao)\s*[.!]?\s*$",
    re.IGNORECASE,
)


def _queue() -> NovaTaskQueue:
    # Keep personal task state out of the Git repository by default.
    configured = os.environ.get("NOVA_TASK_STATE_PATH", "").strip()
    path = Path(configured).expanduser() if configured else (
        Path.home() / ".local" / "share" / "nova" / "tasks.json"
    )
    return NovaTaskQueue(state=TaskState(path=path))


def handle_task_command(text: str, owner: str = "Boss") -> str | None:
    """Handle explicit queue commands; return None for ordinary conversation."""
    text = str(text or "").strip()
    try:
        queue = _queue()
    except Exception as exc:
        return f"Task list load nahi hui: {type(exc).__name__}. Data file check karni hogi."

    match = ADD_RE.match(text)
    if match:
        description = match.group(1).strip().strip('"\'')[:500]
        if len(description) < 3:
            return "Kaam add karne ke liye description bhi bolo, jaise: task add: science notes banana."
        try:
            task = queue.enqueue(description)
            return (
                f"Task save kar diya {owner}. ID {task.task_id}. "
                "Ye queue mein hai; automatic execution abhi enabled nahi hai."
            )
        except Exception as exc:
            return f"Task save nahi hua: {type(exc).__name__}."

    if LIST_RE.search(text):
        tasks = sorted(queue.state.tasks.values(), key=lambda t: t.created_at, reverse=True)
        if not tasks:
            return f"Abhi task queue khali hai {owner}."
        lines = [
            f"{t.task_id}: {t.status} — {t.description[:90]}"
            for t in tasks[:8]
        ]
        return f"{owner}, task list (latest 8 tak): " + " | ".join(lines)

    if RUN_RE.match(text):
        try:
            from tasks.safe_task_runner import run_next_safe_task
            task = run_next_safe_task()
            if task is None:
                return f"Koi pending task nahi hai {owner}."
            if task.status == "COMPLETED":
                return (
                    f"Verified task complete, {owner}: {task.task_id}. "
                    f"Kaam: {task.description}. Result: {str(task.checkpoint)[:350]}"
                )
            return (
                f"Task runner yahan ruk gaya: {task.task_id} ({task.status}). "
                f"Reason: {task.error or 'verification incomplete'}. "
                "Unsupported tasks execute nahi kiye gaye."
            )
        except Exception as exc:
            return f"Safe task runner start nahi hua: {type(exc).__name__}."

    match = STATUS_RE.search(text)
    if match:
        task = queue.state.tasks.get(match.group(1))
        if task is None:
            return "Is ID ka task nahi mila."
        return (
            f"Task {task.task_id}: {task.status}. Kaam: {task.description}. "
            f"Attempts: {task.attempts}. Error: {task.error or 'none'}."
        )

    match = RESUME_RE.search(text)
    if match:
        task = queue.state.tasks.get(match.group(1))
        if task is None:
            return "Is ID ka task nahi mila."
        if task.status != "FAILED":
            return f"Task {task.task_id} ka status {task.status} hai; sirf FAILED task resume ho sakta hai."
        try:
            queue.state.resume(task.task_id)
            return (
                f"Task {task.task_id} wapas PENDING queue mein hai. "
                "Execution tabhi hogi jab verified task runner enabled hoga."
            )
        except Exception as exc:
            return f"Task resume nahi hua: {type(exc).__name__}."

    return None
