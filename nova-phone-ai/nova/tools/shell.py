"""Controlled command execution. Commands are parsed with shlex and run WITHOUT a shell.

Read-only commands run directly; anything else needs approval; dangerous patterns are blocked.
The working directory is always the workspace and the environment is sanitized.
"""

from __future__ import annotations

import subprocess

from nova.context import Context
from nova.security import GITHUB_TOKEN_VARS, classify_command, parse_command, sanitized_env
from nova.tools.registry import Tool, ToolResult
from nova.util import truncate

TIMEOUT_SECONDS = 60


def _policy(args: dict, ctx: Context) -> tuple[str, str]:
    argv = parse_command(args["command"])
    verdict = classify_command(argv)
    return verdict.risk, verdict.reason


def run_argv(argv: list[str], ctx: Context, timeout: int = TIMEOUT_SECONDS) -> ToolResult:
    ctx.workspace.mkdir(parents=True, exist_ok=True)
    try:
        allow = GITHUB_TOKEN_VARS if argv[0].rsplit("/", 1)[-1] in {"gh", "git"} else ()
        proc = subprocess.run(argv, cwd=str(ctx.workspace), capture_output=True, text=True,
                              timeout=timeout, env=sanitized_env(allow=allow), shell=False)
    except FileNotFoundError:
        return ToolResult(False, error=f"program not installed: {argv[0]}")
    except subprocess.TimeoutExpired:
        return ToolResult(False, error=f"timed out after {timeout}s")
    output = (proc.stdout or "") + (("\n[stderr]\n" + proc.stderr) if proc.stderr.strip() else "")
    ok = proc.returncode == 0
    return ToolResult(ok, output=truncate(output.strip() or "(no output)", 3000),
                      data={"exit_code": proc.returncode}, error="" if ok else f"exit code {proc.returncode}")


def _run_command(args: dict, ctx: Context) -> ToolResult:
    return run_argv(parse_command(args["command"]), ctx)


def _github_cli(args: dict, ctx: Context) -> ToolResult:
    argv = parse_command(args["args"])
    if argv and argv[0] != "gh":
        argv = ["gh"] + argv
    return run_argv(argv, ctx)


def _gh_policy(args: dict, ctx: Context) -> tuple[str, str]:
    argv = parse_command(args["args"])
    if argv and argv[0] != "gh":
        argv = ["gh"] + argv
    return classify_command(argv).risk, classify_command(argv).reason


TOOLS = [
    Tool("run_command", "Run a command in the workspace (no shell). Read-only commands run directly; others need approval.",
         {"command": {"type": "str", "required": True}}, _run_command, risk="confirm", policy=_policy),
    Tool("github_cli", "Run a GitHub CLI (gh) command. Read-only list/view runs directly; writes need approval; auth is blocked.",
         {"args": {"type": "str", "required": True, "help": "e.g. 'repo view owner/name'"}},
         _github_cli, risk="confirm", policy=_gh_policy),
]
