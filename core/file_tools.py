"""Nova file tools — phone ki files dhoondo, kholo, padho.

Real JARVIS feature list se: "File Management: files search karna, folders
open karna". Termux me phone storage tab milta hai jab `termux-setup-storage`
chala ho (~/storage/shared = phone ka internal storage).

Design rules:
- Sirf allowed roots ke andar: ~/storage/*, ~/Nova, ~/ (shallow). Env
  NOVA_FILE_ROOTS se override (colon-separated).
- Bounded search: max results + time budget, phone hang kabhi nahi.
- file_open sirf allowed roots ke andar — koi bhi path escape nahi.
- pdf_read optional `pypdf` dependency hai (pip install pypdf) — bina uske
  saaf error ke saath fail hota hai, crash nahi.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

HOME = Path.home()
TIME_BUDGET = 8.0  # seconds
MAX_RESULTS = 25
MAX_WALK = 60_000  # max files scanned


def _roots() -> list[Path]:
    """Search/open allowed directories (env NOVA_FILE_ROOTS override)."""
    env = os.getenv("NOVA_FILE_ROOTS", "").strip()
    if env:
        return [Path(p).expanduser() for p in env.split(":")
                if p.strip() and Path(p).expanduser().is_dir()]
    defaults = [
        HOME / "storage" / "shared",
        HOME / "storage" / "downloads",
        HOME / "storage" / "documents",
        HOME / "storage" / "pictures",
        HOME / "storage" / "dcim",
        HOME / "storage" / "music",
        HOME / "Nova",
    ]
    return [d for d in defaults if d.is_dir()]


def _inside_roots(path: Path) -> bool:
    try:
        resolved = path.resolve(strict=False)
    except OSError:
        return False
    for root in _roots():
        try:
            resolved.relative_to(root.resolve(strict=False))
            return True
        except ValueError:
            continue
    return False


def _fmt_size(n: int) -> str:
    if n >= 1024 * 1024 * 1024:
        return f"{n / (1024**3):.1f} GB"
    if n >= 1024 * 1024:
        return f"{n / (1024**2):.1f} MB"
    if n >= 1024:
        return f"{n / 1024:.0f} KB"
    return f"{n} B"


def file_search(pattern: str, max_results: int = MAX_RESULTS) -> dict[str, Any]:
    """Name me pattern dhoondo (case-insensitive substring) allowed roots me."""
    pattern = str(pattern or "").strip().lower()
    if len(pattern) < 2:
        return {"success": False, "error": "kam se kam 2 letter ka naam bolo"}

    roots = _roots()
    if not roots:
        return {
            "success": False,
            "error": "storage access nahi mila — Termux me `termux-setup-storage` chalao (ek baar, permission dena)",
        }

    matches: list[dict[str, Any]] = []
    scanned = 0
    deadline = time.monotonic() + TIME_BUDGET
    try:
        for root in roots:
            if not root.is_dir():
                continue
            for dirpath, dirnames, filenames in os.walk(root):
                if time.monotonic() > deadline or scanned >= MAX_WALK:
                    break
                # hidden dirs skip (.trash, .thumbnails)
                dirnames[:] = [d for d in dirnames if not d.startswith(".")]
                for name in filenames:
                    scanned += 1
                    if pattern in name.lower():
                        try:
                            p = Path(dirpath) / name
                            stat = p.stat()
                            matches.append({
                                "name": name,
                                "path": str(p),
                                "size": _fmt_size(stat.st_size),
                                "modified": time.strftime("%d %b %Y", time.localtime(stat.st_mtime)),
                            })
                            if len(matches) >= max_results:
                                raise StopIteration
                        except OSError:
                            continue
    except StopIteration:
        pass

    return {
        "success": True,
        "query": pattern,
        "count": len(matches),
        "scanned_files": scanned,
        "files": matches,
        "roots": [str(r) for r in roots],
    }


def storage_status() -> dict[str, Any]:
    """Kitna storage khali/bhara hai (per root)."""
    roots = _roots()
    if not roots:
        return {
            "success": False,
            "error": "storage access nahi mila — `termux-setup-storage` chalao",
        }
    parts = []
    for root in roots:
        try:
            usage = shutil.disk_usage(root)
            parts.append({
                "root": str(root),
                "total": _fmt_size(usage.total),
                "used": _fmt_size(usage.used),
                "free": _fmt_size(usage.free),
                "percent_free": round(usage.free * 100 / usage.total, 1) if usage.total else 0,
            })
        except OSError:
            continue
    if not parts:
        return {"success": False, "error": "disk usage nahi mila"}
    top = parts[0]
    return {"success": True, "disks": parts, "summary": f"{top['free']} khali hai ({top['percent_free']} percent) out of {top['total']}"}


def file_open(path: str) -> dict[str, Any]:
    """File ko uske default Android app me kholo (allowed roots only)."""
    p = Path(str(path or "")).expanduser()
    if not p.is_absolute():
        # relative name -> pehle search karke latest match kholo
        found = file_search(p.name)
        if found.get("count"):
            p = Path(found["files"][0]["path"])
        else:
            return {"success": False, "error": f"'{p.name}' nahi mila files me"}
    if not p.is_file():
        return {"success": False, "error": f"file nahi mili: {p}"}
    if not _inside_roots(p):
        return {"success": False, "error": "ye path meri allowed directories ke bahar hai"}
    for exe, kind in (("termux-open", "android"), ("xdg-open", "desktop")):
        runner = shutil.which(exe)
        if runner:
            try:
                subprocess.run([runner, str(p)], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=15, check=False)
                return {"success": True, "opened": str(p), "mode": kind}
            except Exception as exc:
                return {"success": False, "error": f"khol nahi paya: {exc}"}
    return {"success": False, "error": "termux-open nahi mila (Termux me chalao)"}


def pdf_read(path: str, max_chars: int = 2000) -> dict[str, Any]:
    """PDF ka text nikalo (pypdf optional: pip install pypdf)."""
    p = Path(str(path or "")).expanduser()
    if not p.is_absolute():
        found = file_search(p.name if p.name else ".pdf")
        pdfs = [f for f in found.get("files", []) if f["name"].lower().endswith(".pdf")]
        if pdfs:
            p = Path(pdfs[0]["path"])
        else:
            return {"success": False, "error": "koi pdf nahi mila is naam se"}
    if not p.is_file():
        return {"success": False, "error": f"file nahi mili: {p}"}
    if not _inside_roots(p):
        return {"success": False, "error": "ye path allowed directories ke bahar hai"}
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError:
        return {
            "success": False,
            "error": "PDF padhne ke liye ek chota package chahiye — Termux me chalao: pip install pypdf",
        }
    try:
        reader = PdfReader(str(p))
        pages = len(reader.pages)
        text = ""
        for page in reader.pages:
            text += (page.extract_text() or "") + "\n"
            if len(text) >= max_chars:
                break
        text = text.strip()
        if not text:
            return {"success": True, "pages": pages, "text": "", "note": "pdf me text nahi mila (scanned image ho sakti hai)"}
        return {"success": True, "path": str(p), "pages": pages, "chars": len(text), "text": text[:max_chars]}
    except Exception as exc:
        return {"success": False, "error": f"pdf padh nahi paya: {exc}"}
