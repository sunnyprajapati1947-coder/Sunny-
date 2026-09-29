from pathlib import Path
from tempfile import TemporaryDirectory

from core.tool_registry import NovaTool, NovaToolRegistry
from security.audit import NovaAudit
from security.kill_switch import NovaKillSwitch


with TemporaryDirectory() as tmp:
    root = Path(tmp)

    kill = NovaKillSwitch(root / "NOVA_KILL")
    audit = NovaAudit(root / "audit.jsonl")

    registry = NovaToolRegistry(
        audit=audit,
        kill_switch=kill,
    )

    registry.register(
        NovaTool(
            name="safe_test",
            category="test",
            description="kill switch test",
            run=lambda: {
                "success": True,
                "result": "executed",
            },
        )
    )

    normal = registry.execute("safe_test")

    assert normal["success"] is True

    kill.activate()

    assert kill.is_active() is True

    blocked = registry.execute("safe_test")

    assert blocked["success"] is False
    assert blocked["blocked"] is True
    assert blocked["kill_switch"] is True

    kill.deactivate()

    assert kill.is_active() is False

    resumed = registry.execute("safe_test")

    assert resumed["success"] is True

print("NOVA KILL SWITCH: PASS")
