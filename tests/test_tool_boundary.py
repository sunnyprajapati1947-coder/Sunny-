from core.tool_registry import NovaTool, NovaToolRegistry
from security.policy import check_command


def test_registry():
    registry = NovaToolRegistry()

    registry.register(
        NovaTool(
            name="test",
            category="test",
            description="Test tool",
            run=lambda: {"success": True},
        )
    )

    result = registry.execute("test")

    assert result["success"] is True
    assert "test" in registry.names()


def test_blocked_command():
    ok, _ = check_command("rm -rf /")
    assert ok is False


def test_empty_command():
    ok, _ = check_command("")
    assert ok is False


if __name__ == "__main__":
    test_registry()
    test_blocked_command()
    test_empty_command()
    print("NOVA TOOL BOUNDARY: PASS")
