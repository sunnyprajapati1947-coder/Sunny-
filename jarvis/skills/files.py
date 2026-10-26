"""File browsing, search and creation — confined to the user's home / data dir."""
from __future__ import annotations

import os
import platform
import re
import shutil
import time
from datetime import datetime
from pathlib import Path

from jarvis.config import DATA_DIR, get_settings
from jarvis.security import is_within, safe_path
from jarvis.util import human_size, reply, truncate

SYSTEM = platform.system().lower()
HOME = Path.home().resolve()
MAX_READ = 64_000
SECRET_KEY = re.compile(
    r"(?:pass(?:word|wd|phrase)?|secret|token|api[_-]?key|private[_-]?key|credential|auth|cookie"
    r"|session[_-]?id|recovery|seed[_-]?phrase)",
    re.I,
)
SECRET_NAME = re.compile(
    r"(?:\.env(?:\..*)?$|secret|token|credential|password|passwd|shadow|id_rsa|id_ed25519"
    r"|\.pem$|\.key$|netrc|keyring|\.git$|client_secret)",
    re.I,
)
SKIP_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    ".cache",
    ".npm",
    "dist",
    "build",
    ".next",
    ".arena",
}


def resolve_for_user(value: str | Path) -> Path:
    raw = str(value or ".").strip().strip('"').strip("'") or "."
    if raw.startswith("~"):
        candidate = Path(os.path.expanduser(raw))
    elif Path(raw).is_absolute():
        candidate = Path(raw)
    else:
        candidate = HOME / raw
    return candidate.resolve()


def _display(path: Path) -> str:
    try:
        relative = path.relative_to(HOME)
    except ValueError:
        return str(path)
    return "~" if str(relative) == "." else "~/" + str(relative)


def _resolve_existing(path: str) -> Path:
    """Resolve a file the user named: cwd, notes dir, then home-relative."""
    raw = str(path or "").strip().strip('"').strip("'")
    if not raw:
        raise ValueError("I need a file name")
    candidates: list[Path] = []
    if raw.startswith("~") or Path(raw).is_absolute():
        candidates.append(Path(os.path.expanduser(raw)))
    else:
        candidates.extend(
            [
                Path.cwd() / raw,
                Path(get_settings().notes_dir) / raw,
                HOME / raw,
            ]
        )
    for candidate in candidates:
        try:
            return safe_path(candidate, base=HOME, must_exist=True)
        except ValueError:
            continue
    try:
        fallback = _create_target(raw)
    except ValueError:
        raise ValueError(f"Path does not exist: {raw}") from None
    if fallback.exists():
        return fallback
    raise ValueError(f"Path does not exist: {raw}")


def _opener() -> list[str] | None:
    if SYSTEM == "darwin":
        return ["open"]
    if SYSTEM == "windows":
        return None
    for candidate in ("xdg-open", "termux-open"):
        if shutil.which(candidate):
            return [candidate]
    return None


def open_path(path: str) -> dict:
    try:
        resolved = _resolve_existing(path)
    except ValueError as exc:
        return reply(f"I cannot open that, Sir — {exc}.")
    if SYSTEM == "windows":
        try:
            os.startfile(str(resolved))  # type: ignore[attr-defined]
            return reply(
                f"Opening {resolved.name}, Sir.",
                speech=f"Opening {resolved.name}, Sir.",
                cards=[{"type": "file", "name": resolved.name, "path": str(resolved)}],
            )
        except OSError:
            return reply("Windows refused to open that path, Sir.")
    opener = _opener()
    if not opener:
        return reply("No file opener is available on this machine, Sir.")
    from jarvis.security import run_command

    result = run_command([opener[0], str(resolved)], timeout=8)
    if result.get("ok"):
        return reply(
            f"Opening {resolved.name}, Sir.",
            speech=f"Opening {resolved.name}, Sir.",
            cards=[{"type": "file", "name": resolved.name, "path": _display(resolved)}],
        )
    return reply(
        f"I could not open {resolved.name}, Sir. {result.get('error', '')}".strip(),
        speech=f"I could not open {resolved.name}, Sir.",
    )


