"""Persistent, local-first YouTube upload queue for Nova.

The queue stores metadata only; actual YouTube publishing remains the existing
high-impact, human-approval-gated operation.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.youtube_tools import upload_video


def _root() -> Path:
    return Path(os.getenv("NOVA_YOUTUBE_ROOT", str(Path.home() / "Nova" / "youtube"))).expanduser()


def _queue_file() -> Path:
    path = _root() / "queue.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load() -> list[dict[str, Any]]:
    path = _queue_file()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    return data if isinstance(data, list) else []


def _save(items: list[dict[str, Any]]) -> None:
    path = _queue_file()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def queue_add(
    video_path: str,
    title: str,
    description: str = "",
    tags: list | None = None,
    privacy: str = "private",
    category_id: str = "22",
) -> dict[str, Any]:
    if not str(video_path).strip():
        raise ValueError("video_path must be non-empty.")
    if not str(title).strip():
        raise ValueError("title must be non-empty.")
    item = {
        "id": uuid.uuid4().hex[:12],
        "status": "queued",
        "video_path": str(Path(video_path).expanduser()),
        "title": str(title).strip()[:100],
        "description": str(description)[:5000],
        "tags": [str(x)[:100] for x in (tags or [])][:30],
        "privacy": privacy,
        "category_id": str(category_id),
        "created_at": _now(),
        "updated_at": _now(),
    }
    items = _load()
    items.append(item)
    _save(items)
    return {"success": True, "item": item, "queue_file": str(_queue_file())}


def queue_list(status: str = "", limit: int = 50) -> dict[str, Any]:
    if limit < 1:
        raise ValueError("limit must be >= 1.")
    items = _load()
    if status:
        items = [x for x in items if x.get("status") == status]
    return {"success": True, "count": len(items[:limit]), "items": items[:limit]}


def queue_get(item_id: str) -> dict[str, Any]:
    for item in _load():
        if item.get("id") == item_id:
            return {"success": True, "item": item}
    return {"success": False, "message": f"Queue item not found: {item_id}"}


def queue_mark(item_id: str, status: str, **extra: Any) -> dict[str, Any]:
    allowed = {"queued", "uploading", "uploaded", "failed"}
    if status not in allowed:
        raise ValueError(f"status must be one of: {', '.join(sorted(allowed))}")
    items = _load()
    for item in items:
        if item.get("id") == item_id:
            item["status"] = status
            item["updated_at"] = _now()
            item.update(extra)
            _save(items)
            return {"success": True, "item": item}
    return {"success": False, "message": f"Queue item not found: {item_id}"}


def queue_upload(item_id: str) -> dict[str, Any]:
    """Upload one queued item; caller/registry supplies the approval gate."""
    found = queue_get(item_id)
    if not found.get("success"):
        return found
    item = found["item"]
    if item.get("status") == "uploaded":
        return {"success": True, "already_uploaded": True, "item": item}
    queue_mark(item_id, "uploading")
    try:
        result = upload_video(
            item["video_path"],
            item["title"],
            item.get("description", ""),
            item.get("tags", []),
            item.get("privacy", "private"),
            item.get("category_id", "22"),
        )
    except Exception as exc:
        queue_mark(item_id, "failed", error=str(exc))
        raise
    return queue_mark(
        item_id,
        "uploaded",
        video_id=result.get("video_id"),
        upload_result=result,
    )
