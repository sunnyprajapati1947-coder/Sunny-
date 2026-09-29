from pathlib import Path
from tempfile import TemporaryDirectory

from core.tool_registry import NovaTool, NovaToolRegistry
from security.audit import NovaAudit


with TemporaryDirectory() as tmp:
    audit = NovaAudit(Path(tmp) / "audit.jsonl")
    registry = NovaToolRegistry(audit=audit)

    registry.register(
        NovaTool(
            name="safe_test",
            category="test",
            description="audit test",
            run=lambda value: {
                "success": True,
                "result": value,
                "api_key": "SECRET_SHOULD_NOT_BE_LOGGED",
            },
        )
    )

    result = registry.execute(
        "safe_test",
        {"value": "Nova"},
    )

    assert result["success"] is True

    events = audit.recent()

    assert len(events) == 1
    assert events[0]["event"] == "tool_executed"
    assert events[0]["tool"] == "safe_test"

    raw = audit.path.read_text()

    assert "SECRET_SHOULD_NOT_BE_LOGGED" not in raw

print("NOVA AUDIT LOG: PASS")
