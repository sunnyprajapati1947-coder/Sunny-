"""Small built-in tools: time, memory and project notes (all stored locally)."""

from __future__ import annotations

import datetime as dt

from nova.context import Context
from nova.tools.registry import Tool, ToolResult


def _now(args: dict, ctx: Context) -> ToolResult:
    now = dt.datetime.now().astimezone()
    return ToolResult(True, output=now.strftime("%A, %d %B %Y, %H:%M %Z"), data={"iso": now.isoformat(timespec="seconds")})


def _remember(args: dict, ctx: Context) -> ToolResult:
    ctx.memory.set_pref(args["key"], args["value"])
    stored = ctx.memory.get_pref(args["key"])
    if stored != args["value"][:2000]:
        return ToolResult(False, error="memory write could not be verified")
    return ToolResult(True, output=f"remembered {args['key'].strip().lower()} (verified)")


def _recall(args: dict, ctx: Context) -> ToolResult:
    value = ctx.memory.get_pref(args["key"])
    if value is None:
        return ToolResult(False, error=f"nothing remembered for '{args['key']}'")
    return ToolResult(True, output=value)


def _all_memory(args: dict, ctx: Context) -> ToolResult:
    prefs = ctx.memory.all_prefs()
    projects = ctx.memory.list_projects()
    text = "\n".join([f"{k} = {v}" for k, v in prefs.items()] or ["(no saved preferences)"])
    if projects:
        text += "\nprojects:\n" + "\n".join(f"- {p['name']} ({p['path'] or 'no path'})" for p in projects)
    return ToolResult(True, output=text, data={"prefs": len(prefs), "projects": len(projects)})


def _save_project(args: dict, ctx: Context) -> ToolResult:
    ctx.memory.upsert_project(args["name"], args.get("path", ""), args.get("notes", ""))
    return ToolResult(True, output=f"project '{args['name']}' saved")


TOOLS = [
    Tool("current_time", "Get the current local date and time.", {}, _now),
    Tool("remember", "Save a personal preference or fact to long-term memory.",
         {"key": {"type": "str", "required": True}, "value": {"type": "str", "required": True}}, _remember),
    Tool("recall", "Look up a saved preference or fact by key.", {"key": {"type": "str", "required": True}}, _recall),
    Tool("list_memory", "List all saved preferences and projects.", {}, _all_memory),
    Tool("save_project", "Save or update a project record (name, folder path, notes).",
         {"name": {"type": "str", "required": True}, "path": {"type": "str"}, "notes": {"type": "str"}}, _save_project),
]
