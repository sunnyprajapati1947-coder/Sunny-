"""The neural brain: Gemini REST → local Qwen lane → offline core.

No SDKs, no cloud requirement. If a provider is unreachable the assistant keeps
working with the deterministic intent engine and the offline personality.
"""
from __future__ import annotations

import base64
import json
import mimetypes
import re
import threading
import time
from pathlib import Path

from jarvis import net, tools
from jarvis.config import get_settings
from jarvis.local_brain import get_local_brain
from jarvis.util import now, spoken_date, spoken_time, strip_markdown, truncate

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

PERSONA = (
    "You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), a calm, precise, "
    "dry-witted British AI assistant built by {owner}. Address the user as {owner} "
    "(or 'Sir' when natural). Keep spoken answers under 60 words unless asked for detail. "
    "You are helpful, technically excellent and never sycophantic. "
    "Never claim an action happened unless you requested the matching tool. "
    "Current local time: {date}, {time} ({tz}). User's city: {city}. "
)

PLANNER_RULES = """
Respond with ONE JSON object and nothing else.
- To use a capability, respond:
  {"tool": "<tool name>", "arguments": { ... }, "say": "<short spoken line>"}
- Otherwise respond:
  {"reply": "<your answer>"}
Rules: use only the tools listed below; arguments must match their schema; do not invent tools;
do not put markdown or code fences around the JSON; never claim a tool ran unless you call it.
Available tools:
{tools}
"""