def list_dir(path: str = ".") -> dict:
    try:
        resolved = safe_path(path or ".", base=HOME, must_exist=True)
    except ValueError as exc:
        return reply(f"I cannot list that location, Sir — {exc}.")
    if resolved.is_file():
        stat = resolved.stat()
        return reply(
            f"{resolved.name} is {human_size(stat.st_size)}, modified "
            f"{datetime.fromtimestamp(stat.st_mtime).strftime('%d %b %Y %H:%M')}.",
            cards=[
                {
                    "type": "file",
                    "name": resolved.name,
                    "path": _display(resolved),
                    "size": human_size(stat.st_size),
                }
            ],
        )
    try:
        entries = sorted(
            (item for item in resolved.iterdir() if not item.name.startswith(".")),
            key=lambda item: (item.is_file(), item.name.lower()),
        )
    except OSError as exc:
        return reply(f"I could not read that folder, Sir ({type(exc).__name__}).")

    folders = [entry for entry in entries if entry.is_dir()]
    files = [entry for entry in entries if entry.is_file()]
    rows = []
    for entry in folders[:30]:
        rows.append({"name": entry.name + "/", "kind": "dir", "size": ""})
    for entry in files[:40]:
        try:
            size = human_size(entry.stat().st_size)
        except OSError:
            size = ""
        rows.append({"name": entry.name, "kind": "file", "size": size})

    shown = len(rows)
    total = len(entries)
    folder_word = "folder" if len(folders) == 1 else "folders"
    file_word = "file" if len(files) == 1 else "files"
    return reply(
        f"{_display(resolved)} holds {len(folders)} {folder_word} and {len(files)} {file_word}"
        + (f"; showing {shown}." if shown < total else "."),
        speech=(
            f"{_display(resolved)} contains {len(folders)} {folder_word} and {len(files)} {file_word}, Sir."
        ),
        cards=[
            {
                "type": "files",
                "title": _display(resolved),
                "items": rows,
                "footer": f"{total} entries",
            }
        ],
        data={"path": str(resolved), "folders": len(folders), "files": len(files)},
    )


def find_file(name: str = "", path: str = "~") -> dict:
    name = str(name or "").strip().strip('"').strip("'")
    if not name:
        return reply("What file should I look for, Sir?")
    try:
        root = safe_path(path or "~", base=HOME, must_exist=True)
    except ValueError as exc:
        return reply(f"I cannot search there, Sir — {exc}.")

    needle = name.lower()
    matches: list[Path] = []
    deadline = time.monotonic() + 6.0
    for current_root, dirs, filenames in os.walk(root):
        if time.monotonic() > deadline or len(matches) >= 30:
            break
        dirs[:] = [item for item in dirs if item not in SKIP_DIRS and not item.startswith(".")]
        for filename in filenames:
            if needle in filename.lower():
                matches.append(Path(current_root) / filename)
                if len(matches) >= 30:
                    break

    if not matches:
        return reply(
            f"I found no file matching “{name}” under {_display(root)}, Sir.",
            speech=f"No files matching {name}, Sir.",
        )
    rows = [
        {"name": item.name, "path": _display(item), "dir": _display(item.parent)}
        for item in matches[:12]
    ]
    return reply(
        f"I found {len(matches)} match{'es' if len(matches) != 1 else ''} for “{name}”, Sir.",
        speech=f"I found {len(matches)} matches, Sir.",
        cards=[
            {
                "type": "files",
                "title": f"SEARCH · {name}",
                "items": [{"name": row["name"], "kind": "file", "size": row["dir"]} for row in rows],
                "footer": f"searched {_display(root)}",
            }
        ],
        data={"matches": [str(item) for item in matches[:30]]},
    )


