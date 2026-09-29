from core.tool_registry import NovaToolRegistry, NovaTool
from security.policy import check_command

assert check_command("echo hello")[0] is True
assert check_command("rm -rf /")[0] is False
assert check_command("echo hello && rm -rf /")[0] is False
assert check_command("cat file | grep test")[0] is False
assert check_command("echo $(whoami)")[0] is False
assert check_command("echo hello\nrm test")[0] is False

registry = NovaToolRegistry()

registry.register(
    NovaTool(
        name="run_command",
        category="system",
        description="test command",
        run=lambda command: {
            "success": True,
            "output": command,
        },
    )
)

blocked = registry.execute(
    "run_command",
    {"command": "echo hello && rm -rf /"},
)

assert blocked["success"] is False
assert blocked["blocked"] is True

safe = registry.execute(
    "run_command",
    {"command": "echo hello"},
)

assert safe["success"] is True

print("NOVA SECURITY BOUNDARY: PASS")
