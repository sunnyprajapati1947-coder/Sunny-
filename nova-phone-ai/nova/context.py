"""Runtime context shared by tools, the agent and the task runner."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from nova.config import Config
from nova.memory import Memory
from nova.util import append_log

Approver = Callable[[str, str, str], bool]  # (tool_name, risk, reason) -> allowed?


def interactive_approver(tool: str, risk: str, reason: str) -> bool:
    try:
        answer = input(f"\n[approval] Nova wants to run '{tool}' ({risk}: {reason}). Allow? [y/N] ")
    except (EOFError, KeyboardInterrupt):
        return False
    return answer.strip().lower() in {"y", "yes", "haan", "ha"}


def deny_approver(tool: str, risk: str, reason: str) -> bool:
    return False


@dataclass
class Context:
    config: Config
    memory: Memory
    approver: Approver = deny_approver
    interactive: bool = False
    task_id: str | None = None
    session: str = "default"
    extra: dict = field(default_factory=dict)

    @property
    def workspace(self):
        return self.config.workspace

    def log(self, message: str) -> None:
        append_log(self.config.log_dir / "nova.log", message)
