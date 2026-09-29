from pathlib import Path
from tempfile import TemporaryDirectory

from core.tool_registry import NovaTool, NovaToolRegistry
from security.audit import NovaAudit
from security.approval import NovaApproval


with TemporaryDirectory() as tmp:
    audit = NovaAudit(Path(tmp) / "audit.jsonl")
    approval = NovaApproval()
    registry = NovaToolRegistry(
        audit=audit,
        approval=approval,
    )

    registry.register(
        NovaTool(
            name="high_impact_test",
            category="test",
            description="high impact test",
            run=lambda value: {
                "success": True,
                "result": value,
            },
            high_impact=True,
            parameters={
                "type": "object",
                "properties": {
                    "value": {"type": "string"},
                },
                "required": ["value"],
                "additionalProperties": False,
            },
        )
    )

    blocked = registry.execute(
        "high_impact_test",
        {"value": "Nova"},
    )

    assert blocked["success"] is False
    assert blocked["approval_required"] is True
    assert blocked["approval_token"]

    token = blocked["approval_token"]

    approved = registry.execute(
        "high_impact_test",
        {"value": "Nova"},
        approval_token=token,
    )

    assert approved["success"] is True
    assert approved["result"] == "Nova"

    # Token must be one-time.
    reused = registry.execute(
        "high_impact_test",
        {"value": "Nova"},
        approval_token=token,
    )

    assert reused["success"] is False
    assert reused["approval_required"] is True

print("NOVA APPROVAL GATE: PASS")
