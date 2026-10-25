"""One-time approvals bound to the exact tool + arguments.

The old Nova approval matched only the tool name, so a token issued for
`fs_write {"path": "notes.md"}` could be redeemed for `fs_write {"path": "~/.bashrc"}`.
Here an approval hashes the normalised arguments and expires.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import time
from dataclasses import dataclass

from .db import Database


def args_hash(tool: str, arguments: dict) -> str:
    body = json.dumps({"tool": tool, "args": arguments or {}}, sort_keys=True,
                      ensure_ascii=False, default=str)
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


@dataclass
class Approval:
    id: str
    tool: str
    arguments: dict
    risk: str
    reason: str
    status: str
    created: float
    expires: float

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "tool": self.tool,
            "arguments": self.arguments,
            "risk": self.risk,
            "reason": self.reason,
            "status": self.status,
            "created": self.created,
            "expires": self.expires,
            "expires_in": max(0, int(self.expires - time.time())),
        }


class ApprovalStore:
    def __init__(self, db: Database, ttl: int = 600):
        self.db = db
        self.ttl = max(30, int(ttl))

    def request(self, tool: str, arguments: dict, risk: str = "medium", reason: str = "") -> Approval:
        approval_id = "apr_" + secrets.token_hex(8)
        now = time.time()
        expires = now + self.ttl
        payload = json.dumps(arguments or {}, ensure_ascii=False, sort_keys=True, default=str)
        self.db.execute(
            "INSERT INTO approvals(id, tool, arguments, arg_hash, risk, reason, status, created, expires) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (approval_id, tool, payload, args_hash(tool, arguments or {}), risk,
             reason[:400], "PENDING", now, expires),
        )
        self.db.audit("approval_requested", {"id": approval_id, "tool": tool, "risk": risk})
        return Approval(approval_id, tool, arguments or {}, risk, reason, "PENDING", now, expires)

    def pending(self) -> list[Approval]:
        self.expire()
        rows = self.db.query("SELECT * FROM approvals WHERE status='PENDING' ORDER BY created DESC")
        return [self._row(row) for row in rows]

    def get(self, approval_id: str) -> Approval | None:
        row = self.db.one("SELECT * FROM approvals WHERE id=?", (approval_id,))
        return self._row(row) if row else None

    def decide(self, approval_id: str, approve: bool) -> tuple[bool, str]:
        row = self.db.one("SELECT * FROM approvals WHERE id=?", (approval_id,))
        if not row:
            return False, "Approval not found."
        if row["status"] != "PENDING":
            return False, f"Approval is already {row['status'].lower()}."
        if row["expires"] < time.time():
            self.db.execute("UPDATE approvals SET status='EXPIRED' WHERE id=?", (approval_id,))
            return False, "Approval expired."
        status = "APPROVED" if approve else "DENIED"
        self.db.execute("UPDATE approvals SET status=?, decided=? WHERE id=?",
                        (status, time.time(), approval_id))
        self.db.audit("approval_" + status.lower(), {"id": approval_id, "tool": row["tool"]})
        return True, status

    def consume(self, approval_id: str, tool: str, arguments: dict) -> tuple[bool, str]:
        """Single use. Must match tool *and* arguments, and must not be expired."""
        row = self.db.one("SELECT * FROM approvals WHERE id=?", (approval_id,))
        if not row:
            return False, "Approval not found."
        if row["status"] != "APPROVED":
            return False, f"Approval is {row['status'].lower()}, not approved."
        if row["expires"] < time.time():
            self.db.execute("UPDATE approvals SET status='EXPIRED' WHERE id=?", (approval_id,))
            return False, "Approval expired."
        if row["tool"] != tool:
            self.db.audit("approval_mismatch", {"id": approval_id, "expected": row["tool"], "got": tool})
            return False, "Approval was issued for a different tool."
        if row["arg_hash"] != args_hash(tool, arguments or {}):
            self.db.audit("approval_mismatch", {"id": approval_id, "tool": tool})
            return False, "Approval was issued for different arguments."
        self.db.execute("UPDATE approvals SET status='USED', decided=? WHERE id=?",
                        (time.time(), approval_id))
        self.db.audit("approval_used", {"id": approval_id, "tool": tool})
        return True, "ok"

    def expire(self) -> int:
        cursor = self.db.execute(
            "UPDATE approvals SET status='EXPIRED' WHERE status='PENDING' AND expires < ?",
            (time.time(),),
        )
        return cursor.rowcount or 0

    @staticmethod
    def _row(row) -> Approval:
        try:
            arguments = json.loads(row["arguments"] or "{}")
        except Exception:
            arguments = {}
        return Approval(
            id=row["id"], tool=row["tool"], arguments=arguments, risk=row["risk"],
            reason=row["reason"] or "", status=row["status"], created=row["created"],
            expires=row["expires"],
        )
