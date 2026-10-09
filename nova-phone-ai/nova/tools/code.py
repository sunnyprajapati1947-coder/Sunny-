"""Code writing/execution/testing tools. These always need approval unless the user has
explicitly enabled automatic approval. Code runs inside the workspace with a sanitized env."""

from __future__ import annotations

import sys
import time

from nova.context import Context
from nova.security import PolicyError, resolve_in_roots
from nova.tools.registry import Tool, ToolResult
from nova.tools.shell import run_argv

RUN_TIMEOUT = 20


def _run_python(args: dict, ctx: Context) -> ToolResult:
    scratch = ctx.workspace / ".nova-scratch"
    scratch.mkdir(parents=True, exist_ok=True)
    script = scratch / f"run_{int(time.time() * 1000)}.py"
    script.write_text(args["code"], encoding="utf-8")
    result = run_argv([sys.executable, str(script)], ctx, timeout=RUN_TIMEOUT)
    result.data["script"] = str(script.relative_to(ctx.workspace))
    return result


def _run_tests(args: dict, ctx: Context) -> ToolResult:
    target = resolve_in_roots(args.get("path") or ".", [ctx.workspace], ctx.workspace)
    if not target.is_dir():
        raise PolicyError("test folder not found inside workspace")
    rel = str(target.relative_to(ctx.workspace.resolve())) if target != ctx.workspace.resolve() else "."
    argv = [sys.executable, "-m", "unittest", "discover", "-s", rel, "-v"]
    return run_argv(argv, ctx, timeout=120)


def _python_policy(args: dict, ctx: Context) -> tuple[str, str]:
    return ("safe", "auto-approved by config") if ctx.config.agent.allow_code_exec_in_daemon and not ctx.interactive \
        else ("confirm", "runs model-written Python code")


TOOLS = [
    Tool("run_python", "Write and run a short Python script in the workspace (20s limit). Needs approval.",
         {"code": {"type": "str", "required": True}}, _run_python, risk="confirm", policy=_python_policy),
    Tool("run_tests", "Run unittest tests in a workspace folder (verbose). Needs approval.",
         {"path": {"type": "str", "help": "folder relative to workspace; default '.'"}}, _run_tests, risk="confirm", policy=_python_policy),
]
