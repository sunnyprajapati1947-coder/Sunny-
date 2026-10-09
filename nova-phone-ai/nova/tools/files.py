"""File tools: read/list inside workspace (and read-only project docs), write/edit inside workspace only.

Every write is read back and its SHA-256 compared before the tool reports success.
Existing files are copied to a .nova-backups folder in the workspace before being changed.
"""

from __future__ import annotations

import difflib
import shutil
import time
from pathlib import Path

from nova.context import Context
from nova.security import check_writable, resolve_in_roots
from nova.tools.registry import Tool, ToolResult
from nova.util import sha256_bytes, sha256_file, truncate

MAX_READ_BYTES = 200_000


def _read_roots(ctx: Context) -> list[Path]:
    return [ctx.workspace, ctx.config.project_root / "docs", ctx.config.project_root / "README.md"]


def _list_files(args: dict, ctx: Context) -> ToolResult:
    target = resolve_in_roots(args.get("path") or ".", [ctx.workspace], ctx.workspace)
    if not target.is_dir():
        return ToolResult(False, error=f"not a folder: {target.name or target}")
    entries = []
    for child in sorted(target.iterdir())[:300]:
        kind = "dir" if child.is_dir() else "file"
        size = child.stat().st_size if child.is_file() else 0
        entries.append(f"{kind}\t{size}\t{child.name}")
    text = "\n".join(entries) or "(empty folder)"
    return ToolResult(True, output=text, data={"count": len(entries)})


def _read_file(args: dict, ctx: Context) -> ToolResult:
    path = resolve_in_roots(args["path"], _read_roots(ctx), ctx.workspace)
    if not path.is_file():
        return ToolResult(False, error=f"file not found: {args['path']}")
    size = path.stat().st_size
    if size > MAX_READ_BYTES:
        return ToolResult(False, error=f"file too large ({size} bytes); read a smaller file")
    text = path.read_text(encoding="utf-8", errors="replace")
    return ToolResult(True, output=truncate(text, 3500),
                      data={"bytes": size, "sha256": sha256_file(path), "lines": text.count("\n") + 1})


def _backup_existing(path: Path, ctx: Context) -> str | None:
    if not path.exists():
        return None
    backup_dir = ctx.workspace / ".nova-backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    dest = backup_dir / f"{path.name}.{int(time.time() * 1000)}.bak"
    shutil.copy2(path, dest)
    return str(dest.relative_to(ctx.workspace))


def _verified_write(path: Path, content: str, ctx: Context) -> ToolResult:
    check_writable(path, ctx.workspace, ctx.config.protected_paths())
    path.parent.mkdir(parents=True, exist_ok=True)
    data = content.encode("utf-8")
    backup = _backup_existing(path, ctx)
    path.write_bytes(data)
    # Read-back verification: the file on disk must match exactly what we intended.
    if sha256_bytes(path.read_bytes()) != sha256_bytes(data):
        return ToolResult(False, error="write verification failed: on-disk hash differs")
    rel = str(path.relative_to(ctx.workspace))
    msg = f"wrote {rel} ({len(data)} bytes, verified)"
    if backup:
        msg += f"; previous version saved to {backup}"
    return ToolResult(True, output=msg, data={"path": rel, "bytes": len(data), "sha256": sha256_bytes(data),
                                               "backup": backup})


def _write_file(args: dict, ctx: Context) -> ToolResult:
    path = resolve_in_roots(args["path"], [ctx.workspace], ctx.workspace)
    return _verified_write(path, args["content"], ctx)


def _edit_file(args: dict, ctx: Context) -> ToolResult:
    path = resolve_in_roots(args["path"], [ctx.workspace], ctx.workspace)
    if not path.is_file():
        return ToolResult(False, error=f"file not found: {args['path']}")
    old, new = args["old"], args["new"]
    if not old:
        return ToolResult(False, error="'old' text must not be empty")
    original = path.read_text(encoding="utf-8")
    count = original.count(old)
    if count == 0:
        return ToolResult(False, error="'old' text was not found; nothing changed")
    if count > 1 and not args.get("replace_all", False):
        return ToolResult(False, error=f"'old' text matches {count} places; make it more specific")
    updated = original.replace(old, new) if args.get("replace_all") else original.replace(old, new, 1)
    diff = "".join(difflib.unified_diff(original.splitlines(True), updated.splitlines(True), n=1))
    result = _verified_write(path, updated, ctx)
    if result.ok:
        result.output += "\n" + truncate(diff, 800)
    return result


TOOLS = [
    Tool("list_files", "List files and folders in the workspace.",
         {"path": {"type": "str", "help": "folder relative to workspace"}},
         _list_files),
    Tool("read_file", "Read a text file from the workspace (or project docs).",
         {"path": {"type": "str", "required": True}}, _read_file),
    Tool("write_file", "Create or overwrite a text file in the workspace. Verified by read-back.",
         {"path": {"type": "str", "required": True}, "content": {"type": "str", "required": True}},
         _write_file),
    Tool("edit_file", "Replace exact text inside a workspace file (old must match once unless replace_all).",
         {"path": {"type": "str", "required": True}, "old": {"type": "str", "required": True},
          "new": {"type": "str", "required": True}, "replace_all": {"type": "bool"}},
         _edit_file),
]