def create_file(path: str = "", content: str = "") -> dict:
    settings = get_settings()
    try:
        resolved = _create_target(path)
    except ValueError as exc:
        return reply(f"I cannot write there, Sir — {exc}.")

    if resolved.exists() and resolved.is_dir():
        return reply("That path is a folder, Sir, not a file.")
    text = str(content or "")
    if len(text) > 200_000:
        return reply("That file is too large for me to write, Sir (200 KB limit).")
    try:
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_text(text, encoding="utf-8")
    except OSError as exc:
        return reply(f"I could not write that file, Sir ({type(exc).__name__}).")
    return reply(
        f"Written to {_display(resolved)} ({human_size(len(text.encode('utf-8'))) }), Sir.",
        speech="File written, Sir.",
        cards=[
            {
                "type": "file",
                "name": resolved.name,
                "path": _display(resolved),
                "size": human_size(len(text.encode("utf-8"))),
            }
        ],
        data={"path": str(resolved), "bytes": len(text.encode("utf-8"))},
    )


def delete_file(path: str = "") -> dict:
    try:
        resolved = _resolve_existing(path)
    except ValueError as exc:
        return reply(f"I will not delete that, Sir — {exc}.")
    if resolved.is_dir():
        return reply("I only delete individual files, Sir. Folders are too risky.")
    if is_within(resolved, DATA_DIR / "files"):
        pass  # user documents are fine
    try:
        resolved.unlink()
    except OSError as exc:
        return reply(f"I could not delete it, Sir ({type(exc).__name__}).")
    return reply(
        f"Deleted {resolved.name}, Sir.",
        speech=f"Deleted {resolved.name}, Sir.",
        data={"path": str(resolved)},
    )


def read_file(path: str = "") -> dict:
    """Read a text file the user points at, refusing obvious secret material."""
    try:
        resolved = _resolve_existing(path)
    except ValueError as exc:
        return reply(f"I cannot read that, Sir — {exc}.")
    if resolved.is_dir():
        return reply(f"That is a folder, Sir. “{resolved.name}” holds files, not text.")
    try:
        relative = resolved.relative_to(HOME)
        parts = relative.parts
    except ValueError:
        parts = resolved.parts
    if any(part.startswith(".") and part not in (".", "..") for part in parts) or SECRET_NAME.search(
        resolved.name
    ):
        return reply(
            "That file looks like it holds credentials, Sir. I will not read secrets aloud — "
            "open it yourself if you need it.",
            speech="That looks like a credentials file, Sir. I will not read it.",
        )
    try:
        size = resolved.stat().st_size
    except OSError as exc:
        return reply(f"I could not inspect that file, Sir ({type(exc).__name__}).")
    if size > MAX_READ:
        return reply(
            f"That file is {human_size(size)}, Sir — too large to read in one breath "
            f"({human_size(MAX_READ)} limit)."
        )
    try:
        raw = resolved.read_bytes()
    except OSError as exc:
        return reply(f"I could not open it, Sir ({type(exc).__name__}).")
    if b"\x00" in raw[:2048]:
        return reply(f"“{resolved.name}” looks binary, Sir, not text.")
    try:
        content = raw.decode("utf-8", errors="replace")
    except Exception:
        return reply("I could not decode that file, Sir.")
    body = content.rstrip("\n")
    if not body.strip():
        return reply(
            f"“{resolved.name}” is empty, Sir.",
            cards=[{"type": "file", "name": resolved.name, "path": _display(resolved), "size": human_size(size)}],
        )
    shown = body if len(body) <= 3000 else body[:3000] + "\n…"
    return reply(
        f"Reading {resolved.name} ({human_size(size)}), Sir.",
        speech=f"Here is {resolved.name}, Sir.",
        cards=[
            {"type": "text", "title": f"FILE · {resolved.name}", "body": shown},
            {"type": "file", "name": resolved.name, "path": _display(resolved), "size": human_size(size)},
        ],
        data={"path": str(resolved), "bytes": size, "content": body[:20_000]},
    )


