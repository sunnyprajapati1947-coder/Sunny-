"""Nova learning hub — offline search over curated learning resources.

Inspired by two curated repositories:
- codecrafters-io/build-your-own-x: step-by-step guides to rebuild favourite
  technologies from scratch ("What I cannot create, I do not understand").
- EbookFoundation/free-programming-books: freely available programming books.

Nova ships a curated, offline copy of both indexes (core/data/*.json) so the
assistant can answer "how do I build X?" and "recommend a book for Y?"
without network access. Links point to the original free resources.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data"


def _load(name: str) -> dict[str, Any]:
    path = DATA_DIR / name
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9+#]+", str(text or "").lower()) if len(w) > 1}


# ------------------------------------------------------------------ tools ---

def learning_find_build_guide(topic: str) -> dict[str, Any]:
    """Find step-by-step 'build your own X' guides for a technology."""
    data = _load("build_guides.json")
    topics = data.get("topics", [])
    if not topics:
        return {"success": False, "error": "Build guide index is missing."}
    wanted = _words(topic)
    if not wanted:
        return {"success": False, "error": "Name a technology, e.g. 'database'."}

    scored = []
    for entry in topics:
        name_words = _words(entry.get("topic", ""))
        score = len(wanted & name_words) / max(1, len(wanted))
        # Also search inside guide titles for partial matches.
        title_hits = sum(
            1 for g in entry.get("guides", [])
            if wanted & _words(g.get("title", ""))
        )
        total = score + 0.1 * title_hits
        if total > 0:
            scored.append((total, entry))
    scored.sort(key=lambda pair: -pair[0])
    results = [entry for _, entry in scored[:5]]

    if not results:
        return {
            "success": False,
            "error": f"No build guide found for '{topic}'.",
            "available_topics": [t["topic"] for t in topics][:40],
        }
    return {
        "success": True,
        "source": data.get("source"),
        "query": topic,
        "matches": [
            {
                "topic": entry.get("topic"),
                "guides": entry.get("guides", [])[:6],
            }
            for entry in results
        ],
    }


def learning_find_books(subject: str) -> dict[str, Any]:
    """Find free programming books for a subject."""
    data = _load("book_shelf.json")
    subjects = data.get("subjects", [])
    if not subjects:
        return {"success": False, "error": "Book shelf index is missing."}
    wanted = _words(subject)
    if not wanted:
        return {"success": False, "error": "Name a subject, e.g. 'python'."}

    scored = []
    for entry in subjects:
        score = len(wanted & _words(entry.get("subject", ""))) / max(1, len(wanted))
        if score > 0:
            scored.append((score, entry))
    scored.sort(key=lambda pair: -pair[0])
    best = scored[:3] if scored else []

    if not best:
        return {
            "success": False,
            "error": f"No books found for '{subject}'.",
            "available_subjects": [s["subject"] for s in subjects],
        }
    return {
        "success": True,
        "source": data.get("source"),
        "query": subject,
        "matches": [
            {"subject": entry.get("subject"), "books": entry.get("books", [])[:6]}
            for _, entry in best
        ],
    }


def learning_available_topics() -> dict[str, Any]:
    """List what the learning hub knows about."""
    guides = _load("build_guides.json")
    books = _load("book_shelf.json")
    return {
        "success": True,
        "build_guide_topics": [t.get("topic") for t in guides.get("topics", [])],
        "book_subjects": [s.get("subject") for s in books.get("subjects", [])],
    }
