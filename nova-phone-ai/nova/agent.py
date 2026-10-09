"""The agent loop: rules first, then a bounded JSON tool-calling loop with a local/online LLM.

Protocol (works with any OpenAI-compatible chat model, no special function-calling support needed):
  model -> {"tool": "<name>", "args": {...}}     Nova executes the tool and feeds back TOOL_RESULT
  model -> {"final": "<answer>"}                 Nova returns the answer
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from nova.config import Config
from nova.context import Context
from nova.llm import ChatReply, LLMError, Router, strip_reasoning
from nova.rules import match_rule
from nova.tools.registry import ToolRegistry

SYSTEM_TEMPLATE = """You are Nova, a private personal assistant running on the user's Android phone.
Language: if the user writes in Hindi, Hinglish or Roman Hindi, answer in natural Hinglish (Roman script). Otherwise use the user's language. Be short, practical and friendly.
Honesty: never claim that something was done, saved, or verified unless a TOOL_RESULT with ok=true says so. If a tool fails, say so plainly and suggest the next step.

You may use tools. To call ONE tool, reply with ONLY this JSON object and nothing else:
{{"tool": "<tool name>", "args": {{...}}}}
When you are ready to answer the user, reply with ONLY:
{{"final": "<your answer>"}}

Available tools:
{tools}

Known about the user (from memory):
{memory}
"""


@dataclass
class ToolCall:
    tool: str
    args: dict
    ok: bool
    summary: str


@dataclass
class AgentResult:
    ok: bool
    answer: str = ""
    error: str = ""
    lane: str = "none"
    tool_calls: list[ToolCall] = field(default_factory=list)

    @property
    def tool_failures(self) -> int:
        return sum(1 for c in self.tool_calls if not c.ok)


def parse_action(text: str) -> dict | None:
    """Extract the first JSON object with 'tool' or 'final' from a model reply."""
    cleaned = strip_reasoning(text).strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned).strip()
    decoder = json.JSONDecoder()
    candidates = [cleaned]
    candidates += [cleaned[m.start():] for m in re.finditer(r"\{", cleaned)][:8]
    for chunk in candidates:
        try:
            obj, _ = decoder.raw_decode(chunk)
        except ValueError:
            continue
        if isinstance(obj, dict) and ("tool" in obj or "final" in obj):
            return obj
    return None


def build_memory_lines(ctx: Context) -> str:
    prefs = ctx.memory.all_prefs()
    if not prefs:
        return "(nothing saved yet)"
    return "\n".join(f"- {k}: {v}" for k, v in list(prefs.items())[:25])


def system_prompt(ctx: Context, registry: ToolRegistry) -> str:
    return SYSTEM_TEMPLATE.format(tools=registry.describe(), memory=build_memory_lines(ctx))


def _history_budget(config: Config) -> int:
    return max(500, config.llm.context_chars - 1500)


class Agent:
    def __init__(self, ctx: Context, registry: ToolRegistry, router: Router):
        self.ctx = ctx
        self.registry = registry
        self.router = router

    def respond(self, text: str, history: list[dict] | None = None, max_steps: int | None = None,
                use_rules: bool = True, rule_text: str | None = None) -> AgentResult:
        """Answer one user message (or one task step). `rule_text` is matched against the rules
        instead of the full prompt, so a task step like 'read notes.txt' runs the real tool."""
        cfg = self.ctx.config
        max_steps = max_steps or cfg.agent.max_steps

        if use_rules:
            rule = match_rule(rule_text if rule_text is not None else text)
            if rule is not None:
                result = self.registry.call(rule.tool, rule.args, self.ctx)
                call = ToolCall(rule.tool, rule.args, result.ok, result.output if result.ok else result.error)
                if result.ok:
                    return AgentResult(ok=True, answer=result.output, lane="rules", tool_calls=[call])
                return AgentResult(ok=False, error=result.error, lane="rules", tool_calls=[call])

        messages: list[dict] = [{"role": "system", "content": system_prompt(self.ctx, self.registry)}]
        messages += self._trim(history or [])
        messages.append({"role": "user", "content": text})
        calls: list[ToolCall] = []
        format_errors = 0
        lane = "local"

        for _ in range(max_steps):
            try:
                reply: ChatReply = self.router.chat(messages)
            except LLMError as exc:
                if exc.kind in ("connect", "timeout", "not_configured"):
                    error = f"model unavailable: {exc}"
                elif exc.kind == "context":
                    error = ("prompt too large for the model's context window; start a new chat or raise "
                             f"llama-server -c (e.g. 2048). Detail: {exc}")
                else:
                    error = f"model error: {exc}"
                return AgentResult(ok=False, error=error, lane=lane, tool_calls=calls)
            lane = reply.lane
            action = parse_action(reply.text)
            if action is None:
                format_errors += 1
                if format_errors > cfg.agent.max_format_errors:
                    return AgentResult(ok=False, error="model did not produce a valid action JSON",
                                       lane=lane, tool_calls=calls)
                messages += [{"role": "assistant", "content": reply.text[:1000]},
                             {"role": "user", "content": 'FORMAT_ERROR: reply with ONLY {"tool": ...} or {"final": ...}.'}]
                continue
            if "final" in action:
                answer = str(action.get("final", "")).strip()
                failed = [c for c in calls if not c.ok]
                ok = bool(answer) and not failed
                error = "" if ok else ("empty answer" if not answer else
                                       "; ".join(f"{c.tool} failed: {c.summary}" for c in failed))
                return AgentResult(ok=ok, answer=answer, lane=lane, tool_calls=calls, error=error)
            tool_name = str(action.get("tool", ""))
            args = action.get("args", {}) or {}
            result = self.registry.call(tool_name, args if isinstance(args, dict) else {}, self.ctx)
            calls.append(ToolCall(tool_name, args if isinstance(args, dict) else {}, result.ok,
                                  result.output if result.ok else result.error))
            messages += [{"role": "assistant", "content": json.dumps(action, ensure_ascii=False)[:1000]},
                         {"role": "user", "content": "TOOL_RESULT " + json.dumps(result.as_json(), ensure_ascii=False)}]
        return AgentResult(ok=False, error=f"step limit reached ({max_steps} model turns)", lane=lane, tool_calls=calls)

    def _trim(self, history: list[dict]) -> list[dict]:
        budget = _history_budget(self.ctx.config)
        picked, used = [], 0
        for msg in reversed(history):
            size = len(msg.get("content", ""))
            if used + size > budget:
                break
            picked.append(msg)
            used += size
        return list(reversed(picked))
