"""Model providers and the fallback chain.

Everything here uses urllib from the standard library, so JARVIS runs on a
fresh Termux/Debian python3 with no pip install at all.

Providers
    gemini      Google Generative Language REST (streaming SSE)
    openai      any OpenAI-compatible endpoint: OpenAI, OpenRouter, Groq, DeepSeek
    local       llama.cpp llama-server started by the existing Nova scripts
    offline     no model: answers come from tools + memory only

Fallback
    The chain is tried in order; a provider that fails 3 times within 10 minutes
    is skipped for 60 seconds (circuit breaker) instead of hammering a dead API.
"""

from __future__ import annotations

import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Callable, Iterator

USER_AGENT = "JARVIS/1.0 (+local)"
DEFAULT_BASES = {
    "openai": "https://api.openai.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "groq": "https://api.groq.com/openai/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
}
DEFAULT_MODELS = {
    "gemini": "gemini-2.5-flash",
    "openai": "gpt-4o-mini",
    "openrouter": "google/gemini-2.0-flash-001",
    "groq": "llama-3.3-70b-versatile",
    "deepseek": "deepseek-chat",
}


class ProviderError(RuntimeError):
    """A provider failed. `status` is the HTTP status when there was one."""

    def __init__(self, message: str, *, status: int | None = None, retryable: bool = True,
                 provider: str = ""):
        super().__init__(message)
        self.status = status
        self.retryable = retryable
        self.provider = provider

    def friendly(self) -> str:
        if self.status in (401, 403):
            return "API key rejected. Settings me key dobara check karo."
        if self.status == 404:
            return "Model ya endpoint nahi mila. Settings me model/name badlo."
        if self.status == 429:
            return "Rate limit. Thodi der baad try karo ya doosra model chuno."
        if self.status and self.status >= 500:
            return f"Provider down hai ({self.status})."
        text = str(self)
        if "timed out" in text.lower() or "timeout" in text.lower():
            return "Provider ne time out kar diya."
        if "urlopen error" in text.lower() or "name or service" in text.lower():
            return "Internet/network nahi mil raha."
        return text[:300]


@dataclass
class Reply:
    text: str
    provider: str
    model: str
    latency_ms: int = 0
    usage: dict = field(default_factory=dict)
    attempts: list = field(default_factory=list)


class Breaker:
    """Tiny circuit breaker: N failures in a window -> cooldown."""

    def __init__(self, threshold: int = 3, window: float = 600.0, cooldown: float = 60.0):
        self.threshold = threshold
        self.window = window
        self.cooldown = cooldown
        self.failures: dict[str, list[float]] = {}
        self.opened: dict[str, float] = {}

    def available(self, name: str) -> bool:
        opened = self.opened.get(name)
        if opened and time.time() - opened < self.cooldown:
            return False
        if opened:
            self.opened.pop(name, None)
            self.failures.pop(name, None)
        return True

    def record_failure(self, name: str) -> None:
        now = time.time()
        rows = [ts for ts in self.failures.get(name, []) if now - ts < self.window]
        rows.append(now)
        self.failures[name] = rows
        if len(rows) >= self.threshold:
            self.opened[name] = now

    def record_success(self, name: str) -> None:
        self.failures.pop(name, None)
        self.opened.pop(name, None)

    def state(self) -> dict:
        now = time.time()
        return {
            "open": {name: round(self.cooldown - (now - ts), 1) for name, ts in self.opened.items()},
            "failures": {name: len([t for t in rows if now - t < self.window])
                         for name, rows in self.failures.items()},
        }


def _request(url: str, payload: dict | None = None, headers: dict | None = None,
             timeout: float = 60.0, method: str = "POST"):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("user-agent", USER_AGENT)
    if data:
        request.add_header("content-type", "application/json")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        return urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", "replace")
        except Exception:
            pass
        message = _error_message(body) or f"HTTP {exc.code}"
        raise ProviderError(message, status=exc.code,
                            retryable=exc.code in (408, 409, 425, 429) or exc.code >= 500) from None
    except (urllib.error.URLError, socket.timeout, TimeoutError) as exc:
        raise ProviderError(f"network: {exc}", retryable=True) from None


def _error_message(body: str) -> str:
    try:
        data = json.loads(body)
    except Exception:
        return body[:300]
    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error)[:300]
        if isinstance(error, str):
            return error[:300]
        if isinstance(data.get("message"), str):
            return data["message"][:300]
    return body[:300]


