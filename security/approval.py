from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from secrets import token_urlsafe


@dataclass(frozen=True)
class ApprovalRequest:
    token: str
    tool: str
    arguments: dict
    created_at: str


class NovaApproval:
    """One-time human approval gate for high-impact tools."""

    def __init__(self):
        self._pending: dict[str, ApprovalRequest] = {}

    def request(self, tool: str, arguments: dict) -> ApprovalRequest:
        token = token_urlsafe(18)

        request = ApprovalRequest(
            token=token,
            tool=tool,
            arguments=dict(arguments),
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        self._pending[token] = request
        return request

    def approve(self, token: str, tool: str, arguments: dict) -> bool:
        """Consume a token only for the exact tool and argument payload."""
        request = self._pending.get(token)

        if request is None:
            return False

        if request.tool != tool or request.arguments != dict(arguments):
            return False

        self._pending.pop(token, None)
        return True

    def pending(self) -> list[ApprovalRequest]:
        return list(self._pending.values())
