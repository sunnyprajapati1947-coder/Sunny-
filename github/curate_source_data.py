#!/usr/bin/env python3
"""One-time curation script: parse fetched upstream READMEs and emit Nova data files.

Sources (fetched via the GitHub contents API into /tmp/repos):
- public-apis/public-apis            -> core/data/api_directory.json
- codecrafters-io/build-your-own-x   -> core/data/build_guides.json
- EbookFoundation/free-programming-books -> core/data/book_shelf.json
- VoltAgent/awesome-agent-skills     -> core/data/skill_catalog.json

This script is kept in the repo for provenance and reproducibility only;
Nova never calls the network from it.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SRC = Path("/tmp/repos")
OUT = Path(__file__).resolve().parent.parent / "core" / "data"


def load(name: str) -> str:
    path = SRC / name
    if not path.is_file():
        print(f"missing source file: {path}", file=sys.stderr)
        sys.exit(1)
    return path.read_text(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------- public-apis
def curate_apis() -> dict:
    text = load("apis.md")
    row = re.compile(
        r"^\|\s*\[([^\]]+)\]\((https?://[^)]+)\)\s*\|([^|]+)\|\s*(\S[^|]*?)\s*\|\s*(Yes|No)\s*\|"
    )
    wanted_categories = {
        "Weather", "Finance", "Currency Exchange", "Open Data",
        "Dictionaries", "Science & Math", "News", "Government",
        "Programming", "Development", "Machine Learning", "Data",
        "Geocoding", "Music", "Sports & Fitness", "Transportation",
        "Environment", "Jobs", "Text Analysis", "Calendar", "Health",
    }
    # Names Nova knows how to use well today (used for ranking, not filtering).
    preferred = {
        "open-meteo", "wttr.in", "frankfurter", "exchangerate.host",
        "dictionaryapi.dev", "coinpaprika", "coingecko", "stooq",
        "wikipedia", "open library", "frankfurter.app",
    }

    entries: list[dict] = []
    category = "General"
    in_index = False
    for line in text.splitlines():
        if line.startswith("## "):
            in_index = "Index" in line
            continue
        if line.startswith("### ") and in_index:
            category = line[4:].strip()
        m = row.match(line)
        if not m:
            continue
        name, url, desc, auth, https = m.groups()
        # Strip tracking params the upstream directory adds to some links.
        clean = re.sub(r"[?&]utm_[^&]*", "", url).rstrip("?&")
        if re.match(r"^https?://[^/?#]+$", clean):
            url = clean
        else:
            url = clean
        auth = auth.strip()
        if auth.lower().startswith("no") is False:
            continue
        if https != "Yes":
            continue
        if category not in wanted_categories:
            continue
        desc = desc.strip()
        entries.append({
            "name": name.strip(),
            "url": url,
            "description": desc,
            "category": category,
        })

    # Rank: preferred known-good services first, then keep a bounded set.
    def rank(e: dict) -> tuple:
        low = e["name"].lower()
        pref = any(p in low or p in e["url"].lower() for p in preferred)
        return (0 if pref else 1, e["category"], e["name"].lower())

    entries.sort(key=rank)
    seen: set[str] = set()
    curated: list[dict] = []
    for e in entries:
        key = (e["name"].lower(), e["description"].lower()[:60])
        if key in seen:
            continue
        seen.add(key)
        curated.append(e)
        if len(curated) >= 60:
            break

    return {
        "source": "public-apis/public-apis",
        "source_url": "https://github.com/public-apis/public-apis",
        "license_note": "Curated subset of the public-apis directory; each entry links to its own service.",
        "selection": "No-auth, HTTPS-only entries from assistant-useful categories.",
        "count": len(curated),
        "apis": curated,
    }


# ---------------------------------------------------------- build-your-own-x
def curate_build_guides() -> dict:
    text = load("byox.md")
    heading = re.compile(r"^#### Build your own [`'\" ]+(.+?)[`'\" ]*$")
    link = re.compile(r"^\s*\*\s*\[([^\]]+)\]\((https?://[^)]+)\)")
    topics: list[dict] = []
    current: dict | None = None
    for line in text.splitlines():
        h = heading.match(line)
        if h:
            current = {"topic": h.group(1).strip(), "guides": []}
            topics.append(current)
            continue
        if current is not None:
            m = link.match(line)
            if m:
                title, url = m.groups()
                title = title.strip()
                # Titles look like "**Java / JavaScript**: _Build your own 3D renderer_".
                lang = ""
                lm = re.match(r"^\*\*(.+?)\*\*\s*:\s*(.*)$", title)
                if lm:
                    lang = lm.group(1).strip()
                    title = lm.group(2).strip()
                title = re.sub(r"_+", "", title).strip()
                current["guides"].append({
                    "title": title,
                    "url": url,
                    "language": lang,
                })
    for t in topics:
        t["guides"] = t["guides"][:10]
    return {
        "source": "codecrafters-io/build-your-own-x",
        "source_url": "https://github.com/codecrafters-io/build-your-own-x",
        "license_note": "Curated link index; guides live on their own sites.",
        "count": len(topics),
        "topics": topics,
    }


# ---------------------------------------------------- free-programming-books
def curate_book_shelf() -> dict:
    wanted = {
        "Python", "JavaScript", "Java", "C", "C++", "Go", "Rust",
        "TypeScript", "Dart", "Kotlin", "Ruby", "PHP",
        "Bash", "SQL", "Android", "Flutter", "HTML and CSS",
        "Algorithms & Data Structures", "Artificial Intelligence",
        "Machine Learning", "Computer Science", "Computer Vision",
        "Data Science", "Database", "Networking", "Operating Systems",
        "Security & Privacy", "Professional Development", "Programming",
        "Mathematics", "Game Development", "Cloud Computing",
        "Version Control Systems", "Professional Development",
    }
    subjects: list[dict] = []
    seen_subjects: set[str] = set()

    def parse(text: str) -> None:
        subject_re = re.compile(r"^### (.+?)\s*$")
        book_re = re.compile(r"^\s*\*\s*\[([^\]]+)\]\((https?://[^)]+)\)(.*)$")
        current: dict | None = None
        for line in text.splitlines():
            s = subject_re.match(line)
            if s:
                name = s.group(1).strip()
                name = re.sub(r"<[^>]+>", "", name).replace("\\", "").strip()
                current = None
                if name in wanted and name not in seen_subjects:
                    current = {"subject": name, "books": []}
                    subjects.append(current)
                    seen_subjects.add(name)
                continue
            if current is not None and len(current["books"]) < 8:
                m = book_re.match(line)
                if m:
                    title, url, rest = m.groups()
                    fmt = ""
                    fm = re.search(r"\(([^)]+)\)", rest)
                    if fm:
                        fmt = fm.group(1)
                    current["books"].append({
                        "title": title.strip(),
                        "url": url,
                        "format": fmt,
                    })

    parse(load("fpb_langs.md"))
    parse(load("fpb_subjects.md"))
    subjects.sort(key=lambda s: s["subject"])
    total = sum(len(s["books"]) for s in subjects)
    return {
        "source": "EbookFoundation/free-programming-books",
        "source_url": "https://github.com/EbookFoundation/free-programming-books",
        "license_note": "Curated link index; books are hosted by their own authors/publishers.",
        "count": total,
        "subjects": subjects,
    }


# ---------------------------------------------------- awesome-agent-skills
def curate_skill_catalog() -> dict:
    text = load("vas.md")
    entry = re.compile(r"^\s*-\s*\*\*\[([^\]]+)\]\((https?://[^)]+)\)\*\*\s*-\s*(.+)$")
    heading = re.compile(r"^### (.+?)\s*$")
    skills: list[dict] = []
    section = ""
    for line in text.splitlines():
        h = heading.match(line)
        if h:
            section = h.group(1).strip()
            continue
        m = entry.match(line)
        if m:
            name, url, desc = m.groups()
            skills.append({
                "name": name.strip(),
                "url": url,
                "description": desc.strip(),
                "section": section,
            })

    # Keep a balanced subset per section.
    per_section_cap = 25
    counts: dict[str, int] = {}
    curated: list[dict] = []
    for s in skills:
        sec = s["section"]
        if counts.get(sec, 0) >= per_section_cap:
            continue
        counts[sec] = counts.get(sec, 0) + 1
        curated.append(s)

    return {
        "source": "VoltAgent/awesome-agent-skills",
        "source_url": "https://github.com/VoltAgent/awesome-agent-skills",
        "license_note": "Curated link index of community skill packs; each skill lives in its own repo.",
        "count": len(curated),
        "skills": curated,
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    datasets = {
        "api_directory.json": curate_apis,
        "build_guides.json": curate_build_guides,
        "book_shelf.json": curate_book_shelf,
        "skill_catalog.json": curate_skill_catalog,
    }
    for name, fn in datasets.items():
        data = fn()
        path = OUT / name
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{path}: {data['count']} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
