"""Tool registry: argument validation, risk gating, approval, auditing and output limits."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from nova.context import Context
from nova.security import PolicyError
from nova.util import redact, truncate

RISK_ORDER = {"safe": 0, "confirm": 1, "blocked": 2}
_TYPES = {"str": str, "int": int, "bool": bool, "list": list, "dict": dict}


@dataclass
class ToolResult:
    ok: bool
    output: str = ""
    data: dict = field(default_factory=dict)
    error: str = ""

    def as_json(self) -> dict:
        out = {"ok": self.ok, "output": truncate(redact(self.output), 3000)}
        if self.error:
            out["error"] = redact(truncate(self.error, 800))
        if self.data:
            out["data"] = self.data
        return out


@dataclass
class Tool:
    name: str
    description: str
    params: dict                     # name -> {"type": "str", "required": True, "help": "..."}
    fn: Callable[[dict, Context], ToolResult]
    risk: str = "safe"
    policy: Callable[[dict, Context], tuple[str, str]] | None = None  # dynamic (risk, reason)


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"duplicate tool {tool.name}")
        self._tools[tool.name] = tool

    def extend(self, tools: list[Tool]) -> None:
        for tool in tools:
            self.register(tool)

    def names(self) -> list[str]:
        return sorted(self._tools)

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def describe(self) -> str:
        lines = []
        for name in self.names():
            tool = self._tools[name]
            args = ", ".join(f"{p}{'' if spec.get('required') else '?'}" for p, spec in tool.params.items())
            lines.append(f"- {name}({args}): {tool.description}")
        return "\n".join(lines)

    def validate(self, tool: Tool, args: dict) -> str | None:
        if not isinstance(args, dict):
            return "arguments must be a JSON object"
        for pname, spec in tool.params.items():
            if spec.get("required") and pname not in args:
                return f"missing required argument '{pname}'"
        for key, value in args.items():
            if key not in tool.params:
                return f"unknown argument '{key}'"
            expected = _TYPES.get(tool.params[key].get("type", "str"), str)
            if expected is int and isinstance(value, str) and value.strip().lstrip("-").isdigit():
                args[key] = int(value)
                continue
            if expected is bool and isinstance(value, str):
                args[key] = value.strip().lower() in {"1", "true", "yes", "y"}
                continue
            if not isinstance(value, expected) or (expected is int and isinstance(value, bool)):
                return f"argument '{key}' must be of type {tool.params[key].get('type', 'str')}"
        return None

    def call(self, name: str, args: dict, ctx: Context) -> ToolResult:
        tool = self.get(name)
        if tool is None:
            return ToolResult(False, error=f"unknown tool '{name}'. Available: {', '.join(self.names())}")
        args = dict(args or {})
        problem = self.validate(tool, args)
        if problem:
            ctx.memory.log_tool(name, args, tool.risk, False, problem, ctx.task_id)
            return ToolResult(False, error=problem)

        risk, reason = tool.risk, f"{name} default risk"
        if tool.policy is not None:
            try:
                risk, reason = tool.policy(args, ctx)
            except PolicyError as exc:
                risk, reason = "blocked", str(exc)

        if risk == "blocked":
            result = ToolResult(False, error=f"blocked by safety policy: {reason}")
        elif risk == "confirm" and not ctx.approver(name, risk, reason):
            result = ToolResult(False, error=f"not approved ({reason}). Nothing was executed.")
        else:
            try:
                result = tool.fn(args, ctx)
            except PolicyError as exc:
                result = ToolResult(False, error=f"policy: {exc}")
            except Exception as exc:  # tools must never crash the agent loop
                result = ToolResult(False, error=f"{type(exc).__name__}: {exc}")

        summary = result.output if result.ok else result.error
        ctx.memory.log_tool(name, args, risk, result.ok, summary, ctx.task_id)
        ctx.log(f"tool={name} risk={risk} ok={result.ok} summary={summary[:160]}")
        return result
