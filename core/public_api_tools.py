"""Nova public API tools — real skills from the public-apis directory.

Inspired by public-apis/public-apis: a collective list of free APIs.
Nova curates the no-auth, HTTPS-only entries (core/data/api_directory.json)
and ships working clients for the ones an assistant uses most:
weather, currency, dictionary, and Wikipedia — none of which need a key.

Design rules:
- Read-only HTTP GET with bounded timeouts and response sizes.
- No API keys, no accounts, no telemetry.
- Every failure degrades gracefully so Nova stays usable offline.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

DATA_DIR = Path(__file__).resolve().parent / "data"
DEFAULT_TIMEOUT = float(os.getenv("NOVA_API_TIMEOUT", "8.0"))
MAX_BYTES = 400_000


def _get_json(url: str, timeout: float = DEFAULT_TIMEOUT) -> dict[str, Any]:
    req = Request(url, headers={"User-Agent": "Nova-Assistant/1.0 (local-first)"})
    with urlopen(req, timeout=timeout) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("Response too large.")
    return json.loads(raw.decode("utf-8", errors="replace"))


def _load_directory() -> list[dict[str, Any]]:
    path = DATA_DIR / "api_directory.json"
    if not path.is_file():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("apis", [])
    except (json.JSONDecodeError, OSError):
        return []


def _clean_location(location: str) -> str:
    location = re.sub(r"[^A-Za-z0-9 ,+-]", "", str(location or "").strip())
    return location.strip()[:64]


# --------------------------------------------------------------- live calls --

def api_weather(location: str) -> dict[str, Any]:
    """Current weather from wttr.in (no key). Accepts a city name."""
    if not enabled():
        return {"success": False, "error": "Public API tools are disabled."}
    loc = _clean_location(location)
    if not loc:
        return {"success": False, "error": "Provide a city name, e.g. Delhi."}
    try:
        data = _get_json(f"https://wttr.in/{quote(loc)}?format=j1")
        current = (data.get("current_condition") or [{}])[0]
        area = ((data.get("nearest_area") or [{}])[0])
        return {
            "success": True,
            "source": "wttr.in",
            "location": (area.get("areaName") or [{}])[0].get("value", loc),
            "region": (area.get("region") or [{}])[0].get("value", ""),
            "description": (current.get("weatherDesc") or [{}])[0].get("value", ""),
            "temperature_c": current.get("temp_C"),
            "feels_like_c": current.get("FeelsLikeC"),
            "humidity_percent": current.get("humidity"),
            "wind_kmph": current.get("windspeedKmph"),
        }
    except Exception as exc:  # offline / rate limited / bad city
        return {"success": False, "error": f"Weather lookup failed: {exc}"}


def api_currency(base: str, target: str, amount: float = 1.0) -> dict[str, Any]:
    """Currency conversion from Frankfurter (no key, ECB reference rates)."""
    if not enabled():
        return {"success": False, "error": "Public API tools are disabled."}
    base_code = re.sub(r"[^A-Za-z]", "", base or "").upper()[:3]
    target_code = re.sub(r"[^A-Za-z]", "", target or "").upper()[:3]
    if len(base_code) != 3 or len(target_code) != 3:
        return {"success": False, "error": "Use 3-letter currency codes, e.g. USD to INR."}
    try:
        amount = max(0.0, float(amount))
    except (TypeError, ValueError):
        amount = 1.0
    try:
        data = _get_json(
            f"https://api.frankfurter.app/latest?amount={amount}&from={base_code}&to={target_code}"
        )
        rates = data.get("rates", {})
        if target_code not in rates:
            return {"success": False, "error": f"No rate for {target_code}."}
        return {
            "success": True,
            "source": "frankfurter.app",
            "amount": amount,
            "base": data.get("base", base_code),
            "target": target_code,
            "converted": rates[target_code],
            "date": data.get("date", ""),
        }
    except Exception as exc:
        return {"success": False, "error": f"Currency lookup failed: {exc}"}


def api_dictionary(word: str) -> dict[str, Any]:
    """English definitions from dictionaryapi.dev (no key)."""
    if not enabled():
        return {"success": False, "error": "Public API tools are disabled."}
    term = re.sub(r"[^A-Za-z- ]", "", str(word or "").strip())[:48]
    if not term:
        return {"success": False, "error": "Provide a word to define."}
    try:
        data = _get_json(f"https://api.dictionaryapi.dev/api/v2/entries/en/{quote(term)}")
        entry = (data or [{}])[0]
        meanings = []
        for meaning in entry.get("meanings", [])[:3]:
            part = meaning.get("partOfSpeech", "")
            definition = ((meaning.get("definitions") or [{}])[0]).get("definition", "")
            if definition:
                meanings.append(f"{part}: {definition}" if part else definition)
        if not meanings:
            return {"success": False, "error": f"No definitions found for '{term}'."}
        return {
            "success": True,
            "source": "dictionaryapi.dev",
            "word": entry.get("word", term),
            "meanings": meanings,
        }
    except Exception as exc:
        return {"success": False, "error": f"Dictionary lookup failed: {exc}"}


def api_wikipedia(title: str) -> dict[str, Any]:
    """Short topic summary from the English Wikipedia REST API (no key)."""
    if not enabled():
        return {"success": False, "error": "Public API tools are disabled."}
    term = re.sub(r"[^A-Za-z0-9 ()_-]", "", str(title or "").strip())[:100]
    if not term:
        return {"success": False, "error": "Provide a topic title."}
    try:
        data = _get_json(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(term.replace(' ', '_'))}"
        )
        return {
            "success": True,
            "source": "wikipedia.org",
            "title": data.get("title", term),
            "summary": (data.get("extract") or "")[:1200],
            "url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
        }
    except Exception as exc:
        return {"success": False, "error": f"Wikipedia lookup failed: {exc}"}


# ------------------------------------------------------------ local search --

def api_directory_search(query: str, category: str = "") -> dict[str, Any]:
    """Search Nova's curated offline copy of the public-apis directory."""
    apis = _load_directory()
    if not apis:
        return {"success": False, "error": "API directory data is missing."}
    q = set(re.findall(r"\w+", str(query or "").lower()))
    cat = str(category or "").strip().lower()
    matches = []
    for api in apis:
        if cat and api.get("category", "").lower() != cat:
            continue
        text = f"{api.get('name','')} {api.get('description','')}".lower()
        if not q or q & set(re.findall(r"\w+", text)):
            matches.append(api)
    matches = matches[:20]
    return {
        "success": True,
        "source": "public-apis/public-apis (curated offline copy)",
        "query": query,
        "category": category,
        "count": len(matches),
        "apis": matches,
    }


def enabled() -> bool:
    return os.getenv("NOVA_PUBLIC_API_TOOLS_ENABLED", "true").lower() == "true"