class Brain:
    def __init__(self, settings=None):
        self._lock = threading.RLock()
        self._provider_fail: dict[str, float] = {}
        self.last_provider = "offline"
        self.last_error = ""

    # ----------------------------------------------------------------- probe
    def _settings(self):
        return get_settings()

    def gemini_available(self) -> bool:
        settings = self._settings()
        return bool(settings.llm_enabled and settings.gemini_key)

    def qwen_available(self) -> bool:
        """True when at least one local Qwen lane answers."""
        settings = self._settings()
        if not settings.llm_enabled:
            return False
        return bool(self.local.status().get("online"))

    @property
    def local(self):
        return get_local_brain()

    def brain_mode(self) -> str:
        return str(getattr(self._settings(), "brain_mode", "auto") or "auto").lower()

    def vision_available(self) -> bool:
        return self.gemini_available()

    def status(self) -> dict:
        settings = self._settings()
        local = self.local.status()
        preferred = self.brain_mode()
        mode = "offline"
        if settings.llm_enabled:
            if preferred == "gemini" and settings.gemini_key:
                mode = "gemini"
            elif preferred == "local" and local.get("online"):
                mode = "local"
            elif preferred == "offline":
                mode = "offline"
            elif settings.gemini_key:
                mode = "gemini"
            elif local.get("online"):
                mode = "local"
        return {
            "enabled": settings.llm_enabled,
            "mode": mode,
            "preferred": preferred,
            "gemini": bool(settings.gemini_key),
            "gemini_model": settings.gemini_model,
            "qwen_url": settings.qwen_url,
            "qwen_model": settings.qwen_model,
            "fast_qwen_url": settings.fast_qwen_url,
            "coder_qwen_model": getattr(settings, "coder_qwen_model", ""),
            "local": local,
            "lanes": local.get("lanes", []),
            "last_provider": self.last_provider,
            "vision": self.vision_available(),
            "last_error": self.last_error,
        }

    def _recently_failed(self, provider: str, seconds: float = 25.0) -> bool:
        stamp = self._provider_fail.get(provider, 0.0)
        return time.time() - stamp < seconds

    def _mark_failed(self, provider: str, error: str = "") -> None:
        self._provider_fail[provider] = time.time()
        if error:
            self.last_error = error[:300]

    # -------------------------------------------------------------- providers
    def _gemini(
        self,
        system: str,
        user: str,
        *,
        image: dict | None = None,
        json_mode: bool = False,
        timeout: float = 14.0,
    ) -> tuple[str | None, str]:
        settings = self._settings()
        if not settings.gemini_key:
            return None, ""

        parts: list[dict] = [{"text": user}]
        if image:
            parts.append({"inlineData": image})

        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "temperature": 0.45,
                "maxOutputTokens": 700,
            },
            "safetySettings": [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
            ],
        }
        if json_mode:
            payload["generationConfig"]["responseMimeType"] = "application/json"

        models = [settings.gemini_model, *settings.gemini_fallback_models]
        headers = {"x-goog-api-key": settings.gemini_key}
        last_error = ""
        for model in models:
            try:
                data = net.post_json(
                    GEMINI_ENDPOINT.format(model=model),
                    payload,
                    timeout=timeout,
                    headers=headers,
                )
            except net.NetError as exc:
                last_error = f"{model}: {exc}"
                continue

            candidates = (data or {}).get("candidates") or []
            if not candidates:
                feedback = (data or {}).get("promptFeedback") or {}
                last_error = str(feedback.get("blockReason") or "empty response")
                continue
            content = candidates[0].get("content") or {}
            chunks = [
                part.get("text", "")
                for part in (content.get("parts") or [])
                if isinstance(part, dict)
            ]
            text = "".join(chunks).strip()
            if text:
                return text, "gemini"
            last_error = "empty candidate"
        self._mark_failed("gemini", last_error)
        return None, ""

    def _qwen(
        self,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
        timeout: float = 30.0,
        task: str = "general",
    ) -> tuple[str | None, str]:
        settings = self._settings()
        if not settings.llm_enabled:
            return None, ""
        local = self.local
        if not local.available():
            return None, ""
        prompt = user
        if json_mode:
            prompt += "\n\nReturn one JSON object and nothing else."
        text, provider = local.chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            task=task,
            temperature=0.35 if json_mode else 0.45,
            max_tokens=900 if task in {"plan", "deep", "code"} else 600,
            timeout=max(20.0, timeout),
        )
        if text:
            return text, provider or "local"
        self._mark_failed("local", getattr(local, "last_error", "local lane unavailable"))
        return None, ""

    def complete(
        self,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
        timeout: float = 20.0,
        task: str = "general",
    ) -> tuple[str | None, str]:
        settings = self._settings()
        if not settings.llm_enabled:
            return None, "offline"
        preferred = self.brain_mode()

        if preferred == "offline":
            self.last_provider = "offline"
            return None, "offline"

        use_gemini = preferred in {"auto", "gemini"} and bool(settings.gemini_key)
        use_local = preferred in {"auto", "local", "gemini"}

        if use_gemini and not self._recently_failed("gemini", 20):
            text, _ = self._gemini(system, user, json_mode=json_mode, timeout=timeout)
            if text:
                self.last_provider = "gemini"
                return text, "gemini"
            if preferred == "gemini" and not use_local:
                self.last_provider = "offline"
                return None, "offline"

        if use_local and not self._recently_failed("local", 8):
            text, provider = self._qwen(
                system,
                user,
                json_mode=json_mode,
                timeout=timeout,
                task=task,
            )
            if text:
                self.last_provider = provider
                return text, provider

        self.last_provider = "offline"
        return None, "offline"

    # ---------------------------------------------------------------- planner
    def system_prompt(self, memory: list[dict] | None = None, context: str = "") -> str:
        settings = self._settings()
        current = now()
        base = PERSONA.format(
            owner=settings.owner,
            date=spoken_date(current),
            time=spoken_time(current),
            tz=current.astimezone().strftime("%Z") or "local",
            city=settings.city,
        )
        facts = memory or []
        if facts:
            joined = "; ".join(f"{item.get('key')}: {item.get('value')}" for item in facts[-16:])
            base += f" Durable facts you remember: {joined}."
        if context:
            base += "\n\nRelevant local context (cite paths when you use it):\n" + truncate(context, 4000)
        if getattr(settings, "adhd_mode", False):
            base += (
                " The owner asked for ADHD-friendly output: lead with the next action, "
                "number steps, keep replies under 90 words, end with one concrete next step."
            )
        if settings.llm_tools:
            base += PLANNER_RULES.replace("{tools}", json.dumps(tools.schema_for_llm(), ensure_ascii=False))
        return base

    def _history_block(self, history: list[dict] | None) -> str:
        if not history:
            return ""
        lines = []
        for entry in history[-6:]:
            role = "User" if entry.get("role") == "user" else "JARVIS"
            lines.append(f"{role}: {truncate(entry.get('text', ''), 300)}")
        return "Recent conversation:\n" + "\n".join(lines) + "\n\n"

    def plan(
        self,
        text: str,
        history: list[dict] | None = None,
        memory: list[dict] | None = None,
        timeout: float = 30.0,
        context: str = "",
        task: str = "plan",
    ) -> dict | None:
        settings = self._settings()
        if not settings.llm_enabled:
            return None
        system = self.system_prompt(memory, context=context)
        user = self._history_block(history) + f"User: {text}"
        raw, provider = self.complete(
            system,
            user,
            json_mode=settings.llm_tools,
            timeout=timeout,
            task=task,
        )
        if not raw:
            return None
        parsed = parse_plan(raw)
        parsed["provider"] = provider
        return parsed

    # ----------------------------------------------------------------- vision
    def vision(self, image: str, question: str = "") -> dict:
        settings = self._settings()
        parsed = self._decode_image(image)
        if not parsed:
            return {"ok": False, "error": "That image could not be decoded."}
        mime, b64 = parsed
        prompt = question or "Describe this image concisely."
        system = (
            f"You are J.A.R.V.I.S., {settings.owner}'s assistant. Describe images accurately, "
            "concisely and helpfully. Address the user as Sir. Do not invent details."
        )
        if settings.gemini_key:
            text, provider = self._gemini(
                system,
                prompt,
                image={"mimeType": mime, "data": b64},
                timeout=20.0,
            )
            if text:
                return {"ok": True, "text": text.strip(), "provider": provider}

        # Local fallback: Qwen-VL served by Ollama / llama.cpp on the deep lane.
        text, provider = self.local.vision(image, prompt)
        if text:
            return {"ok": True, "text": text.strip(), "provider": provider}
        return {
            "ok": False,
            "error": (
                "Vision needs either GEMINI_API_KEY or a local Qwen-VL model "
                "(`ollama pull qwen2.5vl:7b` on the deep lane)."
            ),
        }

    def vision_file(self, path: Path, question: str = "") -> dict:
        try:
            raw = Path(path).read_bytes()
        except OSError as exc:
            return {"ok": False, "error": f"Cannot read image: {exc}"}
        mime = mimetypes.guess_type(str(path))[0] or "image/png"
        data = f"data:{mime};base64," + base64.b64encode(raw).decode("ascii")
        return self.vision(data, question)

    @staticmethod
    def _decode_image(image: str) -> tuple[str, str] | None:
        text = str(image or "").strip()
        if not text:
            return None
        mime = "image/png"
        if text.startswith("data:"):
            header, _, payload = text.partition(",")
            if ";base64" not in header:
                return None
            mime = header[5:].split(";")[0] or "image/png"
            text = payload
        try:
            base64.b64decode(text, validate=True)
        except Exception:
            return None
        if len(text) > 12_000_000:
            return None
        return mime, text


def parse_plan(raw: str) -> dict:
    """Parse a planner response defensively."""
    text = str(raw or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    payload = None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            try:
                payload = json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                payload = None

    if isinstance(payload, dict):
        tool_name = payload.get("tool") or payload.get("action")
        if tool_name:
            arguments = payload.get("arguments") or payload.get("args") or {}
            if isinstance(arguments, dict):
                return {
                    "kind": "tool",
                    "tool": str(tool_name),
                    "arguments": arguments,
                    "say": str(payload.get("say") or payload.get("speech") or "").strip(),
                }
        reply_text = payload.get("reply") or payload.get("text") or payload.get("answer")
        if reply_text:
            return {"kind": "reply", "text": str(reply_text).strip()}

    cleaned = strip_markdown(text)
    return {"kind": "reply", "text": cleaned or text}


_BRAIN: Brain | None = None
_BRAIN_LOCK = threading.RLock()


def get_brain() -> Brain:
    global _BRAIN
    with _BRAIN_LOCK:
        if _BRAIN is None:
            _BRAIN = Brain()
        return _BRAIN
