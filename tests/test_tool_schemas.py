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
assert schema["properties"]["timeout"]["type"] == "integer"
assert schema["properties"]["verbose"]["type"] == "boolean"
assert schema["required"] == ["command"]
assert schema["additionalProperties"] is False

print("NOVA TOOL SCHEMAS: PASS")


bounded = NovaTool(
    name="bounded",
    category="test",
    description="bounded schema test",
    run=lambda duration: {"success": True},
    parameters={
        "type": "object",
        "properties": {
            "duration": {"type": "integer", "minimum": 2, "maximum": 60},
            "privacy": {"type": "string", "enum": ["private", "unlisted", "public"]},
        },
        "required": ["duration", "privacy"],
        "additionalProperties": False,
    },
)
assert registry.validate_arguments(bounded, {"duration": 30, "privacy": "private"})[0]
assert not registry.validate_arguments(bounded, {"duration": True, "privacy": "private"})[0]
assert not registry.validate_arguments(bounded, {"duration": 1, "privacy": "private"})[0]
assert not registry.validate_arguments(bounded, {"duration": 30, "privacy": "publicly"})[0]
print("NOVA SCHEMA CONSTRAINTS: PASS")
