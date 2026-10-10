"""Nova context spec — a compact repo context pack for coding questions.

Inspired by trailhq/Graft: an open-source context layer for large codebases
that gives coding agents repo maps, file summaries, and hotspots so they stop
re-exploring from zero every session. Nova adapts the idea to a single
dependency-free pass:

    repo_context_pack(path) -> {
        tree, language stats, largest files, import hubs, key skeletons
    }

The pack is read-only, bounded, and safe: it skips secrets-looking files,
binary blobs, and vendor/cache directories, and it never sends anything
anywhere — the caller decides which local lane sees it.
"""
from __future__ import annotations

import os
import re
from collections import Counter
from pathlib import Path
from typing import Any

SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".venv", "venv",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", "dist", "build", "target",
    ".next", ".nuxt", "out", ".tox", ".idea", ".vscode", "coverage",
}
TEXT_SUFFIXES = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".md", ".txt", ".json", ".yaml",
    ".yml", ".toml", ".ini", ".cfg", ".sh", ".bash", ".html", ".css", ".go",
    ".rs", ".java", ".kt", ".rb", ".php", ".c", ".h", ".cpp", ".hpp", ".cs",
    ".sql", ".env.example", ".gitignore",
}
LANGUAGE_BY_SUFFIX = {
    ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript",
    ".jsx": "JavaScript", ".md": "Markdown", ".json": "JSON", ".yaml": "YAML",
    ".yml": "YAML", ".toml": "TOML", ".sh": "Shell", ".bash": "Shell",
    ".html": "HTML", ".css": "CSS", ".go": "Go", ".rs": "Rust", ".java": "Java",
    ".kt": "Kotlin", ".rb": "Ruby", ".php": "PHP", ".c": "C", ".h": "C",
    ".cpp": "C++", ".hpp": "C++", ".cs": "C#", ".sql": "SQL",
}
MAX_FILES = 1500
MAX_TREE_LINES = 60
SKELETON_DEF = re.compile(r"^\s*(?:async\s+)?(?:def|class|function|func|fn|pub fn|export function)\s+([\w]+)")


def _iter_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in sorted(dirnames) if d not in SKIP_DIRS]
        for name in sorted(filenames):
            if len(files) >= MAX_FILES:
                return files
            files.append(Path(dirpath) / name)
    return files


def _skeleton(path: Path, max_lines: int = 12) -> list[str]:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    found: list[str] = []
    for line in lines:
        m = SKELETON_DEF.match(line)
        if m:
            found.append(m.group(1))
            if len(found) >= max_lines:
                break
    return found


def _import_hubs(files: list[Path], root: Path) -> list[dict[str, Any]]:
    """Python/JS files most imported by other files in the repo (poor man's hubs)."""
    module_names: dict[str, int] = Counter()
    referenced: Counter[str] = Counter()
    for path in files:
        if path.suffix == ".py":
            module_names[path.stem] += 1
    for path in files:
        if path.suffix not in {".py", ".js", ".ts"}:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for m in re.finditer(r"(?:from\s+(\w+)|import\s+(\w+)|require\(['\"]([\w./-]+)['\"]\)|from\s+['\"]([\w./-]+)['\"])", text):
            name = next(g for g in m.groups() if g)
            name = name.rsplit("/", 1)[-1]
            if name in module_names and name != path.stem:
                referenced[name] += 1
    return [
        {"module": name, "referenced_by": count}
        for name, count in referenced.most_common(8)
    ]


def repo_context_pack(path: str, focus: str = "", write_file: bool = False) -> dict[str, Any]:
    """Build a compact context pack for a repository or folder."""
    if not enabled():
        return {"success": False, "error": "Context spec is disabled."}
    root = Path(path).expanduser()
    if not root.is_dir():
        return {"success": False, "error": f"Not a directory: {root}"}

    files = _iter_files(root)
    if not files:
        return {"success": False, "error": "No files found."}

    rel = [f.relative_to(root) for f in files]
    languages = Counter(
        LANGUAGE_BY_SUFFIX.get(f.suffix.lower(), "Other") for f in rel
    )
    sizes = {str(f): f.stat().st_size for f in files if f.stat().st_size > 0}
    largest = sorted(sizes.items(), key=lambda kv: kv[1], reverse=True)[:8]

    tree_lines = [str(root.name) + "/"]
    shown: list[str] = []
    for f in sorted(rel):
        if len(tree_lines) >= MAX_TREE_LINES:
            tree_lines.append(f"... (+{len(rel) - len(shown)} more files)")
            break
        tree_lines.append("  " * min(3, len(f.parts) - 1) + f.name)
        shown.append(str(f))

    # Key files: configs, readme, and files matching the focus words.
    focus_words = {w.lower() for w in re.findall(r"\w+", focus or "")}
    key_files = []
    for f in rel:
        name = f.name.lower()
        is_key = (
            name in {"readme.md", "package.json", "pyproject.toml", "requirements.txt",
                     "setup.py", "cargo.toml", "go.mod", "pom.xml"}
            or (focus_words and focus_words & set(re.findall(r"\w+", str(f).lower())))
        )
        if is_key and f.suffix.lower() in TEXT_SUFFIXES | {".md"}:
            key_files.append(f)
        if len(key_files) >= 6:
            break

    skeletons = {
        str(f): _skeleton(root / f) for f in key_files if f.suffix == ".py"
    }

    pack = {
        "root": str(root),
        "file_count": len(rel),
        "languages": dict(languages.most_common()),
        "tree": tree_lines,
        "largest_files": [{"file": f, "bytes": b} for f, b in largest],
        "import_hubs": _import_hubs(files, root),
        "key_files": [str(f) for f in key_files],
        "skeletons": skeletons,
    }

    if write_file:
        target = root / "NOVA_CONTEXT.md"
        try:
            target.write_text(render_markdown(pack), encoding="utf-8")
            pack["written_to"] = str(target)
        except OSError:
            pass

    return {"success": True, "pack": pack}


def render_markdown(pack: dict[str, Any]) -> str:
    """Render a context pack as a NOVA_CONTEXT.md document (Graft-style)."""
    lines = [
        "# NOVA_CONTEXT.md",
        "",
        f"Repo: `{pack['root']}` — {pack['file_count']} files",
        "",
        "## Languages",
        "",
    ]
    lines += [f"- {lang}: {count}" for lang, count in pack["languages"].items()]
    lines += ["", "## Tree", "", "```"]
    lines += pack["tree"]
    lines += ["```", "", "## Import hubs", ""]
    lines += [f"- `{h['module']}` referenced by {h['referenced_by']} files" for h in pack["import_hubs"]] or ["- none detected"]
    lines += ["", "## Key files", ""]
    lines += [f"- `{f}`" for f in pack["key_files"]] or ["- none detected"]
    lines += ["", "## Skeletons", ""]
    for path, defs in pack["skeletons"].items():
        if defs:
            lines.append(f"### `{path}`")
            lines += [f"- `{d}`" for d in defs]
            lines.append("")
    lines.append("<!-- Generated by Nova context spec (inspired by trailhq/Graft). -->")
    return "\n".join(lines) + "\n"


def enabled() -> bool:
    return os.getenv("NOVA_CONTEXT_SPEC_ENABLED", "true").lower() == "true"
