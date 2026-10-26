"""The orchestrator: one execution path for intents, the brain and the HUD.

Everything the assistant can *do* flows through :meth:`JarvisCore.call`, so the
deterministic intent parser, the LLM planner and the HTTP API all share the same
argument validation, approval gate and audit trail.
"""
from __future__ import annotations

import inspect
import threading
import time
from typing import Any

from jarvis import CODENAME, __version__, sysinfo, tools
from jarvis.brain import get_brain
from jarvis.chat import fallback as chat_fallback
from jarvis.chat import smalltalk
from jarvis.chat import suggestions as chat_suggestions
from jarvis.intents import Intent, match as match_intent
from jarvis.scheduler import Scheduler
from jarvis.security import AGATE, AUDIT, check_user_text
from jarvis.skills import vision as vision_skill
from jarvis.store import Store, get_store, set_store
from jarvis.util import reply, strip_markdown, truncate

FULL_NAME = "Just A Rather Very Intelligent System"
CANCEL_WORDS = {
    "cancel",
    "never mind",
    "nevermind",
    "forget it",
    "stop",
    "chhod do",
    "chhodo",
    "rehne do",
    "no",
    "nahi",
}
AWAIT_TTL = 240.0


class JarvisCore:
    """Stateful assistant core shared by the HTTP server and the CLI."""

    def __init__(self, store: Store | None = None, brain: Any = None) -> None:
        self.store = set_store(store) if store is not None else get_store()
        self.brain = brain if brain is not None else get_brain()
        self.gate = AGATE
        self.audit = AUDIT
        self.scheduler = Scheduler(self)
        self.started_at = time.time()
        self._awaiting: dict[str, dict] = {}
        self._lock = threading.RLock()
        self._commands = 0

    # ------------------------------------------------------------- lifecycle
    def start(self) -> None:
        self.scheduler.start()
        self.audit.record("core_start", version=__version__, pid=None)

    def stop(self) -> None:
        self.scheduler.stop()

    # ----------------------------------------------------------------- input
    def handle(self, text: str, source: str = "text") -> dict:
        started = time.perf_counter()
        cleaned = str(text or "").strip()[:1500]
        if not cleaned:
            return self._envelope(
                reply("I did not catch that, Sir.", speech="I did not catch that, Sir."),
                intent="empty",
                provider="offline",
                started=started,
                source=source,
            )

        blocked, reason = check_user_text(cleaned)
        if blocked:
            self.audit.record("command_blocked", text=cleaned[:240], reason=reason)
            return self._envelope(
                reply(
                    f"Negative, Sir. That request falls outside my safety envelope ({reason}). "
                    "I will not damage this machine or its data.",
                    speech="I will not do that, Sir. It falls outside my safety envelope.",
                    cards=[{"type": "text", "title": "SAFETY ENVELOPE", "body": f"Blocked: {reason}."}],
                    data={"blocked": True, "reason": reason},
                ),
                intent="safety",
                provider="security",
                started=started,
                source=source,
            )

        self._commands += 1
        self.store.append_history("user", cleaned, source=source)

        follow_up = self._take_awaiting(source, cleaned)
        if follow_up is not None:
            payload, intent_name, provider, tool_name = follow_up
            self._remember_awaiting(source, payload)
            return self._envelope(
                payload,
                intent=intent_name,
                tool=tool_name,
                provider=provider,
                started=started,
                source=source,
            )

        intent = match_intent(cleaned)
        payload, intent_name, provider, tool_name = self._resolve(cleaned, intent)
        self._remember_awaiting(source, payload)
        return self._envelope(
            payload,
            intent=intent_name,
            tool=tool_name,
            provider=provider,
            started=started,
            source=source,
        )

    def _resolve(self, text: str, intent: Intent | None) -> tuple[dict, str, str, str | None]:
        if intent is not None:
            if intent.kind == "ui":
                return self._ui(intent.name), intent.name, "intent", None
            if intent.kind == "reply":
                spoken = intent.args.get("speech")
                payload = reply(
                    str(intent.args.get("text") or ""),
                    speech=None if spoken is None else str(spoken),
                )
                return payload, intent.label, "offline", None
            if intent.kind == "chat":
                return smalltalk(intent.name, intent.args), intent.label, "intent", None
            if intent.soft and self._brain_ready():
                planned = self._plan(text, timeout=10.0)
                if planned is not None:
                    return planned
            return (
                self.call(intent.name, intent.args, provider="intent"),
                intent.label,
                "intent",
                intent.name,
            )

        if self._brain_ready():
            planned = self._plan(text, timeout=14.0)
            if planned is not None:
                return planned
        return chat_fallback(text), "conversation", "offline", None

    def _brain_ready(self) -> bool:
        try:
            settings = self._settings
            if not settings.llm_enabled or not settings.llm_tools:
                return False
            return bool(self.brain.gemini_available() or self.brain.qwen_available())
        except Exception:
            return False

    def _plan(self, text: str, timeout: float = 12.0) -> tuple[dict, str, str, str | None] | None:
        try:
            plan = self.brain.plan(
                text,
                history=self.store.history(8),
                memory=self.store.facts(12),
                timeout=timeout,
            )
        except Exception:
            return None
        if not plan:
            return None
        provider = str(plan.get("provider") or "local")
        if plan.get("kind") == "tool":
            name = str(plan.get("tool") or "")
            if name not in tools.TOOLS:
                return None
            payload = self.call(name, plan.get("arguments") or {}, provider=provider)
            say = str(plan.get("say") or "").strip()
            if say:
                speech = str(payload.get("speech") or "").strip()
                payload["speech"] = say if not speech else f"{say} {speech}"
            return payload, name, provider, name
        answer = strip_markdown(str(plan.get("text") or "")).strip()
        if not answer:
            return None
        return reply(answer), "conversation", provider, None

    # ------------------------------------------------------------------ ui
    def _ui(self, action: str) -> dict:
        if action == "stop_speech":
            return reply("As you wish, Sir.", speech="", action={"type": "stop_speech"})
        if action == "clear_chat":
            self.store.clear_history()
            return reply("", speech="", action={"type": "clear_chat"})
        if action == "repeat":
            for entry in reversed(self.store.history(20)):
                if entry.get("role") == "assistant" and entry.get("text"):
                    line = str(entry["text"])
                    return reply(line, speech=line, data={"repeated": True})
            return reply("I have not said anything yet, Sir.", speech="I have not said anything yet, Sir.")
        if action == "standby":
            return reply(
                "Standing by, Sir. The reactor stays warm.",
                speech="Standing by, Sir.",
                action={"type": "standby"},
            )
        return reply("Understood, Sir.", speech="Understood, Sir.")

    # ---------------------------------------------------------------- tools
    def call(
        self,
        name: str,
        arguments: dict | None = None,
        *,
        approved: bool = False,
        provider: str = "intent",
    ) -> dict:
        started = time.perf_counter()
        tool = tools.TOOLS.get(str(name))
        if tool is None:
            return reply(
                f"I do not have a capability called “{name}”, Sir.",
                speech="I do not have that capability, Sir.",
            )

        args = dict(arguments or {})
        ok, reason = tools.validate(tool, args)
        if not ok:
            self.audit.record("tool_invalid", tool=tool.name, error=reason)
            return reply(
                f"I could not run that, Sir — {reason.rstrip('.').lower()}.",
                speech="I could not run that, Sir.",
            )

        if tool.high_impact and not approved:
            blocker = self._preflight(tool, args)
            if blocker is not None:
                return blocker
            action = self.gate.request(tool.name, args)
            self.audit.record(
                "approval_requested",
                tool=tool.name,
                arguments=args,
                summary=action.summary,
            )
            owner = self._settings.owner
            return {
                "text": f"{action.summary}. Authorization required, {owner}.",
                "speech": f"I need your authorization, {owner}. {action.summary}.",
                "cards": [],
                "action": None,
                "approval": {
                    "token": action.token,
                    "tool": tool.name,
                    "summary": action.summary,
                    "expires_in": action.expires_in(),
                },
                "data": {"pending_action": action.summary, "tool": tool.name},
            }

        try:
            payload = tool.run(**args)
        except TypeError as exc:
            self.audit.record("tool_error", tool=tool.name, error=f"{type(exc).__name__}: {exc}")
            return reply(
                "My module for that is miswired, Sir. I have logged the fault.",
                speech="That module is miswired, Sir.",
            )
        except Exception as exc:  # noqa: BLE001 - tools must never crash the core
            self.audit.record("tool_error", tool=tool.name, error=f"{type(exc).__name__}: {exc}")
            return reply(
                f"Something failed inside that module, Sir ({type(exc).__name__}).",
                speech="Something failed inside that module, Sir.",
            )

        duration = int((time.perf_counter() - started) * 1000)
        self.audit.record("tool_executed", tool=tool.name, ok=True, duration_ms=duration)
        if not isinstance(payload, dict):
            payload = reply(str(payload))
        payload.setdefault("text", "")
        payload.setdefault("speech", payload.get("text") or "")
        payload.setdefault("cards", [])
        payload.setdefault("data", {})
        return payload

    @staticmethod
    def _preflight(tool: tools.Tool, args: dict) -> dict | None:
        if tool.preflight is None:
            return None
        try:
            signature = inspect.signature(tool.preflight)
            accepted = {
                key: value
                for key, value in args.items()
                if key in signature.parameters
                or any(p.kind is inspect.Parameter.VAR_KEYWORD for p in signature.parameters.values())
            }
            result = tool.preflight(**accepted)
        except Exception:
            return None
        return result if isinstance(result, dict) else None

    # -------------------------------------------------------------- approval
    def approve(self, token: str) -> dict:
        started = time.perf_counter()
        action = self.gate.resolve(str(token or ""))
        if action is None:
            return self._envelope(
                reply(
                    "That authorization has expired or was already used, Sir.",
                    speech="That authorization has expired, Sir.",
                ),
                intent="approval",
                provider="security",
                started=started,
            )
        self.audit.record("approval_granted", tool=action.tool, summary=action.summary)
        payload = self.call(action.tool, action.arguments, approved=True, provider="approval")
        envelope = self._envelope(
            payload,
            intent="approval",
            tool=action.tool,
            provider="approval",
            started=started,
        )
        envelope["meta"]["approved"] = True
        return envelope

    def deny(self, token: str) -> dict:
        started = time.perf_counter()
        action = self.gate.deny(str(token or ""))
        self.audit.record("approval_denied", tool=action.tool if action else None)
        summary = action.summary if action else "that action"
        return self._envelope(
            reply(
                f"Standing down, Sir. I will not {summary[0].lower() + summary[1:] if summary else 'proceed'}.",
                speech="Standing down, Sir.",
                data={"denied": True},
            ),
            intent="approval",
            provider="security",
            started=started,
        )

    # ---------------------------------------------------------------- vision
    def vision(self, image: str, question: str = "") -> dict:
        started = time.perf_counter()
        payload = vision_skill.describe_image(image, question)
        return self._envelope(
            payload,
            intent="vision",
            tool="vision",
            provider="vision",
            started=started,
            source="vision",
        )

    # ----------------------------------------------------------------- state
    def status(self) -> dict:
        settings = self._settings
        try:
            metrics = sysinfo.metrics()
        except Exception:
            metrics = {}
        try:
            brain_status = self.brain.status()
        except Exception:
            brain_status = {"mode": "offline"}
        categories = {
            category: len(items) for category, items in tools.by_category().items()
        }
        return {
            "name": "J.A.R.V.I.S.",
            "full_name": FULL_NAME,
            "version": __version__,
            "codename": CODENAME,
            "owner": settings.owner,
            "city": settings.city,
            "language": settings.language,
            "metrics": metrics,
            "brain": brain_status,
            "tools": len(tools.TOOLS),
            "tool_categories": categories,
            "scheduler": self.scheduler.pending(),
            "stats": self.store.stats(),
            "settings": settings.public(),
            "uptime": int(time.time() - self.started_at),
            "session_uptime": int(time.time() - self.started_at),
            "awaiting": len(self._awaiting),
            "gate": {"pending": len(self.gate.pending())},
            "now": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "host": metrics.get("host"),
            "platform": metrics.get("platform"),
        }

    def suggestions(self) -> list[dict]:
        try:
            return chat_suggestions()
        except Exception:
            return [{"label": label, "id": label.lower().replace(" ", "-")} for label in (
                "Brief me",
                "Status report",
                "Weather",
                "Set a 5 minute timer",
                "Tell me a joke",
                "Play music",
            )]

    # -------------------------------------------------------------- awaiting
    def _take_awaiting(
        self, source: str, text: str
    ) -> tuple[dict, str, str, str | None] | None:
        with self._lock:
            entry = self._awaiting.get(source)
            if not entry:
                return None
            if time.time() - entry.get("ts", 0) > AWAIT_TTL:
                self._awaiting.pop(source, None)
                return None
            lowered = text.lower().strip(" .!?")
            if lowered in CANCEL_WORDS:
                self._awaiting.pop(source, None)
                return (
                    reply("Cancelled, Sir.", speech="Cancelled, Sir."),
                    "awaiting",
                    "intent",
                    None,
                )
            if entry["kind"] == "whatsapp":
                self._awaiting.pop(source, None)
                payload = self.call(
                    "whatsapp_send",
                    {
                        "contact": entry.get("number") or entry.get("contact") or "",
                        "message": text,
                    },
                    provider="intent",
                )
                return payload, "whatsapp_send", "intent", "whatsapp_send"
            if entry["kind"] == "reminder_time":
                self._awaiting.pop(source, None)
                payload = self.call(
                    "reminder_add",
                    {"text": entry.get("text") or "", "when": text},
                    provider="intent",
                )
                return payload, "reminder_add", "intent", "reminder_add"
        return None

    def _remember_awaiting(self, source: str, payload: dict) -> None:
        data = payload.get("data") if isinstance(payload, dict) else None
        data = data or {}
        with self._lock:
            if data.get("needs_message"):
                self._awaiting[source] = {
                    "kind": "whatsapp",
                    "contact": data.get("contact"),
                    "number": data.get("number"),
                    "label": data.get("label"),
                    "ts": time.time(),
                }
            elif data.get("needs_time"):
                self._awaiting[source] = {
                    "kind": "reminder_time",
                    "text": data.get("text") or "",
                    "ts": time.time(),
                }
            else:
                self._awaiting.pop(source, None)

    # --------------------------------------------------------------- envelope
    def _envelope(
        self,
        payload: dict,
        *,
        intent: str | None,
        provider: str,
        started: float,
        source: str = "text",
        tool: str | None = None,
    ) -> dict:
        payload = payload if isinstance(payload, dict) else reply(str(payload))
        provider = str(payload.pop("provider", provider) or provider)
        tool_name = payload.pop("tool", None) or tool
        text = str(payload.get("text") or "")
        speech = payload.get("speech")
        speech = text if speech is None else str(speech)
        cards = payload.get("cards") or []
        envelope = {
            "ok": True,
            "reply": text,
            "speech": speech,
            "cards": cards,
            "action": payload.get("action"),
            "approval": payload.get("approval"),
            "data": payload.get("data") or {},
            "meta": {
                "intent": intent,
                "tool": tool_name,
                "provider": provider,
                "ms": int((time.perf_counter() - started) * 1000),
                "source": source,
            },
        }
        if text:
            try:
                self.store.append_history(
                    "assistant",
                    text,
                    intent=intent,
                    tool=tool_name or "",
                    provider=provider,
                )
            except Exception:
                pass
        return envelope

    # --------------------------------------------------------------- helpers
    @property
    def _settings(self):
        from jarvis.config import get_settings

        return get_settings()