def _iter_sse(response) -> Iterator[dict]:
    """Yield parsed JSON objects from a text/event-stream response."""
    while True:
        raw = response.readline()
        if not raw:
            return
        line = raw.decode("utf-8", "replace").strip()
        if not line or not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data or data == "[DONE]":
            if data == "[DONE]":
                return
            continue
        try:
            yield json.loads(data)
        except json.JSONDecodeError:
            continue


# ------------------------------------------------------------------ gemini

class GeminiProvider:
    name = "gemini"

    def __init__(self, settings):
        self.settings = settings

    def configured(self) -> bool:
        return bool(self.settings.key_for("gemini"))

    def _base(self) -> str:
        """Base URL. Overridable for a proxy or for tests via JARVIS_GEMINI_BASE."""
        import os
        return (getattr(self.settings, "gemini_base", "") or
                os.environ.get("JARVIS_GEMINI_BASE", "") or
                DEFAULT_BASES["gemini"]).rstrip("/")

    def _url(self, model: str, stream: bool) -> str:
        base = self._base()
        path = "streamGenerateContent?alt=sse" if stream else "generateContent"
        return f"{base}/models/{urllib.parse.quote(model)}:{path}"

    def _payload(self, system: str, messages: list[dict], model: str) -> dict:
        contents = []
        for message in messages:
            role = "model" if message.get("role") == "assistant" else "user"
            text = str(message.get("content") or "")
            if not text:
                continue
            contents.append({"role": role, "parts": [{"text": text}]})
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": float(self.settings.temperature),
                "maxOutputTokens": int(self.settings.max_tokens),
            },
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        return payload

    def _headers(self) -> dict:
        return {
            "x-goog-api-key": self.settings.key_for("gemini"),
            "content-type": "application/json",
        }

    @staticmethod
    def _extract(data: dict) -> str:
        candidates = data.get("candidates") or []
        if not candidates:
            return ""
        parts = (candidates[0].get("content") or {}).get("parts") or []
        return "".join(str(part.get("text") or "") for part in parts)

    def stream(self, system: str, messages: list[dict], model: str,
               on_delta: Callable[[str], None], timeout: float) -> tuple[str, dict]:
        response = _request(self._url(model, True), self._payload(system, messages, model),
                            self._headers(), timeout)
        text = ""
        usage: dict = {}
        with response:
            for chunk in _iter_sse(response):
                delta = self._extract(chunk)
                if delta:
                    text += delta
                    on_delta(delta)
                if chunk.get("usageMetadata"):
                    usage = chunk["usageMetadata"]
        return text, usage

    def complete(self, system: str, messages: list[dict], model: str,
                 timeout: float) -> tuple[str, dict]:
        response = _request(self._url(model, False), self._payload(system, messages, model),
                            self._headers(), timeout)
        with response:
            data = json.loads(response.read().decode("utf-8", "replace"))
        return self._extract(data), data.get("usageMetadata") or {}


# ------------------------------------------------------- openai-compatible

class OpenAIProvider:
    name = "openai"

    def __init__(self, settings, flavour: str):
        self.settings = settings
        self.flavour = flavour  # openai | openrouter | groq | deepseek
        self.name = flavour

    def configured(self) -> bool:
        return bool(self.settings.key_for(self.flavour))

    def _base(self) -> str:
        override = getattr(self.settings, f"{self.flavour}_base", "") or ""
        return (override or DEFAULT_BASES.get(self.flavour, DEFAULT_BASES["openai"])).rstrip("/")

    def _headers(self) -> dict:
        headers = {
            "authorization": f"Bearer {self.settings.key_for(self.flavour)}",
            "content-type": "application/json",
        }
        if self.flavour == "openrouter":
            headers["http-referer"] = "http://127.0.0.1"
            headers["x-title"] = "JARVIS"
        return headers

    def _payload(self, system: str, messages: list[dict], model: str, stream: bool) -> dict:
        rows = [{"role": "system", "content": system}] if system else []
        for message in messages:
            role = message.get("role")
            if role not in ("user", "assistant"):
                continue
            content = str(message.get("content") or "")
            if content:
                rows.append({"role": role, "content": content})
        return {
            "model": model,
            "messages": rows,
            "temperature": float(self.settings.temperature),
            "max_tokens": int(self.settings.max_tokens),
            "stream": stream,
        }

    @staticmethod
    def _delta(data: dict) -> str:
        choices = data.get("choices") or []
        if not choices:
            return ""
        choice = choices[0]
        delta = choice.get("delta") or {}
        if isinstance(delta.get("content"), str):
            return delta["content"]
        message = choice.get("message") or {}
        if isinstance(message.get("content"), str):
            return message["content"]
        return ""

    def stream(self, system: str, messages: list[dict], model: str,
               on_delta: Callable[[str], None], timeout: float) -> tuple[str, dict]:
        response = _request(f"{self._base()}/chat/completions",
                            self._payload(system, messages, model, True),
                            self._headers(), timeout)
        text = ""
        usage: dict = {}
        with response:
            for chunk in _iter_sse(response):
                delta = self._delta(chunk)
                if delta:
                    text += delta
                    on_delta(delta)
                if chunk.get("usage"):
                    usage = chunk["usage"]
        return text, usage

    def complete(self, system: str, messages: list[dict], model: str,
                 timeout: float) -> tuple[str, dict]:
        response = _request(f"{self._base()}/chat/completions",
                            self._payload(system, messages, model, False),
                            self._headers(), timeout)
        with response:
            data = json.loads(response.read().decode("utf-8", "replace"))
        return self._delta(data), data.get("usage") or {}


