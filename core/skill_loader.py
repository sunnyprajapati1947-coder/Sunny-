"""Nova skill packs — SKILL.md manifest loader.

Inspired by VoltAgent/awesome-agent-skills: a curated collection of agent
skills in a standard SKILL.md format that works across coding agents.

Nova adapts the format for its own local skills:

    skills/<name>/SKILL.md
        ---
        name: market-analysis
        description: Run Nova's multi-role market analysis
        tools: market_analyze
        ---
        # Steps
        1. ...

The loader validates every pack (required fields, bounded size, safe name)
before Nova can use it, and it never executes skill content automatically —
a skill is instructions for Nova, with tools invoked through the registry.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"
DATA_DIR = Path(__file__).resolve().parent / "data"
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,48}$")
MAX_BODY_CHARS = 6000

REQUIRED_FIELDS = ("name", "description")


def _parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """Parse a simple 'key: value' YAML-like frontmatter block."""
    meta: dict[str, str] = {}
    body = text
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            for line in parts[1].strip().splitlines():
                if ":" in line:
                    key, _, value = line.partition(":")
                    meta[key.strip().lower()] = value.strip()
            body = parts[2].strip()
    return meta, body


def _load_skill_file(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {"ok": False, "reason": f"Unreadable: {path}"}
    meta, body = _parse_frontmatter(raw)
    problems: list[str] = []
    for field in REQUIRED_FIELDS:
        if not meta.get(field):
            problems.append(f"missing field: {field}")
    name = meta.get("name", "")
    if name and not NAME_RE.match(name):
        problems.append("name must be lowercase-with-dashes")
    if len(body) > MAX_BODY_CHARS:
        problems.append("body too large")
    if problems:
        return {"ok": False, "reason": "; ".join(problems)}
    return {
        "ok": True,
        "skill": {
            "name": name,
            "description": meta.get("description", ""),
            "tools": [t.strip() for t in re.split(r"[,\s]+", meta.get("tools", "")) if t.strip()],
            "steps_markdown": body,
            "path": str(path),
        },
    }


# ------------------------------------------------------------------ tools ---

def skills_list() -> dict[str, Any]:
    """List Nova's installed local skill packs."""
    skills: list[dict[str, Any]] = []
    if SKILLS_DIR.is_dir():
        for folder in sorted(SKILLS_DIR.iterdir()):
            if not folder.is_dir():
                continue
            skill_file = folder / "SKILL.md"
            if not skill_file.is_file():
                continue
            loaded = _load_skill_file(skill_file)
            if loaded["ok"]:
                skill = loaded["skill"]
                skills.append({
                    "name": skill["name"],
                    "description": skill["description"],
                    "tools": skill["tools"],
                })
            else:
                skills.append({"name": folder.name, "invalid": loaded["reason"]})
    return {"success": True, "count": len(skills), "skills": skills}


def skills_get(name: str) -> dict[str, Any]:
    """Load one full skill pack by name."""
    clean = str(name or "").strip().lower()
    if not NAME_RE.match(clean):
        return {"success": False, "error": "Invalid skill name."}
    skill_file = SKILLS_DIR / clean / "SKILL.md"
    if not skill_file.is_file():
        return {"success": False, "error": f"Skill not found: {clean}", "hint": "Use skills_list to see installed skills."}
    loaded = _load_skill_file(skill_file)
    if not loaded["ok"]:
        return {"success": False, "error": f"Skill failed validation: {loaded['reason']}"}
    return {"success": True, "skill": loaded["skill"]}


def skills_validate(path: str) -> dict[str, Any]:
    """Validate a SKILL.md file without installing it."""
    target = Path(path).expanduser()
    if not target.is_file():
        return {"success": False, "error": f"No such file: {target}"}
    loaded = _load_skill_file(target)
    if not loaded["ok"]:
        return {"success": False, "error": loaded["reason"]}
    return {"success": True, "valid": True, "name": loaded["skill"]["name"]}


def skills_catalog_search(query: str) -> dict[str, Any]:
    """Search the curated offline index of the community skill catalog."""
    catalog_path = DATA_DIR / "skill_catalog.json"
    if not catalog_path.is_file():
        return {"success": False, "error": "Skill catalog data is missing."}
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"success": False, "error": "Skill catalog data is unreadable."}
    wanted = {w for w in re.findall(r"[a-z0-9+#.-]+", str(query or "").lower()) if len(w) > 1}
    raw_query = str(query or "").strip().lower()
    matches = []
    for skill in catalog.get("skills", []):
        text = f"{skill.get('name','')} {skill.get('description','')}".lower()
        if not raw_query:
            matches.append(skill)
        elif raw_query in text or wanted & set(re.findall(r"[a-z0-9+#.-]+", text)):
            matches.append(skill)
    matches = matches[:20]
    return {
        "success": True,
        "source": catalog.get("source"),
        "query": query,
        "count": len(matches),
        "skills": matches,
    }
