"""Nova Gemini agent — tool-calling loop (LiveKit-Friday pattern, phone par).

"Build Friday With Claude Code" guide ka asli idea: agent ko tools ke
declarations do, model KHUD decide karta hai kaunsa tool chalana hai,
result wapas model ko jata hai, phir final jawab. LiveKit version me
OpenAI+Deepgram+ElevenLabs+cloud workers lagte hain — Nova wahi pattern
sirf ek free Gemini key aur apne secure tool registry se karta hai:

    user: "dhanbad ka mausam aur battery kitni hai?"
      -> Gemini: functionCall api_weather{location: "dhanbad"}
      -> Nova registry execute (audit + validation + kill switch)
      -> Gemini: functionCall phone_battery{}
      -> Nova registry execute
      -> Gemini: "Boss, Dhanbad me 31 degree hai, battery 84%..."

Security (LiveKit guide me nahi tha, Nova me hai):
- Sirf curated allowlist ke tools declare hote hain (koi high-impact nahi).
- Model jo bhi maange, execution hamesha registry se — validation, audit,
  kill switch sab lagta hai. Allowlist ke bahar ka naam = saaf mana.
- Bounded rounds (default 3) — phone data aur patience dono bachte hain.
- Tool output truncated (1800 chars) — context economy.

Env:
    NOVA_AGENT_ENABLED  = 1|on (default) | 0|off  (off = plain chat lane)
    NOVA_AGENT_TOOLS    = comma-separated tool names (allowlist override)
    NOVA_AGENT_MAX_ROUNDS = int (default 3)
"""
from __future__ import annotations

import json
import os
from typing import Any

from core import gemini_lane

# Registry lazy import (circulars se bachne + import cost kam).
_REGISTRY = None


def _registry():
    global _REGISTRY
    if _REGISTRY is None:
        from core.tool_bridge import build_registry
        _REGISTRY = build_registry()
    return _REGISTRY


def _set_registry(reg) -> None:
    """Tests ke liye — fake registry inject karo."""
    global _REGISTRY
    _REGISTRY = reg


# Curated allowlist: safe + chat-useful tools. Communication (dial/whatsapp),
# destructive (personal_forget) aur high-impact tools jaan-bujh ke nahi hain.
DEFAULT_TOOLS = (
    # web / info
    "api_weather", "api_currency", "api_dictionary", "api_wikipedia",
    "api_directory_search", "web_search", "web_fetch", "web_research",
    "web_agent_run",
    # phone
    "phone_battery", "phone_open", "phone_torch", "phone_brightness",
    "phone_volume", "phone_set_volume", "phone_notification", "phone_toast",
    "phone_vibrate", "phone_clipboard_get", "phone_clipboard_set",
    # memory
    "personal_remember", "personal_recall", "personal_briefing",
    # learning / study
    "study_plan", "study_quiz", "study_tips",
    "learning_find_books", "learning_find_build_guide", "learning_available_topics",
    # market / skills
    "market_analyze", "skills_list", "skills_get", "skills_catalog_search",
)


def allowlist() -> list[str]:
    """Agent ke liye available tool names (env override ke saath)."""
    env = os.getenv("NOVA_AGENT_TOOLS", "").strip()
    if env:
        names = [n.strip() for n in env.split(",") if n.strip()]
        return names if names else list(DEFAULT_TOOLS)
    return list(DEFAULT_TOOLS)


def enabled() -> bool:
    val = os.getenv("NOVA_AGENT_ENABLED", "1").strip().lower()
    return val not in ("0", "off", "false", "no", "band")


def max_rounds() -> int:
    try:
        n = int(os.getenv("NOVA_AGENT_MAX_ROUNDS", "3"))
        return max(1, min(n, 6))
    except ValueError:
        return 3


def _declaration(tool) -> dict[str, Any] | None:
    """NovaTool -> Gemini functionDeclaration (OpenAPI subset)."""
    schema = tool.parameter_schema()
    properties = schema.get("properties") or {}
    if not isinstance(properties, dict) or not properties:
        return None  # parameterless tools Gemini me empty object bhej sakte hain
    clean_props: dict[str, Any] = {}
    for name, spec in properties.items():
        if not isinstance(spec, dict):
            continue
        prop: dict[str, Any] = {"type": str(spec.get("type") or "string")}
        if spec.get("description"):
            prop["description"] = str(spec["description"])[:200]
        if spec.get("enum"):
            prop["enum"] = [str(e) for e in spec["enum"]]
        clean_props[name] = prop
    if not clean_props:
        return None
    decl: dict[str, Any] = {
        "name": tool.name,
        "description": (tool.description or tool.name)[:300],
        "parameters": {"type": "object", "properties": clean_props},
    }
    required = [r for r in (schema.get("required") or []) if r in clean_props]
    if required:
        decl["parameters"]["required"] = required
    return decl


