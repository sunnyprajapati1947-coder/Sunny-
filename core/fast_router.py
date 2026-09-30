"""Fast local router for Nova, inspired by lightweight learned-routing patterns.

It does not replace the main Qwen model. It selects a fast lane for bounded,
low-complexity decisions and falls back to the deep lane when unavailable.
No cloud API is required.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import time
from pathlib import Path
from urllib.request import Request, urlopen

FAST_URL = os.getenv("NOVA_FAST_QWEN_URL", "http://127.0.0.1:8081/v1/chat/completions")
DEEP_URL = os.getenv("NOVA_QWEN_URL", "http://127.0.0.1:8080/v1/chat/completions")
FAST_MODEL = os.getenv("NOVA_FAST_QWEN_MODEL", "Qwen3-0.6B-Q4_K_M")
DEEP_MODEL = os.getenv("NOVA_QWEN_MODEL", "Qwen3.5-4B-Q4_0")
DB = Path(os.getenv("NOVA_ROUTER_DB", str(Path.home() / "Nova" / "workspace" / "fast_router.sqlite")))

def _complexity(text: str) -> int:
    s = str(text or "")
    score = min(5, len(s) // 220)
    score += min(3, len(re.findall(r"https?://|research|sources|evidence|script|strategy|analyze", s.lower())))
    return score

def route(text: str) -> str:
    return "fast" if _complexity(text) <= 2 else "deep"

def _served_model(url: str, fallback: str, timeout: float = 2.0) -> str:
    base = url.rsplit("/chat/completions", 1)[0]
    try:
        with urlopen(base + "/models", timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
        models = data.get("data") or []
        if models and models[0].get("id"):
            return str(models[0]["id"])
    except Exception:
        pass
    return fallback

def _call(url: str, model: str, prompt: str, timeout: float) -> str | None:
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": "You are Nova's fast routing assistant. Be concise and factual."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 500,
    }).encode()
    try:
        req = Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
        return str(data["choices"][0]["message"]["content"]).strip()
    except Exception:
        return None

def ask(prompt: str, timeout: float = 12.0) -> dict:
    lane = route(prompt)
    if lane == "fast":
        answer = _call(FAST_URL, _served_model(FAST_URL, FAST_MODEL), prompt, timeout)
        if answer is not None:
            used = "fast"
        else:
            answer = _call(DEEP_URL, _served_model(DEEP_URL, DEEP_MODEL), prompt, min(45.0, timeout + 20.0))
            used = "deep_fallback"
    else:
        answer = _call(DEEP_URL, _served_model(DEEP_URL, DEEP_MODEL), prompt, min(45.0, timeout + 20.0))
        used = "deep"
    return {"success": answer is not None, "lane": used, "answer": answer}

def remember(prompt: str, lane: str) -> None:
    """Store a tiny local routing history for future telemetry/learning."""
    DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB) as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS routes(ts INTEGER, prompt TEXT, lane TEXT)")
        conn.execute("INSERT INTO routes VALUES(?,?,?)", (int(time.time()), str(prompt)[:2000], lane))
        conn.commit()
