from __future__ import annotations

from pathlib import Path
from datetime import datetime, timezone
import json

from security.policy import redact_secrets


ROOT = Path(__file__).resolve().parents[1]
AUDIT_FILE = ROOT / "logs" / "audit.jsonl"


class NovaAudit:
    def __init__(self, path: Path = AUDIT_FILE):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, event: str, **data):
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event": event,
            **data,
        }

        entry = redact_secrets(entry)

        with self.path.open("a", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    entry,
                    ensure_ascii=False,
                    default=str,
                )
                + "\n"
            )

    def recent(self, limit: int = 20):
        if not self.path.exists():
            return []

        lines = self.path.read_text(
            encoding="utf-8"
        ).splitlines()

        result = []

        for line in lines[-max(1, limit):]:
            try:
                result.append(json.loads(line))
            except json.JSONDecodeError:
                continue

        return result
