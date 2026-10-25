#!/usr/bin/env python3
"""Build the Jarvis Pocket knowledge pack from local checkouts.

Reads a directory of git clones, curates the markdown that is actually useful
(skills, agents, commands, rules, prompts, workflows, guides), de-duplicates it
by content, and emits:

    data/packs.json     repository metadata
    data/manifest.json  searchable index + chunk map + curated collections
    data/chunks/*.json  full markdown bodies, ~110 KB per chunk

No network access, no third-party dependencies. Deterministic for a given set
of checkouts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

# --------------------------------------------------------------------------
# curation limits
# --------------------------------------------------------------------------

MAX_ITEMS = 2400
MAX_ITEMS_TOTAL_BYTES = 15 * 1024 * 1024
MAX_BODY_CHARS = 26000
CHUNK_BYTES = 260_000

TYPE_CAPS = {
    "skill": 220,
    "agent": 70,
    "command": 60,
    "rule": 30,
    "prompt": 30,
    "workflow": 14,
    "doc": 12,
}
GLOBAL_TYPE_CAPS = {
    "skill": 1200,
    "agent": 560,
    "command": 260,
    "rule": 120,
    "prompt": 120,
    "workflow": 80,
    "doc": 260,
}

TYPES = ["skill", "agent", "command", "rule", "prompt", "workflow", "doc"]
TYPE_LABEL = {
    "skill": "Skills",
    "agent": "Agents",
    "command": "Commands",
    "rule": "Rules",
    "prompt": "Prompts",
    "workflow": "Workflows",
    "doc": "Guides",
}
TYPE_SCORE = {
    "skill": 100,
    "agent": 72,
    "command": 70,
    "rule": 52,
    "prompt": 56,
    "workflow": 46,
    "doc": 10,
}

SKIP_DIRS = {
    ".git", ".github", ".gitlab", "node_modules", "dist", "build", "out", "vendor",
    "third_party", "third-party", "site-packages", ".venv", "venv", "coverage",
    ".next", ".turbo", ".nuxt", ".svelte-kit", "testdata", "__snapshots__",
    "fixtures", "snapshots", "changelog.d", ".changeset", ".changesets",
    "translations", "i18n", "locales", "locale", "node_modules.nosync",
    ".husky", ".idea", ".vscode", "assets", "images", "img", "media", "public",
    "__pycache__", "target", "Pods", "vendor_bundle",
}

SKIP_FILES = {
    "license", "license.md", "license.txt", "licence", "changelog", "changelog.md",
    "changes.md", "history.md", "contributing", "contributing.md", "code_of_conduct",
    "code_of_conduct.md", "code-of-conduct.md", "security", "security.md",
    "support.md", "support", "citation.cff", "authors", "authors.md",
    "notice", "notice.md", "funding.yml", "governance.md", "maintainers.md",
    "releasing.md", "release.md", "pull_request_template.md",
    "issue_template.md", "codeowners", "readme-template.md",
    "contributors.md", "roadmap.md", "migration.md", "upgrading.md",
    "versions.md", "receipt-join.md", "agents.md", "claude.md", "gemini.md",
    "qwen.md", "conventions.md", "installation.md", "local_setup.md",
    "disclaimer.md", "third_party_notices.md", "review.md",
}

# dirs whose markdown is almost always documentation of the docs site itself
DOC_NOISE_DIRS = {"docs-site", "website", "site", "docs/_build", "blog"}

STOPWORDS = set(
    """a an and are as at be been but by can could did do does for from had has have
    how i if in into is it its just like make may me more most must my no not of on
    or our out over own same should so some such than that the their them then there
    these they this those to too up us use used using very was we were what when where
    which while who why will with within without you your yours also any all about
    """.split()
)

WORD_RE = re.compile(r"[a-z0-9][a-z0-9+.#-]{1,28}")
HEADING_RE = re.compile(r"^#{1,3}\s+(.+)$", re.MULTILINE)
FM_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\s*(?:\r?\n|\Z)", re.DOTALL)


def slugify(text: str, fallback: str = "item") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return (slug or fallback)[:56]


def key_tokens(text: str) -> list[str]:
    seen: list[str] = []
    for match in WORD_RE.finditer(text.lower()):
        word = match.group(0).strip("-+.#")
        if len(word) < 3 or word in STOPWORDS or word.isdigit():
            continue
        if word not in seen:
            seen.append(word)
    return seen


def humanize(name: str) -> str:
    name = re.sub(r"\.(md|markdown|mdx)$", "", name, flags=re.I)
    name = name.replace("_", " ").replace("-", " ")
    name = re.sub(r"\s+", " ", name).strip()
    if not name:
        return "Untitled"
    if name.islower() or name.isupper():
        name = name.title()
    # keep known acronyms readable
    name = re.sub(r"\bAi\b", "AI", name)
    name = re.sub(r"\bApi\b", "API", name)
    name = re.sub(r"\bCli\b", "CLI", name)
    name = re.sub(r"\bLlm\b", "LLM", name)
    name = re.sub(r"\bMcp\b", "MCP", name)
    name = re.sub(r"\bUi\b", "UI", name)
    name = re.sub(r"\bPr\b", "PR", name)
    return name[:90]


def clean_text(value: str) -> str:
    value = value.strip().strip("\"'").strip()
    value = re.sub(r"\s+", " ", value)
    return value


def parse_frontmatter(text: str) -> tuple[dict, str]:
    match = FM_RE.match(text)
    if not match:
        return {}, text
    raw = match.group(1)
    if len(raw.splitlines()) > 80:  # not frontmatter, probably a rule
        return {}, text
    meta: dict = {}
    key = None
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s*-\s+(.*)$", line)
        if item and key:
            meta.setdefault(key, [])
            if isinstance(meta[key], list):
                meta[key].append(clean_text(item.group(1)))
            continue
        pair = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*(.*)$", line)
        if not pair:
            continue
        key = pair.group(1).strip().lower()
        value = pair.group(2).strip()
        if value.startswith("[") and value.endswith("]"):
            meta[key] = [clean_text(part) for part in value[1:-1].split(",") if part.strip()]
        elif value in ("|", ">", "|-", ">-", ""):
            meta[key] = ""
        else:
            meta[key] = clean_text(value)
    body = text[match.end():]
    return meta, body


def first_heading(body: str) -> tuple[str, str]:
    lines = body.splitlines()
    for index, line in enumerate(lines):
        match = re.match(r"^#\s+(.+?)\s*#*\s*$", line)
        if match:
            return clean_text(match.group(1)), "\n".join(lines[index + 1:])
    return "", body


def first_paragraph(body: str) -> str:
    buffer: list[str] = []
    fenced = False
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            fenced = not fenced
            continue
        if fenced:
            continue
        if not stripped:
            if buffer:
                break
            continue
        if stripped.startswith(("#", "|", ">", "-", "*", "!", "<", "[")):
            if buffer:
                break
            continue
        buffer.append(stripped)
    text = clean_text(" ".join(buffer))
    text = re.sub(r"[*_`]+", "", text)
    return text


def shorten(text: str, limit: int) -> str:
    text = clean_text(text)
    if len(text) <= limit:
        return text
    cut = text[:limit]
    if " " in cut[limit // 2:]:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,;:-") + "…"


def detect_type(rel_path: str, filename: str, body: str) -> str:
    parts = [part.lower() for part in rel_path.split("/")[:-1]]
    name = filename.lower()
    joined = "/".join(parts)
    if name in ("skill.md", "skills.md") or "skills" in parts or "skill" in parts:
        return "skill"
    if "subagents" in parts or "agents" in parts or "agent" in parts or name.endswith(".agent.md"):
        return "agent"
    if "commands" in parts or "command" in parts or "slash-commands" in joined:
        return "command"
    if "rules" in parts or "rule" in parts:
        return "rule"
    if "prompts" in parts or "prompt" in parts:
        return "prompt"
    if "workflows" in parts or "workflow" in parts or "hooks" in parts:
        return "workflow"
    if name in ("readme.md",):
        return "doc"
    head = body[:400].lower()
    if "you are " in head and ("agent" in head or "assistant" in head):
        return "agent"
    return "doc"


def title_for(rel_path: str, filename: str, meta: dict, body: str) -> str:
    for key in ("name", "title", "display_name"):
        value = meta.get(key)
        if isinstance(value, str) and value.strip() and len(value) <= 80:
            return humanize(clean_text(value))
    heading, _ = first_heading(body)
    if heading:
        return humanize(heading)[:90]
    if filename.lower() in ("skill.md", "readme.md", "index.md"):
        parent = rel_path.split("/")[-2] if "/" in rel_path else filename
        return humanize(parent)
    return humanize(filename)


def description_for(meta: dict, body: str, title: str) -> str:
    for key in ("description", "summary", "when_to_use", "short_description", "about"):
        value = meta.get(key)
        if isinstance(value, str) and len(value) > 12:
            text = clean_text(re.sub(r"[*_`#>]+", " ", value))
            if len(text) > 12:
                return shorten(text, 138)
    paragraph = first_paragraph(body)
    if len(paragraph) > 12 and paragraph.lower() != title.lower():
        return shorten(paragraph, 138)
    return ""


def tags_for(meta: dict, rel_path: str, pack_topics: list[str]) -> list[str]:
    tags: list[str] = []
    raw = meta.get("tags")
    if isinstance(raw, list):
        for item in raw:
            item = clean_text(item).lower()
            if item and item not in tags:
                tags.append(item)
    elif isinstance(raw, str):
        for item in re.split(r"[,\s]+", raw):
            item = clean_text(item).lower()
            if item and item not in tags:
                tags.append(item)
    for part in rel_path.split("/")[:-1][:3]:
        part = part.lower()
        if part and part not in tags and part not in ("src", "content", "packages", "lib"):
            tags.append(part)
    for topic in pack_topics[:3]:
        topic = topic.lower()
        if topic and topic not in tags:
            tags.append(topic)
    return [slugify(tag, "") for tag in tags if slugify(tag, "")][:4]


def keywords_for(title: str, desc: str, tags: list[str], body: str, limit: int = 8) -> str:
    headings = " ".join(HEADING_RE.findall(body)[:16])
    raw = " ".join([title, title, desc, " ".join(tags), headings, body[:1200]])
    words = key_tokens(raw)
    picked: list[str] = []
    for word in words:
        if word in picked:
            continue
        if len(word) < 4 and word not in ("ai", "ml", "ui", "ux", "api", "cli", "db"):
            continue
        picked.append(word)
        if len(picked) >= limit:
            break
    return " ".join(picked)


def normalize_body(body: str) -> str:
    body = body.replace("\r\n", "\n").replace("\r", "\n")
    body = re.sub(r"\n{3,}", "\n\n", body)
    body = re.sub(r"[ \t]+\n", "\n", body)
    return body.strip()


def walk_repo(root: str, skip_paths: set[str]) -> list[dict]:
    found: list[dict] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames
            if d not in SKIP_DIRS and not d.startswith(".") and d.lower() not in SKIP_DIRS
        ]
        rel_dir = os.path.relpath(dirpath, root).replace(os.sep, "/")
        if rel_dir == ".":
            rel_dir = ""
        if any(noise in rel_dir.lower() for noise in DOC_NOISE_DIRS):
            continue
        for filename in filenames:
            if not filename.lower().endswith((".md", ".markdown")):
                continue
            if filename.lower() in SKIP_FILES:
                continue
            rel_path = f"{rel_dir}/{filename}" if rel_dir else filename
            if rel_path in skip_paths:
                continue
            absolute = os.path.join(dirpath, filename)
            try:
                size = os.path.getsize(absolute)
            except OSError:
                continue
            if size < 220 or size > 400_000:
                continue
            found.append({"path": rel_path, "abs": absolute, "size": size})
    return found


def score_item(item: dict, meta: dict, body: str, rel_path: str) -> int:
    score = TYPE_SCORE[item["type"]]
    if meta.get("description") or meta.get("summary"):
        score += 24
    depth = rel_path.count("/")
    score -= depth * 4
    if 1200 <= len(body) <= 24000:
        score += 10
    elif len(body) < 700:
        score -= 12
    if item["type"] == "doc":
        if rel_path.count("/") <= 1:
            score += 30
        if "/docs/" in rel_path and depth > 3:
            score -= 20
        if re.search(r"(readme|overview|quickstart|getting-started|architecture|guide)", rel_path, re.I):
            score += 18
    if item["type"] in ("skill", "agent") and re.search(r"(skill\.md|/agents?/|/$)", rel_path, re.I):
        score += 8
    return score


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repos", required=True, help="directory containing one clone per repository")
    parser.add_argument("--meta", required=True, help="meta.jsonl produced from the GitHub API")
    parser.add_argument("--out", required=True, help="output data directory")
    parser.add_argument("--order", default="", help="comma separated pack order (repo names)")
    args = parser.parse_args()

    out_dir = os.path.abspath(args.out)
    chunks_dir = os.path.join(out_dir, "chunks")
    os.makedirs(chunks_dir, exist_ok=True)
    for name in os.listdir(chunks_dir):
        if name.endswith(".json"):
            os.remove(os.path.join(chunks_dir, name))

    meta_by_repo: dict[str, dict] = {}
    for line in open(args.meta, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        meta_by_repo[row["repo"].lower()] = row

    repos: list[str] = []
    for name in sorted(os.listdir(args.repos)):
        if os.path.isdir(os.path.join(args.repos, name, ".git")):
            repos.append(name)

    order = [part.strip() for part in args.order.split(",") if part.strip()]
    repos.sort(key=lambda name: (order.index(name) if name in order else 999, name.lower()))

    candidates: list[dict] = []
    packs: list[dict] = []
    seen_hashes: dict[str, int] = {}
    skipped_dedup = 0

    for index, repo_name in enumerate(repos):
        root = os.path.join(args.repos, repo_name)
        full_name = None
        try:
            from subprocess import check_output
            remote = check_output(["git", "-C", root, "remote", "get-url", "origin"], text=True).strip()
            full_name = re.sub(r"^https://github\.com/|\.git$", "", remote)
        except Exception:
            full_name = repo_name
        info = meta_by_repo.get((full_name or "").lower(), {})
        try:
            from subprocess import check_output
            sha = check_output(["git", "-C", root, "rev-parse", "HEAD"], text=True).strip()
        except Exception:
            sha = ""
        topics = [str(topic) for topic in info.get("topics", [])][:6]
        pack_id = slugify(repo_name.replace("_", "-"), "pack")
        pack = {
            "id": pack_id,
            "name": info.get("name") or repo_name,
            "repo": full_name or repo_name,
            "url": f"https://github.com/{full_name}" if full_name else "",
            "desc": shorten(info.get("desc") or "", 160),
            "stars": int(info.get("stars") or 0),
            "license": info.get("license") or "",
            "lang": info.get("lang") or "",
            "sha": sha[:12],
            "topics": topics,
            "count": 0,
        }
        packs.append(pack)
        pack_index = len(packs) - 1

        for file in walk_repo(root, set()):
            try:
                raw = open(file["abs"], encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            meta, body = parse_frontmatter(raw)
            body = normalize_body(body)
            if len(body) < 180:
                continue
            lowered = file["path"].lower()
            if any(noise in lowered for noise in DOC_NOISE_DIRS):
                continue
            kind = detect_type(file["path"], os.path.basename(file["path"]), body)
            title = title_for(file["path"], os.path.basename(file["path"]), meta, body)
            if not title or len(title) < 3:
                continue
            digest = hashlib.sha1(
                re.sub(r"\s+", " ", body[:6000]).strip().lower().encode("utf-8")
            ).hexdigest()
            if digest in seen_hashes:
                skipped_dedup += 1
                continue
            seen_hashes[digest] = pack_index
            candidate = {
                "pack": pack_index,
                "path": file["path"],
                "type": kind,
                "title": title,
                "body": body,
                "meta": meta,
                "score": 0,
            }
            candidate["score"] = score_item(candidate, meta, body, file["path"])
            candidates.append(candidate)

    # per-repo / per-type caps
    per_repo_type: dict[tuple[int, str], int] = {}
    kept: list[dict] = []
    candidates.sort(key=lambda item: (-item["score"], item["pack"], item["path"]))
    for item in candidates:
        key = (item["pack"], item["type"])
        used = per_repo_type.get(key, 0)
        if used >= TYPE_CAPS[item["type"]]:
            continue
        per_repo_type[key] = used + 1
        kept.append(item)

    # global caps
    kept.sort(key=lambda item: -item["score"])
    final: list[dict] = []
    per_type: dict[str, int] = {}
    total_bytes = 0
    for item in kept:
        if len(final) >= MAX_ITEMS:
            break
        if per_type.get(item["type"], 0) >= GLOBAL_TYPE_CAPS[item["type"]]:
            continue
        body = item["body"]
        if len(body) > MAX_BODY_CHARS:
            body = body[:MAX_BODY_CHARS]
            body = body[: body.rfind("\n")] if "\n" in body[-200:] else body
            item["truncated"] = True
        item["body"] = body
        if total_bytes + len(body) > MAX_ITEMS_TOTAL_BYTES:
            continue
        total_bytes += len(body)
        per_type[item["type"]] = per_type.get(item["type"], 0) + 1
        final.append(item)

    # order for display + chunk packing
    final.sort(key=lambda item: (item["pack"], TYPES.index(item["type"]), item["title"].lower()))

    ids: set[str] = set()
    entries: list[dict] = []
    chunk_payloads: list[dict] = []
    chunk_meta: list[dict] = []
    current: dict[str, dict] = {}
    current_size = 0
    current_pack = None
    current_type = None
    chunk_index = 0

    def flush() -> None:
        nonlocal current, current_size, chunk_index, current_pack, current_type
        if not current:
            return
        name = f"chunks/c{chunk_index:03d}.json"
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as handle:
            json.dump(
                {"p": current_pack, "y": current_type, "items": current},
                handle,
                ensure_ascii=False,
                separators=(",", ":"),
            )
        chunk_meta.append({"f": name, "p": current_pack, "y": current_type, "n": len(current)})
        chunk_payloads.append(current)
        chunk_index += 1
        current = {}
        current_size = 0

    for item in final:
        pack = packs[item["pack"]]
        base = slugify(item["path"].rsplit(".", 1)[0], "item")
        candidate_id = f"{pack['id']}-{base}"
        counter = 2
        while candidate_id in ids:
            candidate_id = f"{pack['id']}-{base}-{counter}"
            counter += 1
        ids.add(candidate_id)
        if item["pack"] != current_pack or current_size > CHUNK_BYTES:
            flush()
            current_pack = item["pack"]
            current_type = item["type"]
        body = item["body"]
        desc = description_for(item["meta"], body, item["title"]) or shorten(item["title"], 120)
        tags = tags_for(item["meta"], item["path"], pack["topics"])
        keywords = keywords_for(item["title"], desc, tags, body)
        entry = {
            "i": candidate_id,
            "t": item["title"],
            "d": desc,
            "y": TYPES.index(item["type"]),
            "p": item["pack"],
            "g": tags,
            "k": keywords,
            "f": item["path"],
            "c": chunk_index,
        }
        entries.append(entry)
        current[candidate_id] = {"m": body}
        if item.get("truncated"):
            current[candidate_id]["x"] = 1
        current_size += len(body) + len(candidate_id) + 12
        pack["count"] += 1

    flush()

    # curated collections: score items against intent keywords
    collection_specs = [
        ("jarvis", "Build your Jarvis", "Voice, memory, agents and orchestration — the pieces that make an assistant feel alive.",
         ["jarvis", "voice", "assistant", "memory", "orchestration", "agent", "chat", "llm"]),
        ("coding", "Ship code faster", "Planning, review, testing and debugging skills for real engineering work.",
         ["code", "coding", "review", "testing", "debug", "refactor", "implementation", "bug"]),
        ("agents", "Agent engineering", "Subagents, harnesses, loops, tools and context budgets.",
         ["agent", "subagent", "orchestration", "harness", "tool", "workflow", "context"]),
        ("research", "Research & science", "Deep research, papers, notebooks, scientific analysis and citation discipline.",
         ["research", "paper", "science", "scientific", "analysis", "notebook", "citation", "literature"]),
        ("memory", "Memory & context", "Persistent context, session notes, recall and file-based planning.",
         ["memory", "context", "session", "recall", "planning", "notes", "persist"]),
        ("trading", "Trading & finance", "Multi-agent market analysis, research desks and risk framing.",
         ["trading", "market", "finance", "stock", "risk", "portfolio", "financial"]),
        ("marketing", "Marketing & growth", "CRO, copywriting, SEO, launch and lifecycle campaigns.",
         ["marketing", "cro", "copywriting", "seo", "growth", "campaign", "conversion", "landing"]),
        ("media", "Video & content", "YouTube workflows, scripting, thumbnails and repurposing.",
         ["youtube", "video", "script", "thumbnail", "content", "publish", "shorts"]),
        ("skills", "Build your own skills", "Skill authoring, discovery, packaging and marketplaces.",
         ["skill", "skills", "authoring", "marketplace", "plugin", "package"]),
    ]
    collections = []
    for slug, title, blurb, terms in collection_specs:
        scored = []
        for entry in entries:
            haystack = f"{entry['t']} {entry['d']} {entry['k']} {' '.join(entry['g'])}".lower()
            score = sum(3 if term in entry["t"].lower() else 1 for term in terms if term in haystack)
            if score >= 4:
                scored.append((score, entry["i"]))
        scored.sort(key=lambda pair: (-pair[0], pair[1]))
        picks = [item_id for _, item_id in scored[:12]]
        if len(picks) >= 4:
            collections.append({"id": slug, "title": title, "blurb": blurb, "items": picks})

    manifest = {
        "version": "jarvis-1",
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "packs": packs,
        "types": TYPE_LABEL,
        "items": entries,
        "chunks": chunk_meta,
        "collections": collections,
        "stats": {
            "items": len(entries),
            "packs": len(packs),
            "bytes": total_bytes,
            "byType": {TYPES[i]: count for i, count in enumerate(per_type.get(t, 0) for t in TYPES)},
        },
    }

    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(out_dir, "packs.json"), "w", encoding="utf-8") as handle:
        json.dump({"packs": packs, "built": manifest["built"]}, handle, ensure_ascii=False, separators=(",", ":"))

    manifest_size = os.path.getsize(os.path.join(out_dir, "manifest.json"))
    chunk_size = sum(os.path.getsize(os.path.join(out_dir, meta["f"])) for meta in chunk_meta)
    print(f"packs        {len(packs)}")
    print(f"items        {len(entries)}  (dedup dropped {skipped_dedup})")
    print(f"by type      { {TYPES[i]: per_type.get(t, 0) for i, t in enumerate(TYPES)} }")
    print(f"bodies       {total_bytes / 1048576:.2f} MB in {len(chunk_meta)} chunks")
    print(f"manifest     {manifest_size / 1024:.0f} KB")
    print(f"chunks       {chunk_size / 1048576:.2f} MB")
    print(f"collections  {len(collections)}")
    for pack in packs:
        print(f"  {pack['id']:<16} {pack['count']:>4} items  {pack['license'][:12]:<12} {pack['name']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
