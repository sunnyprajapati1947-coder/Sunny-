"""Google Gemini REST client for Jarvis.

Uses only the Python standard library; no SDK or paid dependency is required.
The API key is read from GEMINI_API_KEY and sent in a request header, never
written to disk or included in error messages.
"""
from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def ask(
    prompt: str,
    *,
    api_key: str | None = None,
    model: str | None = None,
    timeout: float = 25.0,
    history: list[dict[str, str]] | None = None,
    system: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 500,
) -> dict:
    """Return a normalized Gemini response; never raise network/API errors."""
    key = (api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "")).strip()
    if not key:
        return {"success": False, "lane": "gemini", "answer": None, "error": "not_configured"}

    model_name = (model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")).strip()
    if not model_name or "/" in model_name:
        return {"success": False, "lane": "gemini", "answer": None, "error": "invalid_model"}

    contents: list[dict] = []
    for turn in history or []:
        role = str(turn.get("role") or "").lower()
        content = str(turn.get("content") or "").strip()
        if not content or role not in {"user", "assistant", "model"}:
            continue
        contents.append({
            "role": "model" if role in {"assistant", "model"} else "user",
            "parts": [{"text": content[:6000]}],
        })
    current = str(prompt or "").strip()
    if not current:
        return {"success": False, "lane": "gemini", "answer": None, "error": "empty_prompt"}
    contents.append({"role": "user", "parts": [{"text": current[:12000]}]})

    payload: dict = {
        "contents": contents,
        "generationConfig": {
            "temperature": max(0.0, min(1.5, float(temperature))),
            "maxOutputTokens": max(32, min(8192, int(max_tokens))),
        },
    }
    if system:
        payload["systemInstruction"] = {"parts": [{"text": str(system)[:12000]}]}

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        + model_name
        + ":generateContent"
    )
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": key,
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=max(1.0, min(float(timeout), 90.0))) as response:
            data = json.loads(response.read().decode("utf-8"))
        candidates = data.get("candidates") or []
        parts = (candidates[0].get("content") or {}).get("parts") or []
        answer = "".join(str(part.get("text") or "") for part in parts).strip()
        if not answer:
            return {"success": False, "lane": "gemini", "answer": None, "error": "empty_response"}
        return {"success": True, "lane": "gemini", "answer": answer}
    except HTTPError as exc:
        # Do not echo response bodies or request URLs; they may contain private data.
        return {"success": False, "lane": "gemini", "answer": None, "error": f"http_{exc.code}"}
    except (URLError, TimeoutError, OSError):
        return {"success": False, "lane": "gemini", "answer": None, "error": "network_error"}
    except (ValueError, KeyError, TypeError, IndexError):
        return {"success": False, "lane": "gemini", "answer": None, "error": "invalid_response"}
