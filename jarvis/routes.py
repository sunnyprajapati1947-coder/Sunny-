"""Free AI routes: one OpenAI-compatible lane over many free model providers.

Two self-hosted routers make this real:

* **FreeLLMAPI** (tashfeenahmed/freellmapi) — 34 free providers, 635 free
  endpoints, one ``/v1``. Default local endpoint ``http://localhost:3001/v1``,
  model ``auto`` (or ``auto:fast`` / ``auto:smart``).
* **OmniRoute** (ChrisCompton/omniroute) — 60+ providers with format
  translation and quota tracking. Default ``http://localhost:20128/v1``,
  ``any-string`` key.

Both speak the OpenAI chat-completions API, so Jarvis needs exactly one code
path: POST ``{base}/chat/completions``, read ``choices[0].message.content`` and
keep the ``X-Routed-Via`` header to say honestly which provider answered.

Any other OpenAI-compatible endpoint (llama.cpp, LM Studio, vLLM, a remote
gateway) can be added as a custom route.

Nothing here invents success: an offline route reports the error, and the
brain falls through to the next provider instead of pretending.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from jarvis.config import DATA_DIR

ROUTES_FILE = DATA_DIR / "routes.json"
PROBE_TTL = 15.0
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,24}$")
CHAT_TIMEOUT = 60.0
PROBE_TIMEOUT = 1.6

PRESETS: tuple[dict, ...] = (
    {
        "id": "freellmapi",
        "label": "FreeLLMAPI",
        "kind": "freellmapi",
        "base_url": "http://127.0.0.1:3001/v1",
        "model": "auto",
        "priority": 10,
        "enabled": True,
        "key_env": "JARVIS_FREELLMAPI_KEY",
        "homepage": "https://github.com/tashfeenahmed/freellmapi",
        "install": (
            "docker run -d --name freellmapi -p 3001:3001 -v freellmapi:/app/data "
            "ghcr.io/freellmapi/freellmapi:latest"
        ),
        "note": "Add provider keys in the dashboard at http://localhost:3001, then copy the unified key.",
    },
    {
        "id": "omniroute",
        "label": "OmniRoute",
        "kind": "omniroute",
        "base_url": "http://127.0.0.1:20128/v1",
        "model": "auto",
        "priority": 20,
        "enabled": True,
        "key_env": "JARVIS_OMNIROUTE_KEY",
        "homepage": "https://github.com/ChrisCompton/omniroute",
        "install": "npm install -g omniroute && omniroute",
        "note": "Dashboard on http://localhost:20128 — connect free providers, then use any string as the key.",
    },
)

_cache: dict[str, dict] = {}


def _host(url: str) -> str:
    try:
        return urlsplit(url).netloc or url
    except Exception:
        return url


# ------------------------------------------------------------------ storage
def _key_from_env(route: dict) -> str:
    env_name = str(route.get("key_env") or "").strip()
    if env_name:
        return (os.getenv(env_name) or "").strip()
    slug = re.sub(r"[^A-Z0-9]+", "_", str(route.get("id", "")).upper()).strip("_")
    return (os.getenv(f"JARVIS_ROUTE_{slug}_KEY") or "").strip() if slug else ""


def _file_routes() -> list[dict]:
    try:
        raw = json.loads(ROUTES_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if isinstance(raw, dict):
        raw = raw.get("routes") or []
    return [item for item in raw if isinstance(item, dict) and item.get("id")]


def _write_file_routes(routes: list[dict]) -> None:
    ROUTES_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {"routes": [
        {
            key: value
            for key, value in route.items()
            if key in {"id", "label", "kind", "base_url", "model", "api_key", "priority", "enabled", "key_env"}
        }
        for route in routes
    ]}
    ROUTES_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    try:
        ROUTES_FILE.chmod(0o600)  # keys live here for custom routes — keep it owner-only
    except OSError:
        pass


def _normalize(route: dict, preset: dict | None = None) -> dict:
    base = dict(preset or {})
    base.update(route)
    base["base_url"] = str(base.get("base_url") or "").rstrip("/")
    if base["base_url"].endswith("/chat/completions"):
        base["base_url"] = base["base_url"][: -len("/chat/completions")]
    base["model"] = str(base.get("model") or "auto")
    try:
        base["priority"] = int(base.get("priority", 50))
    except (TypeError, ValueError):
        base["priority"] = 50
    base["enabled"] = bool(base.get("enabled", True))
    base["api_key"] = str(base.get("api_key") or "").strip() or _key_from_env(base)
    return base


def routes() -> list[dict]:
    """Every configured route: presets first (unless overridden), then customs."""
    custom = _file_routes()
    by_id = {str(item["id"]): item for item in custom}
    merged: list[dict] = []
    for preset in PRESETS:
        override = by_id.pop(preset["id"], None)
        if override is not None and override.get("enabled") is False:
            route = _normalize({**preset, **override}, preset)
            route["enabled"] = False
            merged.append(route)
            continue
        merged.append(_normalize(override or {}, preset))
    for extra in by_id.values():
        merged.append(_normalize(extra))
    merged.sort(key=lambda item: (item["priority"], item["id"]))
    return merged


def get(route_id: str) -> dict | None:
    wanted = str(route_id or "").strip().lower()
    for route in routes():
        if route["id"] == wanted or route.get("label", "").lower() == wanted:
            return route
    return None


# ------------------------------------------------------------------- probing
def _http_json(
    url: str,
    *,
    payload: dict | None = None,
    api_key: str = "",
    timeout: float = CHAT_TIMEOUT,
) -> tuple[dict | list | None, dict, int, str]:
    """Minimal OpenAI-compatible JSON call that also returns response headers."""
    data = None
    headers = {"Accept": "application/json", "User-Agent": "JARVIS/1.0 (+free-routes)"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            meta = {key.lower(): value for key, value in response.headers.items()}
            status = response.status
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", "ignore")[:200]
        except Exception:
            pass
        return None, {}, exc.code, detail or f"HTTP {exc.code}"
    except urllib.error.URLError as exc:
        return None, {}, 0, f"cannot reach {_host(url)} ({exc.reason})"
    except TimeoutError:
        return None, {}, 0, f"timed out talking to {_host(url)}"
    except OSError as exc:
        return None, {}, 0, f"{type(exc).__name__}: {exc}"
    try:
        return json.loads(raw.decode("utf-8", "ignore")), meta, status, ""
    except ValueError:
        return None, meta, status, "response was not JSON"


def probe(route: dict, *, timeout: float = PROBE_TIMEOUT, fresh: bool = False) -> dict:
    """Is this gateway answering, and how many models does it expose?"""
    route_id = str(route.get("id", ""))
    now = time.time()
    cached = _cache.get(route_id)
    if not fresh and cached and now - cached["ts"] < PROBE_TTL:
        return {**cached["value"], "cached": True}

    url = route["base_url"] + "/models"
    started = time.perf_counter()
    data, _headers, status, error = _http_json(url, api_key=route.get("api_key", ""), timeout=timeout)
    latency = round((time.perf_counter() - started) * 1000, 1)
    models: list[str] = []
    if isinstance(data, dict):
        models = [str(item.get("id", "")) for item in (data.get("data") or []) if isinstance(item, dict)]
    elif isinstance(data, list):
        models = [str(item.get("id", "")) for item in data if isinstance(item, dict)]
    online = bool(status == 200 and (models or data))
    value = {
        "id": route_id,
        "label": route.get("label") or route_id,
        "base_url": route["base_url"],
        "model": route.get("model", "auto"),
        "online": online,
        "status": status,
        "latency_ms": latency if online else None,
        "models": len(models),
        "sample": models[:8],
        "error": "" if online else (error or "not answering"),
        "enabled": bool(route.get("enabled", True)),
    }
    _cache[route_id] = {"ts": now, "value": value}
    return value


def status_all(*, fresh: bool = False) -> list[dict]:
    return [probe(route, fresh=fresh) for route in routes()]


_negative_until = 0.0


def available(*, fresh: bool = False, cooldown: float = 45.0) -> bool:
    """True when at least one enabled route answers.

    A failed sweep is remembered for ``cooldown`` seconds so an offline gateway
    costs one short probe, not one per message.
    """
    global _negative_until
    now = time.time()
    if not fresh and now < _negative_until:
        return False
    online = any(item["online"] for item in status_all(fresh=fresh) if item["enabled"])
    if not online:
        _negative_until = now + cooldown
    else:
        _negative_until = 0.0
    return online


def summary() -> dict:
    """Compact view for /api/status — cheap because probes are cached."""
    items = status_all()
    online = [item for item in items if item["online"]]
    return {
        "count": len(items),
        "online": len(online),
        "ready": bool(online),
        "routes": items,
        "models": sum(item["models"] for item in online),
        "best": online[0]["id"] if online else "",
    }


# -------------------------------------------------------------------- models
def models(route_id: str = "", *, fresh: bool = False) -> dict:
    targets = [get(route_id)] if route_id else [r for r in routes() if r.get("enabled")]
    targets = [route for route in targets if route]
    if not targets:
        return {"ok": False, "error": f"Unknown route “{route_id}”.", "routes": []}
    results = []
    for route in targets:
        url = route["base_url"] + "/models"
        data, _headers, status, error = _http_json(url, api_key=route.get("api_key", ""), timeout=PROBE_TIMEOUT)
        ids: list[str] = []
        if isinstance(data, dict):
            ids = [str(item.get("id", "")) for item in (data.get("data") or []) if isinstance(item, dict)]
        elif isinstance(data, list):
            ids = [str(item.get("id", "")) for item in data if isinstance(item, dict)]
        results.append({
            "id": route["id"],
            "label": route.get("label") or route["id"],
            "online": status == 200,
            "count": len(ids),
            "models": ids,
            "error": "" if status == 200 else (error or f"HTTP {status}"),
        })
    return {"ok": any(item["online"] for item in results), "routes": results}


# ---------------------------------------------------------------------- chat
def chat(
    route: dict,
    messages: list[dict],
    *,
    model: str = "",
    temperature: float = 0.4,
    max_tokens: int = 700,
    timeout: float = CHAT_TIMEOUT,
) -> tuple[str | None, dict]:
    """One chat completion through a route, with the provider it actually used."""
    payload = {
        "model": str(model or route.get("model") or "auto"),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    url = route["base_url"] + "/chat/completions"
    started = time.perf_counter()
    data, headers, status, error = _http_json(url, payload=payload, api_key=route.get("api_key", ""), timeout=timeout)
    elapsed = round((time.perf_counter() - started) * 1000, 1)
    meta = {
        "route": route["id"],
        "label": route.get("label") or route["id"],
        "model": payload["model"],
        "status": status,
        "ms": elapsed,
        "routed_via": headers.get("x-routed-via", ""),
        "provider_id": headers.get("x-provider", ""),
    }
    if not isinstance(data, dict):
        meta["error"] = error or f"HTTP {status}"
        return None, meta
    choices = data.get("choices") or []
    if not choices or not isinstance(choices[0], dict):
        meta["error"] = (data.get("error") or {}).get("message") if isinstance(data.get("error"), dict) else "no choices in response"
        return None, meta
    content = str((choices[0].get("message") or {}).get("content") or "").strip()
    if not content:
        meta["error"] = "the model returned an empty message"
        return None, meta
    usage = data.get("usage") or {}
    if isinstance(usage, dict):
        meta["tokens"] = int(usage.get("total_tokens") or 0)
    meta["model"] = str(data.get("model") or payload["model"])
    return content, meta


def route_chat(
    messages: list[dict],
    *,
    model: str = "",
    temperature: float = 0.4,
    max_tokens: int = 700,
    timeout: float = CHAT_TIMEOUT,
    skip: set[str] | None = None,
) -> tuple[str | None, str, dict]:
    """Try enabled routes in priority order; first real answer wins."""
    skip = skip or set()
    errors: list[str] = []
    for route in routes():
        if not route.get("enabled") or route["id"] in skip:
            continue
        text, meta = chat(route, messages, model=model, temperature=temperature, max_tokens=max_tokens, timeout=timeout)
        if text:
            return text, f"route:{route['id']}", meta
        errors.append(f"{route['id']}: {meta.get('error', 'no answer')}")
        probe(route, fresh=True)
    return None, "offline", {"errors": errors}


def test(route_id: str) -> dict:
    """Send a real ping through one route and report who answered."""
    route = get(route_id)
    if route is None:
        return {"ok": False, "error": f"Unknown route “{route_id}”.", "routes": [r["id"] for r in routes()]}
    text, meta = chat(
        route,
        [
            {"role": "system", "content": "Reply with exactly: ONLINE"},
            {"role": "user", "content": "ping"},
        ],
        max_tokens=16,
        timeout=45.0,
    )
    ok = bool(text)
    probe(route, fresh=True)
    return {
        "ok": ok,
        "route": route["id"],
        "reply": text or "",
        "routed_via": meta.get("routed_via", ""),
        "model": meta.get("model", ""),
        "ms": meta.get("ms"),
        "tokens": meta.get("tokens", 0),
        "error": "" if ok else meta.get("error", "no answer"),
    }


# ------------------------------------------------------------------ mutation
def save_route(
    route_id: str,
    *,
    base_url: str = "",
    model: str = "",
    api_key: str = "",
    label: str = "",
    priority: int = 50,
    enabled: bool = True,
) -> dict:
    """Create or update a route (presets included). Validates the URL first."""
    slug = str(route_id or "").strip().lower()
    if not ID_RE.match(slug):
        return {"ok": False, "error": "Route id must be 2-25 chars: a-z, 0-9, - or _."}
    existing = get(slug)
    if existing and not base_url:
        base_url = existing["base_url"]
    url = str(base_url or "").strip().rstrip("/")
    if not re.match(r"^https?://[^/\s]+", url):
        return {"ok": False, "error": "Base URL must start with http:// or https:// and name a host."}
    if url.endswith("/chat/completions"):
        url = url[: -len("/chat/completions")]
    stored = _file_routes()
    record = None
    for item in stored:
        if str(item.get("id")) == slug:
            record = item
            break
    if record is None:
        record = {"id": slug}
        stored.append(record)
    record.update({"base_url": url, "enabled": bool(enabled), "priority": int(priority)})
    if model:
        record["model"] = str(model)
    if label:
        record["label"] = str(label)
    if api_key:
        record["api_key"] = str(api_key)[:400]
    _write_file_routes(stored)
    _cache.pop(slug, None)
    return {"ok": True, "route": get(slug)}


def remove_route(route_id: str) -> dict:
    slug = str(route_id or "").strip().lower()
    stored = _file_routes()
    kept = [item for item in stored if str(item.get("id")) != slug]
    if len(kept) == len(stored):
        return {"ok": False, "error": f"No custom configuration for “{slug}”."}
    _write_file_routes(kept)
    _cache.pop(slug, None)
    return {"ok": True, "removed": slug}


def set_enabled(route_id: str, enabled: bool) -> dict:
    route = get(route_id)
    if route is None:
        return {"ok": False, "error": f"Unknown route “{route_id}”."}
    return save_route(route["id"], base_url=route["base_url"], model=route["model"], priority=route["priority"], enabled=enabled)


def mask(route: dict) -> str:
    key = str(route.get("api_key") or "")
    if not key:
        return "not set"
    if len(key) <= 6:
        return "•••"
    return f"•••{key[-4:]}"


def invalidate() -> None:
    global _negative_until
    _cache.clear()
    _negative_until = 0.0


def adhoc(base_url: str, api_key: str = "", model: str = "auto") -> dict:
    """A throwaway route for a one-off test without saving anything."""
    return _normalize({"id": "adhoc", "label": "Ad hoc", "base_url": base_url, "api_key": api_key, "model": model})