# ------------------------------------------------------------------- local

class LocalProvider:
    """llama.cpp lanes from the existing Nova setup (OpenAI-compatible)."""

    name = "local"

    def __init__(self, settings):
        self.settings = settings

    def _lanes(self) -> list[tuple[str, str]]:
        return [
            (self.settings.fast_url, self.settings.fast_model or "local"),
            (self.settings.deep_url, "local"),
        ]

    def healthy(self, url: str, timeout: float = 2.0) -> bool:
        try:
            with _request(f"{url.rstrip('/')}/models", None, {}, timeout, method="GET"):
                return True
        except ProviderError:
            return False

    def configured(self) -> bool:
        return any(self.healthy(url) for url, _ in self._lanes())

    def _served_model(self, url: str) -> str:
        try:
            with _request(f"{url.rstrip('/')}/models", None, {}, 3.0, method="GET") as response:
                data = json.loads(response.read().decode("utf-8", "replace"))
            rows = data.get("data") or []
            if rows and rows[0].get("id"):
                return str(rows[0]["id"])
        except Exception:
            pass
        return "local"

    def stream(self, system: str, messages: list[dict], model: str,
               on_delta: Callable[[str], None], timeout: float) -> tuple[str, dict]:
        last_error: ProviderError | None = None
        for url, fallback_model in self._lanes():
            if not self.healthy(url):
                continue
            provider = _OpenAIShim(self.settings, url, self._served_model(url) or fallback_model)
            try:
                return provider.stream(system, messages, model, on_delta, timeout)
            except ProviderError as exc:
                last_error = exc
                continue
        raise last_error or ProviderError("Koi local model lane nahi chal raha.", retryable=False,
                                          provider="local")

    def complete(self, system: str, messages: list[dict], model: str,
                 timeout: float) -> tuple[str, dict]:
        last_error: ProviderError | None = None
        for url, fallback_model in self._lanes():
            if not self.healthy(url):
                continue
            provider = _OpenAIShim(self.settings, url, self._served_model(url) or fallback_model)
            try:
                return provider.complete(system, messages, model, timeout)
            except ProviderError as exc:
                last_error = exc
                continue
        raise last_error or ProviderError("Koi local model lane nahi chal raha.", retryable=False,
                                          provider="local")


class _OpenAIShim(OpenAIProvider):
    """OpenAI-compatible client for an explicit base URL (used by local lanes)."""

    def __init__(self, settings, base: str, model: str):
        super().__init__(settings, "local")
        self._explicit_base = base.rstrip("/")
        self._explicit_model = model
        self.name = "local"

    def _base(self) -> str:
        return self._explicit_base

    def _headers(self) -> dict:
        return {"content-type": "application/json"}

    def _payload(self, system, messages, model, stream):
        payload = super()._payload(system, messages, model, stream)
        payload["model"] = self._explicit_model
        return payload


# ------------------------------------------------------------------ router

