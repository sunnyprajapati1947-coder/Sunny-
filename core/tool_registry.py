from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable
import inspect

from security.policy import check_tool, redact_secrets
from security.audit import NovaAudit
from security.approval import NovaApproval
from security.kill_switch import NovaKillSwitch
from security.untrusted import mark_untrusted


@dataclass(frozen=True)
class NovaTool:
    name: str
    category: str
    description: str
    run: Callable[..., dict[str, Any]]
    enabled: bool = True
    high_impact: bool = False
    parameters: dict[str, Any] | None = None

    def parameter_schema(self) -> dict[str, Any]:
        if self.parameters is not None:
            return self.parameters

        properties: dict[str, Any] = {}
        required: list[str] = []

        signature = inspect.signature(self.run)

        for name, param in signature.parameters.items():
            if name == "self" or param.kind in (
                inspect.Parameter.VAR_POSITIONAL,
                inspect.Parameter.VAR_KEYWORD,
            ):
                continue

            annotation = param.annotation
            json_type = "string"

            if annotation in (int, float):
                json_type = "number"
            elif annotation is bool:
                json_type = "boolean"
            elif annotation is list:
                json_type = "array"
            elif annotation is dict:
                json_type = "object"

            properties[name] = {"type": json_type}

            if param.default is inspect.Parameter.empty:
                required.append(name)

        schema = {
            "type": "object",
            "properties": properties,
            "additionalProperties": False,
        }

        if required:
            schema["required"] = required

        return schema


class NovaToolRegistry:
    """
    Nova's central tool boundary.

    Every tool must be registered here before Nova can use it.
    Security policy is enforced before execution.
    """

    def __init__(
        self,
        audit: NovaAudit | None = None,
        approval: NovaApproval | None = None,
        kill_switch: NovaKillSwitch | None = None,
    ):
        self._tools: dict[str, NovaTool] = {}
        self.audit = audit or NovaAudit()
        self.approval = approval or NovaApproval()
        self.kill_switch = kill_switch or NovaKillSwitch()

    def register(self, tool: NovaTool):
        if tool.name in self._tools:
            raise ValueError(f"Tool already registered: {tool.name}")
        self._tools[tool.name] = tool

    def get(self, name: str) -> NovaTool:
        if name not in self._tools:
            raise KeyError(f"Unknown Nova tool: {name}")
        return self._tools[name]

    def names(self) -> list[str]:
        return sorted(self._tools)

    def list_tools(self) -> list[NovaTool]:
        return sorted(
            self._tools.values(),
            key=lambda x: (x.category, x.name),
        )

    def validate_arguments(
        self,
        tool: NovaTool,
        arguments: dict[str, Any],
    ) -> tuple[bool, str]:
        schema = tool.parameter_schema()

        if not isinstance(arguments, dict):
            return False, "Tool arguments must be an object."

        properties = schema.get("properties", {})
        required = schema.get("required", [])

        missing = [
            key for key in required
            if key not in arguments
        ]

        if missing:
            return False, (
                "Missing required arguments: "
                + ", ".join(missing)
            )

        if schema.get("additionalProperties") is False:
            unknown = [
                key for key in arguments
                if key not in properties
            ]

            if unknown:
                return False, (
                    "Unknown tool arguments: "
                    + ", ".join(unknown)
                )

        type_map = {
            "string": str,
            "number": (int, float),
            "boolean": bool,
            "object": dict,
            "array": list,
        }

        for key, value in arguments.items():
            expected = properties.get(key, {}).get("type")
            expected_type = type_map.get(expected)

            if expected_type is None:
                continue

            if expected == "number" and isinstance(value, bool):
                return False, f"Invalid type for argument: {key}"

            if not isinstance(value, expected_type):
                return False, (
                    f"Invalid type for argument: {key}; "
                    f"expected {expected}"
                )

        return True, "Arguments valid."

    def execute(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
        *,
        approved: bool = False,
        approval_token: str | None = None,
    ) -> dict[str, Any]:

        arguments = dict(arguments or {})

        if self.kill_switch.is_active():
            self.audit.record(
                "tool_blocked",
                tool=name,
                reason="Nova kill switch is active.",
                arguments=arguments,
            )

            return {
                "success": False,
                "blocked": True,
                "kill_switch": True,
                "error": "Nova kill switch is active.",
            }

        tool = self.get(name)

        if not tool.enabled:
            result = {
                "success": False,
                "error": f"Tool disabled: {name}",
            }
            self.audit.record(
                "tool_blocked",
                tool=name,
                reason="disabled",
                arguments=arguments,
            )
            return result

        approved_now = approved

        if tool.high_impact:
            if approval_token:
                approved_now = self.approval.approve(
                    approval_token,
                    name,
                )

            if not approved_now:
                request = self.approval.request(
                    name,
                    arguments,
                )

                self.audit.record(
                    "approval_required",
                    tool=name,
                    arguments=arguments,
                    approval_token=request.token,
                )

                return {
                    "success": False,
                    "blocked": True,
                    "approval_required": True,
                    "tool": name,
                    "approval_token": request.token,
                    "error": (
                        "Human approval required before this "
                        "high-impact tool can execute."
                    ),
                }

        valid, validation_reason = self.validate_arguments(
            tool,
            arguments,
        )

        if not valid:
            result = {
                "success": False,
                "blocked": True,
                "error": validation_reason,
            }
            self.audit.record(
                "tool_blocked",
                tool=name,
                reason=validation_reason,
                arguments=arguments,
            )
            return result

        allowed, reason = check_tool(
            name,
            arguments=arguments,
            high_impact=tool.high_impact,
            approved=approved_now,
        )

        if not allowed:
            result = {
                "success": False,
                "blocked": True,
                "error": reason,
            }
            self.audit.record(
                "tool_blocked",
                tool=name,
                reason=reason,
                arguments=arguments,
            )
            return result

        try:
            result = tool.run(**arguments)

            if not isinstance(result, dict):
                result = {
                    "success": True,
                    "result": result,
                }

            result.setdefault("success", True)

            # Tool/external output is DATA, never an instruction.
            safe_result = redact_secrets(result)
            boundary = mark_untrusted(safe_result)

            self.audit.record(
                "tool_executed",
                tool=name,
                arguments=arguments,
                result=boundary,
            )

            return {
                "success": True,
                "tool": name,
                "result": boundary,
            }

        except Exception as exc:
            result = {
                "success": False,
                "error": f"{type(exc).__name__}: {exc}",
            }

            self.audit.record(
                "tool_failed",
                tool=name,
                arguments=arguments,
                result=result,
            )

            return result
