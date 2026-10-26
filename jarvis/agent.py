"""Multi-step local agent: plan on disk, act with tools, report honestly.

Design notes, borrowed from the best of the referenced projects and rewritten
for J.A.R.V.I.S.:

* planning-with-files → the plan lives in ``data/jarvis/plans`` so it survives
  a restart or a context wipe;
* OpenJarvis → local-first: the loop runs happily on a Qwen lane with no cloud;
* wshobson/agents → small, explicit steps with a hard cap (no runaway loops);
* Understand-Anything → a cheap repository map gives the model real context
  instead of guesses.

The loop never claims success it did not observe: every step records what the
tool returned, and an unreachable model degrades to a plain explanation.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from pathlib import Path

from jarvis import tools
from jarvis.brain import get_brain, parse_plan
from jarvis.config import get_settings
from jarvis.plans import get_plans
from jarvis.util import truncate

IGNORE_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".venv", "venv", "env",
    "dist", "build", "out", "target", "coverage", ".next", ".nuxt", ".cache",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".idea", ".vscode", "site-packages",
    "vendor", "Pods", ".terraform", ".gradle", "bin", "obj",
}
TEXT_SUFFIXES = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".kt", ".c", ".h",
    ".cpp", ".hpp", ".cs", ".rb", ".php", ".swift", ".md", ".txt", ".json", ".yaml",
    ".yml", ".toml", ".ini", ".cfg", ".sh", ".sql", ".html", ".css", ".scss", ".ipynb",
}
KEY_FILES = {
    "README.md", "README", "readme.md", "package.json", "pyproject.toml", "Cargo.toml",
    "go.mod", "requirements.txt", "Makefile", "docker-compose.yml", "Dockerfile",
    "AGENTS.md", "SKILL.md", "CLAUDE.md", ".env.example", "tsconfig.json",
}
MAX_SCAN = 4000


def repo_map(path: str | Path, *, max_files: int = 40, depth: int = 4) -> dict:
    """Summarise a codebase without reading it all.

    Returns counts, languages, entry points and a pruned tree — enough for a
    model to reason about a repository in a few hundred tokens.
    """
    root = Path(os.path.expanduser(str(path or "."))).resolve()
    if not root.exists():
        return {"ok": False, "error": f"{root} does not exist"}
    if not root.is_dir():
        return {"ok": False, "error": f"{root} is not a directory"}

    languages: dict[str, int] = {}
    key_files: list[str] = []
    seen = 0
    tree: list[str] = []

    for current, dirs, files in os.walk(root):
        rel_dir = Path(current).relative_to(root)
        if len(rel_dir.parts) >= depth:
            dirs[:] = []
        dirs[:] = sorted(
            name for name in dirs
            if name not in IGNORE_DIRS and not name.startswith(".") or name in {".github", ".devcontainer"}
        )
        if any(part in IGNORE_DIRS for part in rel_dir.parts):
            continue
        for name in sorted(files):
            seen += 1
            if seen > MAX_SCAN:
                break
            suffix = Path(name).suffix.lower()
            if suffix in TEXT_SUFFIXES:
                languages[suffix] = languages.get(suffix, 0) + 1
            rel = str(rel_dir / name) if rel_dir.parts else name
            if name in KEY_FILES and len(key_files) < 20:
                key_files.append(rel)
            if len(tree) < max_files:
                tree.append(rel)
        if seen > MAX_SCAN:
            break

    return {
        "ok": True,
        "root": str(root),
        "files_scanned": min(seen, MAX_SCAN),
        "truncated": seen > MAX_SCAN,
        "languages": dict(sorted(languages.items(), key=lambda item: item[1], reverse=True)[:10]),
        "key_files": key_files,
        "tree": tree,
    }


def repo_map_text(path: str | Path) -> str:
    data = repo_map(path)
    if not data.get("ok"):
        return f"Repository map failed: {data.get('error')}"
    langs = ", ".join(f"{suffix}×{count}" for suffix, count in (data.get("languages") or {}).items())
    return (
        f"{data['root']} — {data['files_scanned']} files"
        f"{' (truncated)' if data.get('truncated') else ''}\n"
        f"Languages: {langs or 'unknown'}\n"
        f"Key files: {', '.join(data.get('key_files') or []) or 'none'}\n"
        f"Tree:\n" + "\n".join(f"  {entry}" for entry in data.get("tree") or [])
    )


class Agent:
    """Bounded plan → act → observe loop."""

    def __init__(self, core) -> None:
        self.core = core
        self.brain = getattr(core, "brain", None) or get_brain()
        self.plans = get_plans()
        self._lock = threading.RLock()
        self.last_run: dict | None = None

    # ------------------------------------------------------------------ api
    def available(self) -> bool:
        settings = get_settings()
        if not getattr(settings, "agent_enabled", True):
            return False
        try:
            return bool(self.brain.gemini_available() or self.brain.qwen_available())
        except Exception:
            return False

    def run(
        self,
        goal: str,
        *,
        steps: str | list[str] | None = None,
        max_steps: int | None = None,
        notify: bool = False,
    ) -> dict:
        goal = str(goal or "").strip()
        if not goal:
            return {"ok": False, "error": "Tell me what the goal is first, Sir."}
        settings = get_settings()
        if not getattr(settings, "agent_enabled", True):
            return {"ok": False, "error": "Agent mode is disabled in settings."}
        limit = int(max_steps or getattr(settings, "agent_steps", 5) or 5)
        limit = max(1, min(12, limit))

        plan = self.plans.create(goal, steps=steps, source="agent")
        self.plans.add_finding(plan["id"], f"Goal received: {goal}")
        trace: list[dict] = []
        started = time.perf_counter()

        if not self.available():
            self.plans.update(
                plan["id"],
                lambda item: item.setdefault("progress", []).append(
                    "No brain reachable — run `brain setup` to install a local Qwen lane."
                ),
            )
            return {
                "ok": False,
                "plan": self.plans.get(plan["id"]),
                "trace": trace,
                "reply": (
                    f"I opened a plan for “{goal}” on disk, Sir, but no brain is reachable. "
                    "Start Ollama (or run `brain setup`) and try again."
                ),
            }

        scratchpad: list[str] = []
        reply = ""
        for index in range(1, limit + 1):
            prompt = self._step_prompt(goal, plan, scratchpad, index, limit)
            raw, provider = self.brain.complete(
                prompt,
                f"Goal: {goal}\n\nProgress so far:\n"
                + ("\n".join(scratchpad) if scratchpad else "(nothing yet)")
                + "\n\nNext action?",
                json_mode=False,
                timeout=60.0,
                task="plan",
            )
            if not raw:
                trace.append({"step": index, "ok": False, "error": "brain went dark"})
                break
            decision = parse_plan(raw)
            if decision.get("kind") == "reply":
                reply = str(decision.get("text") or "").strip()
                self.plans.update(
                    plan["id"],
                    lambda item: item.setdefault("progress", []).append(
                        f"{index}. answered without a tool"
                    ),
                )
                trace.append({"step": index, "provider": provider, "kind": "reply"})
                break

            name = str(decision.get("tool") or "")
            arguments = decision.get("arguments") or {}
            if name not in tools.TOOLS:
                scratchpad.append(f"Step {index}: asked for unknown tool {name!r} — ignored.")
                trace.append({"step": index, "provider": provider, "ok": False, "error": "unknown tool"})
                continue

            result = self.core.call(name, arguments, provider=f"agent:{provider}")
            summary = self._summarise(name, arguments, result)
            scratchpad.append(f"Step {index}: {summary}")
            self.plans.update(
                plan["id"],
                lambda item: item.setdefault("progress", []).append(f"Step {index}: {summary}"),
            )
            trace.append(
                {
                    "step": index,
                    "provider": provider,
                    "tool": name,
                    "ok": bool(result.get("ok", True)),
                    "summary": summary,
                }
            )
            say = str(decision.get("say") or "").strip()
            if say:
                reply = say
            if result.get("ok") is False and result.get("needs_approval"):
                scratchpad.append(
                    "Step halted: the tool needs owner approval, so the agent cannot continue unattended."
                )
                break

        plan = self.plans.get(plan["id"]) or plan
        elapsed = round(time.perf_counter() - started, 2)
        final = self._final_reply(goal, plan, scratchpad, reply)
        payload = {
            "ok": True,
            "plan": plan,
            "trace": trace,
            "reply": final,
            "provider": trace[-1].get("provider") if trace else "offline",
            "elapsed_s": elapsed,
        }
        self.last_run = payload
        if notify:
            try:
                from jarvis.skills.communication import notify as send_notify

                send_notify("Agent finished", truncate(final, 180))
            except Exception:
                pass
        return payload

    # -------------------------------------------------------------- internals
    def _step_prompt(self, goal: str, plan: dict, scratchpad: list[str], index: int, limit: int) -> str:
        settings = get_settings()
        catalog = []
        for tool in tools.TOOLS.values():
            if tool.high_impact:
                continue
            params = ", ".join((tool.parameters.get("properties") or {}).keys())
            catalog.append(f"- {tool.name}({params}): {tool.description}")
        return (
            f"You are J.A.R.V.I.S., {settings.owner}'s local agent. Work one step at a time.\n"
            f"Goal: {goal}\n"
            f"Plan file: data/jarvis/plans/{plan['id']}/task_plan.md\n"
            f"Step {index} of at most {limit}.\n\n"
            "Reply with ONE JSON object:\n"
            '  {"tool": "<tool>", "arguments": {...}, "say": "<short line>"}\n'
            "or, when the goal is answered or blocked:\n"
            '  {"reply": "<final answer, what you actually verified>"}\n\n'
            "Rules: pick the single most useful next tool; never repeat a tool call with identical\n"
            "arguments; do not invent tools or arguments; never claim an action you did not take.\n\n"
            "Tools:\n" + "\n".join(sorted(catalog)) + "\n\n"
            "Scratchpad:\n" + ("\n".join(scratchpad) if scratchpad else "(empty)")
        )

    @staticmethod
    def _summarise(name: str, arguments: dict, result: dict) -> str:
        text = str(result.get("text") or result.get("speech") or "").strip()
        if not text:
            data = result.get("data") or {}
            text = truncate(json.dumps(data, ensure_ascii=False), 220) if data else "(no output)"
        args = truncate(", ".join(f"{key}={value}" for key, value in arguments.items()), 90)
        return f"{name}({args}) → {truncate(text, 320)}"

    @staticmethod
    def _final_reply(goal: str, plan: dict, scratchpad: list[str], reply: str) -> str:
        done = plan.get("progress_pct", 0)
        if reply:
            return reply
        if not scratchpad:
            return f"I could not make progress on “{goal}”, Sir. Check the brain connection and try again."
        return (
            f"Agent run for “{goal}” is on disk at task_plan.md ({done}% complete). "
            f"Latest: {scratchpad[-1]}"
        )

    def resume(self, ref: str, max_steps: int | None = None) -> dict:
        plan = self.plans.get(ref)
        if not plan:
            return {"ok": False, "error": f"No plan matches “{ref}”."}
        remaining = [step["text"] for step in plan.get("steps", []) if not step.get("done")]
        goal = plan["goal"]
        if remaining and not any(marker in goal.lower() for marker in ("finish", "remaining")):
            goal = f"{goal} (remaining: {'; '.join(remaining[:4])})"
        return self.run(goal, max_steps=max_steps)

    def status(self) -> dict:
        plans = self.plans.list()
        active = [plan for plan in plans if plan.get("status") != "complete"]
        return {
            "enabled": bool(getattr(get_settings(), "agent_enabled", True)),
            "ready": self.available(),
            "steps": getattr(get_settings(), "agent_steps", 5),
            "plans": len(plans),
            "active": len(active),
            "last": self.last_run,
            "recent": [
                {
                    "id": plan["id"],
                    "goal": plan["goal"],
                    "status": plan.get("status"),
                    "progress_pct": plan.get("progress_pct", 0),
                }
                for plan in plans[:5]
            ],
        }
