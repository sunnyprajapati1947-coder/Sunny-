"""Nova System-1 decision engine.

Inspired by NandhaKishorM/laya (non-autoregressive System 1 decision engine):
typed choice / score / yes-no decisions over any text in a single pass.

Nova's adaptation is deliberately local and deterministic: it scores lexical
evidence against the caller's criteria without calling any model and without
network access. It answers the same class of typed questions
(choice, score, noul/yes-no) in one pass, so higher-level Nova code can use it
as a cheap guardrail before spending a local-model call.

This module never bypasses Nova security policy and never executes anything.
"""
from __future__ import annotations

import os
import re
import time
from typing import Any

_WORD = re.compile(r"[\w\u0900-\u097F]+", re.UNICODE)

# Small multilingual polarity lexicon (English + Hindi/Hinglish) used only for
# noul (yes/no) questions when the caller provides no explicit criteria.
YES_WORDS = {
    "yes", "yeah", "yep", "sure", "ok", "okay", "agree", "true", "correct",
    "confirm", "definitely", "absolutely", "want", "wanted", "need", "needed",
    "do", "did", "does", "will", "would", "can", "should", "must",
    "haan", "hanji", "haa", "kar", "karo", "chahiye", "bolo", "karna",
}
NO_WORDS = {
    "no", "nope", "nah", "not", "never", "false", "wrong", "deny", "denied",
    "refuse", "refused", "cancel", "cancelled", "stop", "block", "blocked",
    "avoid", "without", "don't", "dont", "cannot", "can't", "cant",
    "nahi", "nahin", "mat", "mana", "band", "rkho", "ruko",
}


def _tokens(text: str) -> list[str]:
    return [t.lower() for t in _WORD.findall(str(text or ""))]


def _variants(token: str) -> set[str]:
    """Light stem variants so 'refund' matches 'refunds'/'refunded' and
    'billed' matches 'billing' without a full stemmer."""
    out = {token}
    if len(token) > 4:
        if token.endswith("ies"):
            out.add(token[:-3] + "y")
        if token.endswith("es"):
            out.add(token[:-2])
        if token.endswith("s"):
            out.add(token[:-1])
        if token.endswith("ed"):
            out.add(token[:-2])
            out.add(token[:-1])
        if token.endswith("ing"):
            out.add(token[:-3])
            out.add(token[:-3] + "e")
    return out


def _variant_set(tokens: list[str]) -> set[str]:
    variants: set[str] = set()
    for t in tokens:
        variants |= _variants(t)
    return variants


def _overlap_score(state_tokens: list[str], criteria_text: str) -> float:
    """Fraction of criteria tokens (stem-matched) present in the state."""
    crit = _tokens(criteria_text)
    if not crit or not state_tokens:
        return 0.0
    present = _variant_set(state_tokens)
    hits = sum(1 for t in crit if _variants(t) & present)
    return hits / len(crit)


def _choice(state: str, question: dict[str, Any]) -> dict[str, Any]:
    criteria = question.get("criteria") or {}
    if not isinstance(criteria, dict) or not criteria:
        return {"choice": None, "confidence": 0.0, "error": "choice criteria missing"}
    state_tokens = _tokens(state)
    best_label, best_score, scores = None, 0.0, {}
    for label, description in criteria.items():
        score = _overlap_score(state_tokens, f"{label} {description}")
        scores[str(label)] = round(score, 4)
        if score > best_score:
            best_label, best_score = label, score
    if best_label is None:
        return {"choice": None, "confidence": 0.0, "scores": scores}
    total = sum(scores.values()) or 1.0
    return {
        "choice": str(best_label),
        "confidence": round(best_score / (total if total > 1 else 1.0), 4),
        "scores": scores,
    }


