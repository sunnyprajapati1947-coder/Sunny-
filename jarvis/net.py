"""Tiny HTTP helpers (stdlib only) with friendly failures and caching."""
from __future__ import annotations

import json
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 JARVIS/1.0"
)

_SSL = ssl.create_default_context()


class NetError(RuntimeError):
    """Raised when a remote resource cannot be reached or parsed."""


def _request(
    url: str,
    *,
    data: bytes | None = None,
    headers: dict | None = None,
    timeout: float = 9.0,
    method: str | None = None,
):
    merged = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
        "Accept": "*/*",
    }
    if headers:
        merged.update(headers)
    request = urllib.request.Request(url, data=data, headers=merged, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=_SSL) as response:
            return response.read(), response.headers.get("Content-Type", ""), response.status
    except urllib.error.HTTPError as exc:
        raise NetError(f"HTTP {exc.code} from {urllib.parse.urlsplit(url).netloc}") from exc
    except urllib.error.URLError as exc:
        raise NetError(f"Cannot reach {urllib.parse.urlsplit(url).netloc}") from exc
    except TimeoutError as exc:
        raise NetError(f"Timed out contacting {urllib.parse.urlsplit(url).netloc}") from exc
    except OSError as exc:
        raise NetError(f"Network error: {type(exc).__name__}") from exc


def get_json(
    url: str,
    *,
    timeout: float = 9.0,
    headers: dict | None = None,
) -> Any:
    raw, _, _ = _request(url, timeout=timeout, headers=headers)
    try:
        return json.loads(raw.decode("utf-8", "replace"))
    except json.JSONDecodeError as exc:
        raise NetError("Remote service returned malformed JSON") from exc


def get_text(
    url: str,
    *,
    timeout: float = 9.0,
    headers: dict | None = None,
) -> str:
    raw, _, _ = _request(url, timeout=timeout, headers=headers)
    return raw.decode("utf-8", "replace")


def post_json(
    url: str,
    payload: dict,
    *,
    timeout: float = 9.0,
    headers: dict | None = None,
) -> Any:
    merged = {"Content-Type": "application/json"}
    if headers:
        merged.update(headers)
    body = json.dumps(payload).encode("utf-8")
    raw, _, _ = _request(url, data=body, headers=merged, timeout=timeout, method="POST")
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8", "replace"))
    except json.JSONDecodeError as exc:
        raise NetError("Remote service returned malformed JSON") from exc


def download(url: str, *, timeout: float = 20.0, limit_bytes: int = 20_000_000) -> tuple[int, float]:
    """Stream a URL and return (bytes, seconds) — used for the speed test."""
    start = time.perf_counter()
    total = 0
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=_SSL) as response:
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total >= limit_bytes:
                    break
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise NetError("Speed test endpoint is unreachable") from exc
    return total, max(0.001, time.perf_counter() - start)


class TTLCache:
    """Very small thread-safe TTL cache."""

    def __init__(self, ttl: float = 60.0, max_items: int = 64):
        self.ttl = float(ttl)
        self.max_items = max_items
        self._data: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        with self._lock:
            item = self._data.get(key)
            if not item:
                return None
            stamp, value = item
            if time.time() - stamp > self.ttl:
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            if len(self._data) >= self.max_items:
                oldest = min(self._data, key=lambda k: self._data[k][0])
                self._data.pop(oldest, None)
            self._data[key] = (time.time(), value)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


def quote(value: str) -> str:
    return urllib.parse.quote_plus(str(value))