class Router:
    """Picks a provider, retries a bounded number of times, and falls back."""

    def __init__(self, settings):
        self.settings = settings
        self.breaker = Breaker()
        self.gemini = GeminiProvider(settings)
        self.local = LocalProvider(settings)
        self.openai_family = {name: OpenAIProvider(settings, name)
                              for name in ("openai", "openrouter", "groq", "deepseek")}
        self.last_used: str = ""

    # ------------------------------------------------------------ ordering

    def chain(self) -> list:
        mode = (self.settings.provider_mode or "auto").lower()
        rows: list = []
        if mode in ("auto", ""):
            rows = [self.gemini] + list(self.openai_family.values()) + [self.local]
        elif mode == "gemini":
            rows = [self.gemini, self.local]
        elif mode == "local":
            rows = [self.local]
        elif mode in self.openai_family:
            rows = [self.openai_family[mode], self.local]
        elif mode == "offline":
            rows = []
        else:
            rows = [self.gemini, self.local]
        return [row for row in rows if row.configured() and self.breaker.available(row.name)]

    def model_for(self, provider) -> str:
        mode = (self.settings.provider_mode or "auto").lower()
        explicit = self.settings.model
        if provider.name == "gemini":
            if mode == "gemini" and explicit:
                return explicit
            return explicit if explicit.startswith("gemini") else DEFAULT_MODELS["gemini"]
        if provider.name == "local":
            return self.settings.fast_model or "local"
        flavour = getattr(provider, "flavour", provider.name)
        if flavour in DEFAULT_MODELS and mode == flavour:
            return explicit if explicit and not explicit.startswith("gemini") else DEFAULT_MODELS[flavour]
        if explicit and not explicit.startswith("gemini") and flavour in DEFAULT_MODELS:
            return explicit
        return DEFAULT_MODELS.get(flavour, explicit)

    # -------------------------------------------------------------- status

    def status(self) -> dict:
        rows = []
        for provider in [self.gemini] + list(self.openai_family.values()) + [self.local]:
            configured = False
            try:
                configured = provider.configured()
            except Exception:
                configured = False
            rows.append({
                "name": provider.name,
                "configured": configured,
                "available": bool(configured and self.breaker.available(provider.name)),
                "model": self.model_for(provider) if configured else "",
            })
        chain = [provider.name for provider in self.chain()]
        return {
            "mode": self.settings.provider_mode,
            "chain": chain,
            "active": chain[0] if chain else "offline",
            "providers": rows,
            "breaker": self.breaker.state(),
        }

    # --------------------------------------------------------------- calls

    def _attempt(self, provider, system, messages, timeout, on_delta):
        model = self.model_for(provider)
        started = time.time()
        attempts = []
        tries = max(0, int(self.settings.retries)) + 1
        for attempt in range(tries):
            tries_left = tries - attempt
            try:
                if on_delta is not None:
                    text, usage = provider.stream(system, messages, model, on_delta, timeout)
                else:
                    text, usage = provider.complete(system, messages, model, timeout)
                self.breaker.record_success(provider.name)
                return Reply(
                    text=text,
                    provider=provider.name,
                    model=model,
                    latency_ms=int((time.time() - started) * 1000),
                    usage=usage,
                    attempts=attempts,
                )
            except ProviderError as exc:
                attempts.append({"provider": provider.name, "error": str(exc)[:200],
                                 "status": exc.status, "attempt": attempt + 1})
                self.breaker.record_failure(provider.name)
                if not exc.retryable or tries_left <= 1:
                    raise
                time.sleep(min(2.0, 0.4 * (2 ** attempt)))
            except Exception as exc:  # unexpected: do not retry forever
                attempts.append({"provider": provider.name, "error": f"{type(exc).__name__}: {exc}"[:200],
                                 "attempt": attempt + 1})
                self.breaker.record_failure(provider.name)
                raise ProviderError(f"{type(exc).__name__}: {exc}", retryable=False,
                                    provider=provider.name) from None
        raise ProviderError("provider call exhausted", retryable=False)

    def complete(self, system: str, messages: list[dict], on_delta=None) -> Reply:
        chain = self.chain()
        if not chain:
            raise ProviderError("Koi model configured nahi hai. Settings me API key daalo "
                                "ya local llama-server start karo.", retryable=False)
        errors = []
        for provider in chain:
            try:
                reply = self._attempt(provider, system, messages, float(self.settings.timeout), on_delta)
                reply.attempts = errors + reply.attempts
                if reply.text.strip():
                    self.last_used = provider.name
                    return reply
                errors.append({"provider": provider.name, "error": "empty reply"})
            except ProviderError as exc:
                errors.append({"provider": provider.name, "error": exc.friendly(), "status": exc.status})
                continue
        detail = "; ".join(f"{row['provider']}: {row['error']}" for row in errors[-3:])
        raise ProviderError(f"Sab providers fail hue — {detail}", retryable=False)
