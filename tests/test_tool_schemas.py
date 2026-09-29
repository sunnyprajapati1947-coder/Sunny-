from core.tool_registry import NovaTool, NovaToolRegistry


def sample_tool(command: str, timeout: int = 10, verbose: bool = False):
    return {
        "success": True,
        "command": command,
        "timeout": timeout,
        "verbose": verbose,
    }


registry = NovaToolRegistry()

registry.register(
    NovaTool(
        name="sample_tool",
        category="test",
        description="schema test",
        run=sample_tool,
    )
)

tool = registry.get("sample_tool")
schema = tool.parameter_schema()

assert schema["type"] == "object"
assert schema["properties"]["command"]["type"] == "string"
assert schema["properties"]["timeout"]["type"] == "number"
assert schema["properties"]["verbose"]["type"] == "boolean"
assert schema["required"] == ["command"]
assert schema["additionalProperties"] is False

print("NOVA TOOL SCHEMAS: PASS")
