"""OpenAI-compatible chat clients.

Local lane: your llama.cpp `llama-server` (default http://127.0.0.1:8081/v1, no key).
Online lane: optional, OFF by default, any OpenAI-compatible provider with a key from secrets.env.
The router always tries local first and only uses online when it is explicitly enabled.
"""

from __future__ import annotations

import json
import re
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass

from nova.config import Config
from nova.util import redact


class LLMError(Exception):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind  # connect | timeout | http | bad_response | not_configured


@dataclass
class ChatReply:
    text: str
    lane: str
    model: str


def strip_reasoning(text: str) -> str:
    """Remove <think> blocks some local Qwen builds emit, including an unterminated one."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    if "<think>" in text:
        text = text.split("<think>", 1)[0]
    return text.strip()


class ChatClient:
    def __init__(self, lane: str, base_url: str, model: str, timeout: float, api_key: str = "",
                 disable_thinking: bool = False, max_tokens: int = 384, temperature: float = 0.3):
        self.lane = lane
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.api_key = api_key
        self.disable_thinking = disable_thinking
        self.max_tokens = max_tokens
        self.temperature = temperature

    def _headers(self) -> dict:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def chat(self, messages: list[dict], max_tokens: int | None = None) -> ChatReply:
        payload: dict = {"model": self.model, "messages": messages, "stream": False,
                         "temperature": self.temperature, "max_tokens": max_tokens or self.max_tokens}
        if self.disable_thinking and self.lane == "local":
            payload["chat_template_kwargs"] = {"enable_thinking": False}
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.base_url + "/chat/completions", data=data, headers=self._headers(),
                                     method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8", errors="replace"))
        except urllib.error.HTTPError as exc:
            detail = redact(exc.read().decode("utf-8", errors="replace")[:200])
            kind = "context" if "exceed" in detail.lower() and "context" in detail.lower() else "http"
            raise LLMError(kind, f"{self.lane} HTTP {exc.code}: {detail}") from exc
        except (socket.timeout, TimeoutError) as exc:
            raise LLMError("timeout", f"{self.lane} model timed out after {self.timeout:.0f}s") from exc
        except urllib.error.URLError as exc:
            kind = "timeout" if isinstance(exc.reason, (socket.timeout, TimeoutError)) else "connect"
            raise LLMError(kind, f"{self.lane} model unreachable at {self.base_url} ({exc.reason})") from exc
        except ValueError as exc:
            raise LLMError("bad_response", f"{self.lane} returned non-JSON") from exc
        try:
            text = body["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("bad_response", f"{self.lane} response had no message content") from exc
        text = strip_reasoning(text)
        if not text:
            raise LLMError("bad_response", f"{self.lane} returned an empty answer")
        return ChatReply(text=text, lane=self.lane, model=self.model)

    def health(self, timeout: float = 3.0) -> tuple[bool, str]:
        req = urllib.request.Request(self.base_url + "/models", headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status == 200, f"HTTP {resp.status}"
        except urllib.error.HTTPError as exc:
            return False, f"HTTP {exc.code}"
        except (urllib.error.URLError, OSError, ValueError) as exc:
            return False, f"unreachable ({getattr(exc, 'reason', exc)})"


class Router:
    """Local-first routing with optional, explicit online fallback."""

    def __init__(self, config: Config, local: ChatClient | None = None, online: ChatClient | None = None):
        cfg = config
        self.local = local or ChatClient("local", cfg.llm.base_url, cfg.llm.model, cfg.llm.timeout,
                                         disable_thinking=cfg.llm.disable_thinking,
                                         max_tokens=cfg.llm.max_tokens, temperature=cfg.llm.temperature)
        if online is None and cfg.online_ready():
            online = ChatClient("online", cfg.online.base_url, cfg.online.model, cfg.online.timeout,
                                api_key=cfg.online_api_key(), max_tokens=cfg.llm.max_tokens,
                                temperature=cfg.llm.temperature)
        self.online = online

    def chat(self, messages: list[dict]) -> ChatReply:
        try:
            return self.local.chat(messages)
        except LLMError as local_error:
            if self.online is None:
                raise
            try:
                return self.online.chat(messages)
            except LLMError as online_error:
                raise LLMError(online_error.kind, f"{local_error}; fallback also failed: {online_error}") from online_error

    def status(self) -> dict:
        ok_local, detail_local = self.local.health()
        out = {"local": {"ok": ok_local, "detail": detail_local, "url": self.local.base_url}}
        if self.online is not None:
            out["online"] = {"ok": None, "detail": "configured (not pinged to save quota)", "url": self.online.base_url}
        return out
