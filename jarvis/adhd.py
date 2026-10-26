"""ADHD-friendly output shaping.

Borrowed from ayghri/i-have-adhd: lead with the next action, number the steps,
keep it short, and finish with one concrete two-minute move. The helper is
conservative — it only reformats model prose, never deterministic tool output
(those are already short and carry cards).
"""
from __future__ import annotations

import re

ACTION_HINTS = (
    "run ", "open ", "click ", "check ", "install ", "start ", "create ", "add ",
    "write ", "send ", "try ", "use ", "set ", "call ", "ask ", "update ", "fix ",
    "karo", "kijiye", "chalao", "kholo",
)
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


def is_actionable(sentence: str) -> bool:
    lowered = sentence.strip().lower()
    return any(lowered.startswith(hint) for hint in ACTION_HINTS)


def tune(text: str, *, max_words: int = 90) -> str:
    """Compress a model answer into scannable steps with a clear next move."""
    raw = str(text or "").strip()
    if not raw:
        return raw
    sentences = [part.strip() for part in SENTENCE_RE.split(raw) if part.strip()]
    if not sentences:
        return raw
    words = raw.split()
    already_short = len(words) <= 40 and len(sentences) <= 3
    steps = [sentence for sentence in sentences[1:] if is_actionable(sentence)]
    next_step = steps[0] if steps else ""

    headline = sentences[0]
    if already_short and not steps:
        return raw

    lines = [headline]
    context = [sentence for sentence in sentences[1:] if sentence not in steps][:3]
    rest = [sentence for sentence in steps if sentence != next_step]
    for sentence in (context + rest)[:4]:
        lines.append(f"• {sentence}")
    if next_step:
        lines.append(f"Next: {next_step[0].lower() + next_step[1:] if next_step[0].isupper() else next_step}")
    combined = "\n".join(lines)
    if len(combined.split()) > max_words:
        combined = " ".join(combined.split()[:max_words]).rstrip(",;") + "…"
    return combined


def next_action_line(text: str) -> str:
    """Return the first imperative sentence, for the HUD's NEXT badge."""
    for sentence in SENTENCE_RE.split(str(text or "")):
        if is_actionable(sentence):
            return sentence.strip()[:140]
    return ""
