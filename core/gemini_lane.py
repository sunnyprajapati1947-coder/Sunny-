"""Gemini lane — Google AI se Jarvis ka asli dimaag (optional).

Boss apna Gemini API key local file me rakhta hai (config/gemini.key, git me
kabhi commit nahi hoti). Key hone par Jarvis complex baat-cheet Gemini se
karta hai (fast + smart); key na ho ya internet fail ho to wahi local Qwen
lane chalti rehti hai. Local-first doctrine maintained.

API: generativelanguage.googleapis.com (v1beta generateContent), urllib se -
koi nayi dependency nahi.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_TIMEOUT = 45.0

# SunnyAI ke Google model registry se (core/providers/google_models.py).
FALLBACK_MODEL = "gemini-2.0-flash"


def _key_file() -> Path:
    """Key file path — env se har baar read hota hai (testable + flexible)."""
    return Path(os.getenv("NOVA_GEMINI_KEY_FILE", str(ROOT / "config" / "gemini.key")))


def _model() -> str:
    env_model = os.getenv("NOVA_GEMINI_MODEL", "").strip()
    if env_model:
        return env_model
    try:
        from core.providers.google_models import TEXT_MODELS
        return TEXT_MODELS.get("brain") or FALLBACK_MODEL
    except Exception:
        return FALLBACK_MODEL


# ------------------------------------------------------------------- key ----

def set_key(key: str) -> dict[str, Any]:
    """Key ko local file me save karo (gitignored, chmod 600)."""
    key = str(key or "").strip()
    if len(key) < 20:
        return {"success": False, "error": "Ye valid Gemini API key nahi lagti (bahut chhoti hai)."}
    if not key.startswith(("AIza", "ya29.")) and not key[0].isalnum():
        return {"success": False, "error": "Key strange lag rahi hai — dobara copy-paste karo."}
    try:
        target = _key_file()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(key + "\n", encoding="utf-8")
        target.chmod(0o600)
    except OSError as exc:
        return {"success": False, "error": f"Key file likh nahi paya: {exc}"}
    return {"success": True, "stored": str(_key_file()), "note": "Ye file git me kabhi commit nahi hoti."}


def get_key() -> str:
    try:
        return _key_file().read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def has_key() -> bool:
    return enabled() and len(get_key()) >= 20


def clear_key() -> dict[str, Any]:
    try:
        if _key_file().is_file():
            _key_file().unlink()
        return {"success": True, "cleared": True}
    except OSError as exc:
        return {"success": False, "error": str(exc)}


def enabled() -> bool:
    return os.getenv("NOVA_GEMINI_ENABLED", "true").lower() == "true"


def key_status() -> dict[str, Any]:
    return {
        "success": True,
        "enabled": enabled(),
        "key_present": has_key(),
        "key_file": str(_key_file()),
        "model": _model(),
        "committed_to_git": False,
    }


# ------------------------------------------------------------------ calls ---

def _contents(history: list[dict[str, str]], prompt: str) -> list[dict[str, str]]:
    """OpenAI-style turns ko Gemini contents (user/model roles) me badlo."""
    contents = []
    for turn in history or []:
        role = "model" if turn.get("role") == "assistant" else "user"
        text = str(turn.get("content") or "").strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})
    return contents


def ask_gemini(
    prompt: str,
    history: list[dict[str, str]] | None = None,
    system: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    max_tokens: int = 1200,
) -> dict[str, Any]:
    """Gemini se ek jawab. Key/internet/safety fail -> success False (caller
    local lane pe fall back karta hai)."""
    result = _generate(
        _contents(history or [], prompt),
        system=system,
        timeout=timeout,
        max_tokens=max_tokens,
    )
    if result.get("success") and result.get("text"):
        return {"success": True, "answer": result["text"], "model": _model(), "lane": "gemini"}
    return {"success": False, "error": result.get("error", "Gemini jawab nahi de paya.")}


def _generate(
    contents: list[dict[str, Any]],
    system: str | None = None,
    tools: dict[str, Any] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    max_tokens: int = 1200,
) -> dict[str, Any]:
    """Ek raw generateContent call. Contents/tools caller banata hai.

    Return: {"success": True, "text": ..., "function_calls": [...]} —
    function_calls tab jab model tool chalana chahe (agentic lane ke liye).
    """
    if not has_key():
        return {"success": False, "error": "Gemini key set nahi hai."}
    key = get_key()
    model = _model()
    payload: dict[str, Any] = {
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": max_tokens},
    }
    if system:
        payload["system_instruction"] = {"parts": [{"text": system}]}
    if tools:
        payload["tools"] = [tools]
    url = f"{API_BASE}/{quote(model)}:generateContent?key={quote(key)}"
    try:
        req = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urlopen(req, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        return {"success": False, "error": f"Gemini call fail: {type(exc).__name__}"}

    candidates = data.get("candidates") or []
    for candidate in candidates:
        parts = (candidate.get("content") or {}).get("parts") or []
        text = "".join(str(p.get("text") or "") for p in parts if p.get("text")).strip()
        function_calls = [
            {
                "name": str(fc.get("name") or ""),
                "args": dict(fc.get("args") or {}),
            }
            for p in parts if p.get("functionCall")
            for fc in [p["functionCall"]]
        ]
        if text or function_calls:
            return {"success": True, "text": text, "function_calls": function_calls}

    # Blocked/empty candidates -> safety block ya quota; honest failure.
    reason = "Gemini ne khaali/jawab-denese-inkaar kiya (safety ya quota)."
    return {"success": False, "error": reason}
