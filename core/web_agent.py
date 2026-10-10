"""Nova web agent — goal-driven web tasks with an element table.

Inspired by browser-use/jev-ultrafast: a browser agent with a dynamic,
indexed action space. Every observation produces a numbered element table and
the agent answers with one operation (CLICK / TYPE_TEXT / SELECT / SCROLL /
WAIT / DONE / BLOCKED) plus a target index — two decisions, one round trip.

Nova adapts the loop to a text-only, dependency-free web agent that works on
Android/Termux where no browser driver exists:

    observation -> [1] link  title · url
                   [2] link  title · url
    policy      -> CLICK [2]  /  TYPE_TEXT "query"  /  DONE  /  BLOCKED

The policy is deterministic and local (goal-keyword scoring over the element
table), so it costs zero model calls — the "ultrafast" property. The loop is
bounded, uses only Nova's existing validated web tools, and never logs in,
never types credentials, and never submits forms.
"""
from __future__ import annotations

import os
import re
from typing import Any

MAX_STEPS = 5
MAX_LINKS_PER_PAGE = 40
MAX_FINDING_CHARS = 700

try:  # Nova's existing validated web tools (search + readable fetch).
    from github.local_ai_agent.tools.web import fetch_page, search
except Exception:  # pragma: no cover - fallback keeps the agent importable
    fetch_page = None
    search = None


def _words(text: str) -> set[str]:
    return {
        w for w in re.findall(r"[a-z0-9\u0900-\u097F]+", str(text or "").lower())
        if len(w) > 1
    }


def _extract_links(page_text: str) -> list[tuple[str, str]]:
    """Extract (label, url) pairs from fetched page text.

    Nova's web tool returns readable text; markdown-ish links survive as
    'label (url)' or bare 'http(s)://...'. Links are deduplicated in order.
    """
    links: list[tuple[str, str]] = []
    seen: set[str] = set()
    for m in re.finditer(r"(?:\[([^\]]{2,120})\]\(|\b)(https?://[^\s)>\]]{6,200})", page_text):
        label = (m.group(1) or "").strip()
        url = m.group(2).rstrip(".,;")
        if url in seen:
            continue
        seen.add(url)
        if not label:
            label = url.split("//", 1)[-1].split("/", 1)[0]
        links.append((label or url, url))
        if len(links) >= MAX_LINKS_PER_PAGE:
            break
    return links


def _element_table(links: list[tuple[str, str]]) -> list[str]:
    """Render the jev-style indexed element table."""
    return [f"[{i + 1}] link  {label} · {url}" for i, (label, url) in enumerate(links)]


def _score(label: str, url: str, goal_words: set[str]) -> float:
    text_words = _words(f"{label} {url}")
    if not goal_words:
        return 0.0
    return len(goal_words & text_words) / len(goal_words)


def _findings_for(page_text: str, goal_words: set[str]) -> list[str]:
    """Pull the sentences of a page that carry goal keywords."""
    findings: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", page_text):
        sentence = sentence.strip()
        if not (20 <= len(sentence) <= MAX_FINDING_CHARS):
            continue
        if goal_words & _words(sentence):
            findings.append(sentence)
        if len(findings) >= 5:
            break
    return findings


def web_agent_run(goal: str, query: str = "", start_url: str = "", max_steps: int = MAX_STEPS) -> dict[str, Any]:
    """Run a bounded goal-driven web task.

    - ``goal``    what the user wants to know (required)
    - ``query``   optional search query; when given the agent TYPE_TEXTs it
    - ``start_url`` optional page to GOTO first instead of searching

    Returns an operation trace (jev-style), findings, and sources.
    """
    if not enabled():
        return {"success": False, "error": "Web agent is disabled."}
    if search is None or fetch_page is None:
        return {"success": False, "error": "Nova web tools are unavailable."}
    goal = str(goal or "").strip()
    if not goal:
        return {"success": False, "error": "A goal is required."}
    max_steps = max(1, min(int(max_steps), MAX_STEPS))
    goal_words = _words(goal)

    operations: list[str] = []
    findings: list[str] = []
    sources: list[str] = []
    visited: set[str] = set()

    def _fetch(url: str) -> str:
        try:
            return fetch_page(url, timeout_seconds=10.0)
        except Exception:
            return ""

    # --- Step 0: seed the element table (GOTO or TYPE_TEXT). ----------------
    pages: list[tuple[str, str]] = []  # (label, url)
    if start_url:
        if not re.match(r"^https?://", start_url):
            return {"success": False, "error": "start_url must be http(s)."}
        pages = [("start", start_url)]
        operations.append(f"GOTO {start_url}")
    else:
        q = (query or goal).strip()
        try:
            results = search(q, max_results=8, timeout_seconds=10.0)
        except Exception:
            results = []
        if not results:
            return {"success": False, "error": "No search results; the web lane may be offline."}
        pages = [(getattr(r, "title", str(i)), getattr(r, "url", "")) for i, r in enumerate(results)]
        operations.append(f"TYPE_TEXT \"{q}\"")

    # --- Bounded goal-driven loop. ------------------------------------------
    for _step in range(max_steps):
        if not pages:
            operations.append("BLOCKED no elements left")
            break

        # Observe: score every element in the table against the goal.
        table: list[str] = []
        best_idx, best_score = -1, 0.0
        for i, (label, url) in enumerate(pages):
            table.append(f"[{i + 1}] link  {label} · {url}")
            score = _score(label, url, goal_words)
            if score > best_score and url not in visited:
                best_idx, best_score = i, score

        if best_idx < 0 or best_score <= 0.0:
            operations.append("BLOCKED no element matched the goal")
            break

        label, url = pages[best_idx]
        operations.append(f"CLICK [{best_idx + 1}] {label} · {url}")
        visited.add(url)
        sources.append(url)

        page_text = _fetch(url)
        if page_text:
            found = _findings_for(page_text, goal_words)
            findings.extend(f for f in found if f not in findings)
            # New element table from this page.
            pages = _extract_links(page_text)

        if len(findings) >= 5:
            operations.append("DONE goal evidence collected")
            break
    else:
        operations.append("DONE step budget reached")

    if not findings:
        return {
            "success": False,
            "error": "Could not collect goal evidence within the step budget.",
            "goal": goal,
            "operations": operations,
            "sources": sources,
        }

    return {
        "success": True,
        "goal": goal,
        "operations": operations,
        "findings": findings[:6],
        "sources": sources[:6],
    }


def enabled() -> bool:
    return os.getenv("NOVA_WEB_AGENT_ENABLED", "true").lower() == "true"