def _score(state: str, question: dict[str, Any]) -> dict[str, Any]:
    criteria = question.get("criteria") or []
    if not isinstance(criteria, list) or len(criteria) < 2:
        return {"score": 0.5, "error": "score criteria need >= 2 ordered anchors"}
    state_tokens = _tokens(state)
    n = len(criteria)
    strengths = [_overlap_score(state_tokens, str(anchor)) for anchor in criteria]
    best = max(strengths)
    if best <= 0.0:
        return {"score": 0.5, "strengths": [round(s, 4) for s in strengths]}
    weighted = sum((i / (n - 1)) * s for i, s in enumerate(strengths))
    total = sum(strengths) or 1.0
    return {
        "score": round(weighted / total, 4),
        "strengths": [round(s, 4) for s in strengths],
    }


def _noul(state: str, question: dict[str, Any]) -> dict[str, Any]:
    instructions = str(question.get("instructions") or "")
    state_tokens = _tokens(state)
    # If explicit criteria text is provided, overlap with it dominates.
    criteria = question.get("criteria")
    crit_overlap = _overlap_score(state_tokens, instructions) if instructions else 0.0
    hits = {t for t in state_tokens if t in YES_WORDS}
    misses = {t for t in state_tokens if t in NO_WORDS}
    yes_evidence = len(hits) + 2.0 * crit_overlap
    no_evidence = len(misses)
    if yes_evidence + no_evidence <= 0.0:
        probability = 0.5
    else:
        probability = yes_evidence / (yes_evidence + no_evidence)
    return {
        "noul": round(min(1.0, max(0.0, probability)), 4),
        "yes_evidence": sorted(hits),
        "no_evidence": sorted(misses),
    }


def predict(state: str, questions: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Answer typed decision questions over ``state`` in a single pass.

    Mirrors the laya Router.predict shape:
        questions = {
            "department": {"type": "choice", "instructions": ...,
                           "criteria": {"billing": "invoices, payments", ...}},
            "urgency":    {"type": "score", "criteria": ["not urgent", "blocking"]},
            "churn_risk": {"type": "noul", "instructions": "Does the user threaten to leave?"},
        }
    Returns {"answers": {...}, "routing": {...}} and always succeeds locally.
    """
    started = time.time()
    state = str(state or "")
    answers: dict[str, Any] = {}
    for key, question in (questions or {}).items():
        qtype = str((question or {}).get("type") or "noul").lower()
        if qtype == "choice":
            answers[key] = _choice(state, question)
        elif qtype == "score":
            answers[key] = _score(state, question)
        else:
            answers[key] = _noul(state, question)
    return {
        "success": True,
        "answers": answers,
        "routing": {
            "model": "nova-system1-lexical",
            "languages": ["multilingual-lite"],
            "latency_ms": round((time.time() - started) * 1000.0, 3),
        },
    }


# ------------------------------------------------------------------ tools ---

def decide_choice(state: str, options: dict[str, str]) -> dict[str, Any]:
    """Nova tool: pick the best option for a situation."""
    if not options:
        return {"success": False, "error": "No options provided."}
    result = predict(state, {"decision": {"type": "choice", "criteria": options}})
    answer = result["answers"]["decision"]
    if answer.get("choice") is None:
        return {"success": False, "error": "No option matched the situation."}
    return {"success": True, "choice": answer["choice"], "confidence": answer["confidence"], "scores": answer.get("scores", {})}


def decide_score(state: str, low_anchor: str, high_anchor: str) -> dict[str, Any]:
    """Nova tool: score a situation between a low and a high anchor (0.0 to 1.0)."""
    if not low_anchor or not high_anchor:
        return {"success": False, "error": "Both anchors are required."}
    result = predict(state, {"score": {"type": "score", "criteria": [low_anchor, high_anchor]}})
    answer = result["answers"]["score"]
    return {"success": True, "score": answer["score"]}


def decide_yes_no(state: str, question: str) -> dict[str, Any]:
    """Nova tool: quick yes/no judgement with a probability."""
    result = predict(state, {"judgement": {"type": "noul", "instructions": question}})
    answer = result["answers"]["judgement"]
    return {
        "success": True,
        "probability_yes": answer["noul"],
        "verdict": "yes" if answer["noul"] >= 0.5 else "no",
    }


def enabled() -> bool:
    return os.getenv("NOVA_DECISION_ENGINE_ENABLED", "true").lower() == "true"
