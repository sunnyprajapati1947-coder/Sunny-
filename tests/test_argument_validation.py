from core.tool_registry import NovaTool, NovaToolRegistry


def test_tool(command: str, timeout: int = 10):
    return {
        "success": True,
        "result": command,
        "timeout": timeout,
    }


registry = NovaToolRegistry()

registry.register(
    NovaTool(
        name="test_tool",
        category="test",
        description="validation test",
        run=test_tool,
    )
)

# Missing required argument
missing = registry.execute("test_tool", {})
assert missing["success"] is False
assert "Missing required arguments" in missing["error"]

# Wrong type
wrong = registry.execute(
    "test_tool",
    {"command": 123},
)
assert wrong["success"] is False
assert "Invalid type" in wrong["error"]

# Unknown argument
unknown = registry.execute(
    "test_tool",
    {
        "command": "hello",
        "extra": True,
    },
)
assert unknown["success"] is False
assert "Unknown tool arguments" in unknown["error"]

# Valid execution
valid = registry.execute(
    "test_tool",
    {
        "command": "hello",
        "timeout": 5,
    },
)
assert valid["success"] is True
assert valid["result"] == "hello"

print("NOVA ARGUMENT VALIDATION: PASS")
