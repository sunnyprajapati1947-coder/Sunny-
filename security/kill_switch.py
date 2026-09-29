from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KILL_FILE = ROOT / "config" / "NOVA_KILL"


class NovaKillSwitch:
    """Deterministic emergency stop for all Nova tool execution."""

    def __init__(self, path: Path = KILL_FILE):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def is_active(self) -> bool:
        return self.path.exists()

    def activate(self):
        self.path.write_text("NOVA_KILL_SWITCH_ACTIVE\n", encoding="utf-8")

    def deactivate(self):
        if self.path.exists():
            self.path.unlink()

    def status(self) -> dict:
        return {
            "active": self.is_active(),
            "file": str(self.path),
        }