def import_data(path: str = "") -> dict:
    """Episode 18: expand Jarvis with a big dataset from one file."""
    import json

    from jarvis.store import get_store

    if not str(path or "").strip():
        return reply(
            "Point me at a file, Sir — for example “import data from notes.json”. "
            "JSON objects, lists of key/value pairs, or “key: value” lines all work.",
            speech="Which file should I import, Sir?",
        )
    try:
        resolved = _resolve_existing(path)
    except ValueError as exc:
        return reply(f"I cannot read that dataset, Sir — {exc}.")
    if resolved.is_dir():
        return reply("That is a folder, Sir, not a dataset file.")
    try:
        size = resolved.stat().st_size
    except OSError as exc:
        return reply(f"I could not inspect that file, Sir ({type(exc).__name__}).")
    if size > 2_000_000:
        return reply("That dataset is larger than 2 MB, Sir. Split it and try again.")
    if resolved.suffix.lower() not in {".json", ".txt", ".csv", ".md", ".tsv"}:
        return reply("I can import .json, .txt, .csv, .tsv or .md datasets, Sir.")
    try:
        raw = resolved.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return reply(f"I could not open that file, Sir ({type(exc).__name__}).")

    pairs: list[tuple[str, str]] = []
    if resolved.suffix.lower() == ".json":
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, dict):
            pairs = [(str(key), str(value)) for key, value in payload.items()]
        elif isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict):
                    key = item.get("key") or item.get("question") or item.get("name")
                    value = item.get("value") or item.get("answer") or item.get("text")
                    if key and value:
                        pairs.append((str(key), str(value)))
                elif isinstance(item, str):
                    pairs.append((f"note {len(pairs) + 1}", item))
    else:
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            for separator in ("|", "=>", "=", ":", "\t"):
                if separator in line:
                    key, _, value = line.partition(separator)
                    if key.strip() and value.strip():
                        pairs.append((key.strip(), value.strip()))
                        break

    if not pairs:
        return reply(
            "I could not find any key/value pairs in that file, Sir. "
            "JSON objects or “key: value” lines work best."
        )
    if len(pairs) > 500:
        pairs = pairs[:500]

    store = get_store()
    imported = replaced = skipped = 0
    existing = {str(item.get("key", "")).lower() for item in store.facts(limit=10_000)}
    samples: list[str] = []
    for key, value in pairs:
        key = str(key).strip()[:120]
        value = str(value).strip()[:1000]
        if not key or not value:
            continue
        if store.looks_secret(f"{key} {value}") or SECRET_KEY.search(key) or SECRET_KEY.search(value[:120]):
            skipped += 1
            continue
        if key.lower() in existing:
            replaced += 1
        else:
            imported += 1
            existing.add(key.lower())
        store.remember(key, value)
        if len(samples) < 8:
            samples.append(f"{key} → {truncate(value, 60)}")

    total = len(store.facts(limit=10_000))
    return reply(
        f"Imported {imported + replaced} entries from {resolved.name}, Sir — "
        f"{imported} new, {replaced} updated"
        + (f", {skipped} skipped as credentials" if skipped else "")
        + f". Memory bank now holds {total} facts.",
        speech=f"Imported {imported + replaced} entries, Sir. Memory holds {total} facts.",
        cards=[
            {
                "type": "list",
                "title": f"IMPORTED · {resolved.name}",
                "items": samples,
                "footer": f"{imported} new · {replaced} updated · {skipped} skipped",
            }
        ],
        data={
            "path": str(resolved),
            "imported": imported,
            "updated": replaced,
            "skipped": skipped,
            "total": total,
        },
    )


def _create_target(path: str) -> Path:
    settings = get_settings()
    raw = str(path or "").strip().strip('"').strip("'")
    if not raw:
        raise ValueError("I need a file name")
    if raw.startswith("~") or Path(raw).is_absolute() or "/" in raw:
        return safe_path(raw, base=HOME)
    return safe_path(str(Path(settings.notes_dir) / raw), base=HOME)


def create_preflight(path: str = "") -> dict | None:
    try:
        resolved = _create_target(path)
    except ValueError as exc:
        return reply(f"I cannot write there, Sir — {exc}.")
    if resolved.exists() and resolved.is_dir():
        return reply("That path is a folder, Sir, not a file.")
    return None


def delete_preflight(path: str = "") -> dict | None:
    try:
        resolved = _resolve_existing(path)
    except ValueError as exc:
        return reply(f"I will not delete that, Sir — {exc}.")
    if resolved.is_dir():
        return reply("I only delete individual files, Sir. Folders are too risky.")
    return None