def tool_declarations() -> list[dict[str, Any]]:
    """Allowlist ke tools ke Gemini declarations."""
    wanted = set(allowlist())
    decls: list[dict[str, Any]] = []
    seen: set[str] = set()
    for tool in _registry().list_tools():
        if tool.name not in wanted or tool.name in seen or tool.high_impact:
            continue
        decl = _declaration(tool)
        if decl:
            decls.append(decl)
            seen.add(tool.name)
    return decls


def _truncate(value: Any, limit: int = 1800) -> str:
    text = json.dumps(value, default=str, ensure_ascii=False)
    return text if len(text) <= limit else text[:limit] + "...(truncated)"


def run_agent(
    prompt: str,
    history: list[dict[str, str]] | None = None,
    system: str | None = None,
    timeout: float = 45.0,
    max_tokens: int = 1200,
    max_rounds: int | None = None,
) -> dict[str, Any]:
    """Agentic Gemini jawab: tools dekh kar khud decide, execute, final bolo.

    Fail hone par bhi clean success=False — brain phir plain/local lane
    try karta hai. Return me tool_calls list hoti hai (kaunsa chala).
    """
    if not gemini_lane.has_key():
        return {"success": False, "error": "Gemini key set nahi hai."}
    if not enabled():
        return {"success": False, "error": "Agent lane band hai (NOVA_AGENT_ENABLED=0)."}

    decls = tool_declarations()
    if not decls:
        return {"success": False, "error": "koi agent tool available nahi."}

    allowed = {d["name"] for d in decls}
    registry = _registry()
    rounds = max_rounds if max_rounds is not None else _env_rounds()
    contents = gemini_lane._contents(history or [], prompt)
    tools_payload = {"functionDeclarations": decls}
    agent_hint = (
        "\n\nTu ke paas real tools hain (weather, battery, search, yaadein...). "
        "Jab takaiyat ho, tool call karke REAL data ke saath jawab de — andaza nahi. "
        "Final jawab Hinglish me, ek-do line, bolne layak."
    )
    full_system = (system or "") + agent_hint

    calls_used: list[dict[str, Any]] = []

    for _ in range(rounds):
        result = gemini_lane._generate(
            contents, system=full_system or None, tools=tools_payload,
            timeout=timeout, max_tokens=max_tokens,
        )
        if not result.get("success"):
            return {"success": False, "error": result.get("error", "agent generate fail")}

        fcs = result.get("function_calls") or []
        text = str(result.get("text") or "").strip()
        if not fcs:
            if text:
                return {"success": True, "answer": text, "via": "gemini",
                        "tool_calls": calls_used, "tools_used": len(calls_used)}
            return {"success": False, "error": "agent ne jawab nahi diya."}

        # Model ne tool(s) maanga — contents me model turn append karo.
        contents.append({"role": "model", "parts": [
            {"functionCall": {"name": fc["name"], "args": fc.get("args") or {}}}
            for fc in fcs
        ]})

        for fc in fcs:
            name = fc.get("name") or ""
            args = fc.get("args") or {}
            if name in allowed:
                try:
                    out = registry.execute(name, args)
                except Exception as exc:
                    out = {"success": False, "error": f"tool crash: {exc}"[:200]}
            else:
                out = {"success": False,
                       "error": f"tool '{name}' agent allowlist me nahi hai."}
            calls_used.append({"name": name, "ok": bool(out.get("success"))})
            contents.append({"role": "user", "parts": [{
                "functionResponse": {"name": name, "response": {"output": _truncate(out)}}
            }]})

    # Rounds khatam — bina tools ke final jawab maango (force text).
    final = gemini_lane._generate(
        contents, system=full_system or None, tools=None,
        timeout=timeout, max_tokens=max_tokens,
    )
    if final.get("success") and str(final.get("text") or "").strip():
        return {"success": True, "answer": final["text"].strip(), "via": "gemini",
                "tool_calls": calls_used, "tools_used": len(calls_used)}
    return {"success": False, "error": "agent rounds khatam, final jawab nahi mila."}


def _env_rounds() -> int:
    return max_rounds()
