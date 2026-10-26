"""Tools for the local brain, the agent loop, plans and long-term memory.

Everything here is deliberately thin: the heavy lifting lives in
``jarvis.local_brain``, ``jarvis.agent``, ``jarvis.plans`` and
``jarvis.memory`` so the same behaviour is available to the CLI, the HUD and
the LLM planner.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

from jarvis.config import get_settings
from jarvis.util import reply, truncate

SENSITIVE_DIRS = {
    ".ssh", ".aws", ".gnupg", ".kube", ".docker", ".config/gcloud", ".netrc",
    ".password-store", ".mozilla", ".thunderbird",
}


def _local():
    from jarvis.local_brain import get_local_brain

    return get_local_brain()


def _manager():
    from jarvis.plans import get_plans

    return get_plans()


def _memory():
    from jarvis.memory import get_memory

    return get_memory()


def _agent():
    from jarvis.agent import Agent
    from jarvis.core import get_core

    global _AGENT
    core = get_core()
    if _AGENT is None or _AGENT.core is not core:
        _AGENT = Agent(core)
    return _AGENT


_AGENT = None


def _card(kind: str, title: str, rows: list[str], **extra) -> dict:
    return {"type": kind, "title": title, "rows": rows, **extra}


# ------------------------------------------------------------------ brain
def brain_status() -> dict:
    """Report which brain lanes are alive, the recommended Qwen model, and the routing order."""
    from jarvis.brain import get_brain

    settings = get_settings()
    status = get_brain().status()
    local = status.get("local") or {}
    lanes = status.get("lanes") or []
    alive = [lane for lane in lanes if lane.get("online")]
    recommended = local.get("recommended") or {}
    runtime = local.get("runtime") or {}
    binaries = runtime.get("binaries") or {}
    installed = ", ".join(binaries) if isinstance(binaries, dict) and binaries else "nothing detected"
    catalog = recommended.get("catalog") or {}
    suggested = recommended.get("deep") or ""
    label = (catalog.get(suggested) or {}).get("label") or suggested or "unknown"
    rows = [
        f"mode: {status.get('mode')} (preferred: {status.get('preferred')})",
        f"runtime: {installed} · Ollama {'yes' if runtime.get('has_ollama') else 'no'} · "
        f"llama.cpp {'yes' if runtime.get('has_llama_cpp') else 'no'}",
        f"lanes online: {', '.join(lane['name'] + ' · ' + str(lane.get('model', '')) for lane in alive) or 'none'}",
        f"recommended: {label} for {local.get('ram_gb', runtime.get('ram_gb', '?'))} GB RAM",
        f"vision: {'Gemini' if status.get('vision') else 'unavailable'}",
    ]
    headline = (
        f"Local brain online on {len(alive)} lane(s), Sir."
        if alive
        else "No local lane answering, Sir. The deterministic core is covering for it."
    )
    return reply(
        headline,
        cards=[_card("list", "BRAIN STATUS", rows)],
        data=status,
    )


def brain_setup() -> dict:
    """Print exact install commands for Ollama or llama.cpp and the recommended Qwen model."""
    guide = _local().install_guide()
    info = guide.get("model_info") or {}
    lines = [
        f"Recommended for this machine ({guide.get('ram_gb', '?')} GB RAM): "
        f"{info.get('label') or guide.get('model')} — {info.get('note', '')}".rstrip(" —"),
        "",
        "OLLAMA",
    ]
    lines += [f"  {command}" for command in guide.get("steps") or []]
    lines += ["", "WINDOWS"]
    lines += [f"  {command}" for command in guide.get("windows") or []]
    lines += ["", "LLAMA.CPP"]
    lines += [f"  {command}" for command in guide.get("llama_cpp") or []]
    lines += ["", guide.get("note", "")]
    text = "\n".join(lines)
    return reply(
        f"Here is the local brain recipe, Sir. Recommended: {guide['model_info']['label']}.",
        cards=[_card("terminal", "LOCAL BRAIN SETUP", text.splitlines())],
        data=guide,
    )


def brain_test() -> dict:
    """Send a trivial prompt to the first live lane and report latency."""
    local = _local()
    status = local.status(force=True)
    lanes = [lane for lane in status.get("lanes", []) if lane.get("online")]
    if not lanes:
        return reply(
            "No lane answered, Sir. Start Ollama (`ollama serve`) or run the llama.cpp command "
            "from `brain setup`, then test again.",
            cards=[_card("list", "LANES", [f"{lane['name']}: {lane.get('error') or 'offline'}" for lane in status.get("lanes", [])])],
            data=status,
        )
    started = time.perf_counter()
    text, provider = local.chat(
        [
            {"role": "system", "content": "You are a terse diagnostic endpoint."},
            {"role": "user", "content": "Reply with exactly: JARVIS LOCAL BRAIN ONLINE"},
        ],
        task="general",
        max_tokens=32,
        timeout=45.0,
    )
    elapsed = round(time.perf_counter() - started, 2)
    if not text:
        return reply(
            f"{lanes[0]['name']} is listening but did not answer, Sir. Check the model name and context size.",
            data={"lanes": lanes, "elapsed_s": elapsed, "error": getattr(local, "last_error", "")},
        )
    return reply(
        f"Local brain answered in {elapsed}s via {provider}: {truncate(text, 90)}",
        cards=[_card("list", "LOCAL BRAIN TEST", [f"provider: {provider}", f"latency: {elapsed}s"])],
        data={"provider": provider, "elapsed_s": elapsed, "lanes": lanes, "text": text},
    )


def brain_chat(message: str = "", task: str = "general") -> dict:
    """Ask the local Qwen lane directly, bypassing Gemini."""
    message = str(message or "").strip()
    if not message:
        return reply("What should I ask the local model, Sir?")
    local = _local()
    if not local.available():
        return reply(
            "The local lane is down, Sir. `brain setup` has the commands; once Ollama runs I will answer offline.",
            data={"online": False},
        )
    settings = get_settings()
    started = time.perf_counter()
    text, provider = local.chat(
        [
            {
                "role": "system",
                "content": f"You are {settings.owner}'s local J.A.R.V.I.S. Be concise and factual.",
            },
            {"role": "user", "content": message},
        ],
        task=task if task in {"general", "deep", "code"} else "general",
        timeout=90.0,
    )
    elapsed = round(time.perf_counter() - started, 2)
    if not text:
        return reply(
            "The lane accepted the request but returned nothing, Sir.",
            data={"error": getattr(local, "last_error", ""), "elapsed_s": elapsed},
        )
    return reply(
        text,
        cards=[_card("list", "LOCAL QWEN", [f"provider: {provider}", f"latency: {elapsed}s"])],
        data={"text": text, "provider": provider, "elapsed_s": elapsed},
    )


# ------------------------------------------------------------------ agent
def agent_run(goal: str = "", max_steps: int = 0) -> dict:
    """Run the bounded multi-step agent on a goal and keep the plan on disk."""
    goal = str(goal or "").strip()
    if not goal:
        return reply("Give me a goal and I will run the agent loop, Sir.")
    result = _agent().run(goal, max_steps=max_steps or None)
    trace = result.get("trace") or []
    rows = [f"{item.get('step')}. {item.get('tool') or item.get('kind')} — {truncate(item.get('summary') or item.get('error') or '', 110)}" for item in trace]
    plan = result.get("plan") or {}
    if plan:
        rows.append(f"plan: data/jarvis/plans/{plan.get('id')}/task_plan.md ({plan.get('progress_pct', 0)}%)")
    return reply(
        str(result.get("reply") or "Agent run finished, Sir."),
        cards=[_card("list", "AGENT TRACE", rows or ["no steps executed"])],
        data=result,
    )


def agent_status() -> dict:
    """Show agent readiness, the step budget and recent plans."""
    status = _agent().status()
    rows = [
        f"enabled: {status['enabled']}",
        f"brain ready: {status['ready']}",
        f"step budget: {status['steps']}",
        f"plans: {status['plans']} ({status['active']} active)",
    ]
    rows += [f"- {item['goal']} · {item['progress_pct']}%" for item in status.get("recent", [])]
    return reply(
        "Agent loop is ready, Sir." if status["ready"] else "Agent is armed but waiting for a brain.",
        cards=[_card("list", "AGENT", rows)],
        data=status,
    )


# ------------------------------------------------------------------ plans
def plan_create(goal: str = "", steps: str = "") -> dict:
    """Create a persistent plan (task_plan.md, findings.md, progress.md)."""
    if not str(goal or "").strip():
        return reply("What is the goal for this plan, Sir?")
    plan = _manager().create(goal, steps=steps or None)
    rows = [f"{index}. {step['text']}" for index, step in enumerate(plan["steps"], 1)]
    return reply(
        f"Plan “{plan['goal']}” created with {len(plan['steps'])} steps, Sir.",
        cards=[_card("list", "PLAN", rows)],
        data=plan,
    )


def plan_show(ref: str = "") -> dict:
    """List plans, or show one plan's checklist if a name is given."""
    manager = _manager()
    ref = str(ref or "").strip()
    if ref:
        plan = manager.get(ref)
        if not plan:
            return reply(f"No plan matches “{ref}”, Sir.")
        rows = [
            f"{index}. [{'x' if step['done'] else ' '}] {step['text']}"
            for index, step in enumerate(plan.get("steps", []), 1)
        ]
        if plan.get("findings"):
            rows.append("findings: " + "; ".join(plan["findings"][-4:]))
        return reply(
            f"“{plan['goal']}” is {plan.get('progress_pct', 0)}% complete.",
            cards=[_card("list", "PLAN", rows)],
            data=plan,
        )
    plans = manager.list()
    if not plans:
        return reply("No plans on disk yet, Sir. Say `make a plan to …`.")
    rows = [
        f"{plan['goal']} · {plan.get('progress_pct', 0)}% · {plan.get('status')}"
        for plan in plans[:8]
    ]
    noun = "plan" if len(plans) == 1 else "plans"
    return reply(f"{len(plans)} {noun} on disk, Sir.", cards=[_card("list", "PLANS", rows)], data={"plans": plans})

def plan_update(ref: str = "", step: str = "", status: str = "", finding: str = "") -> dict:
    """Tick a step, close a plan, or attach a finding."""
    manager = _manager()
    if not str(ref or "").strip():
        return reply("Which plan, Sir?")
    if finding:
        plan = manager.add_finding(ref, finding)
    elif status:
        plan = manager.close(ref, status)
    elif str(step or "").strip():
        plan = manager.complete_step(ref, step)
    else:
        return reply("Tell me the step number, a finding, or a status.")
    if not plan:
        return reply(f"I could not update “{ref}”, Sir.")
    return reply(
        f"Plan updated: {plan.get('progress_pct', 0)}% complete ({plan.get('status')}).",
        cards=[_card("list", "PLAN", [f"{index}. [{'x' if s['done'] else ' '}] {s['text']}" for index, s in enumerate(plan.get("steps", []), 1)])],
        data=plan,
    )


# ------------------------------------------------------------------ memory
def memory_save(text: str = "", kind: str = "note") -> dict:
    """Store an observation in the long-term memory journal (secrets are refused)."""
    item = _memory().add(text, kind=kind or "note", source="tool")
    if not item:
        return reply("Nothing stored — empty text or it looked like a credential, Sir.")
    return reply(
        f"Remembered ({item.kind}): {truncate(item.text, 120)}",
        cards=[_card("memory", "MEMORY", [f"{item.kind} · {item.id}"])],
        data={"record": item.__dict__},
    )


def memory_search(query: str = "") -> dict:
    """Search the memory journal, or show its statistics when empty."""
    store = _memory()
    query = str(query or "").strip()
    if not query:
        stats = store.stats()
        kinds = ", ".join(f"{kind}: {count}" for kind, count in stats["kinds"].items()) or "empty"
        return reply(
            f"{stats['count']} observations in the journal, Sir.",
            cards=[_card("list", "MEMORY", [kinds, f"file: {stats['path']}"])],
            data=stats,
        )
    hits = store.search(query, limit=6)
    if not hits:
        return reply(f"Nothing in memory matches “{query}”, Sir.")
    rows = [f"[{hit['kind']}] {truncate(hit['text'], 130)} ({hit['score']})" for hit in hits]
    return reply(
        f"{len(hits)} relevant memories, Sir.",
        cards=[_card("list", "MEMORY RESULTS", rows)],
        data={"results": hits},
    )


# ------------------------------------------------------------------ repos
def _guarded_path(raw: str) -> Path:
    path = Path(os.path.expanduser(str(raw or "."))).resolve()
    lowered = str(path).lower()
    if any(part in lowered for part in SENSITIVE_DIRS):
        raise PermissionError("That directory is excluded from repository scans.")
    return path


def repo_map(path: str = ".") -> dict:
    """Summarise a repository: languages, key files and a pruned tree."""
    from jarvis.agent import repo_map as build_map

    try:
        target = _guarded_path(path)
    except PermissionError as exc:
        return reply(str(exc), data={"ok": False})
    data = build_map(target)
    if not data.get("ok"):
        return reply(f"Repository scan failed, Sir: {data.get('error')}", data=data)
    languages = ", ".join(f"{suffix}×{count}" for suffix, count in (data.get("languages") or {}).items())
    rows = [f"root: {data['root']}", f"files: {data['files_scanned']}", f"languages: {languages or 'unknown'}"]
    if data.get("key_files"):
        rows.append("key files: " + ", ".join(data["key_files"][:8]))
    rows += data.get("tree", [])[:14]
    return reply(
        f"Mapped {data['files_scanned']} files in {Path(data['root']).name}, Sir.",
        cards=[_card("list", "REPOSITORY MAP", rows)],
        data=data,
    )

# ------------------------------------------------------------- focus mode
def focus_mode(action: str = "status") -> dict:
    """Toggle ADHD-friendly output (short, numbered, one next action)."""
    from jarvis.store import get_store

    store = get_store()
    settings = get_settings()
    current = store.get_pref("adhd_mode")
    current = bool(settings.adhd_mode) if current is None else bool(current)
    action = str(action or "status").strip().lower()

    if action in {"on", "enable", "start", "adhd", "focus"}:
        store.set_pref("adhd_mode", True)
        return reply(
            "Focus mode on, Sir. Short answers, numbered steps, one next action.",
            cards=[_card("list", "FOCUS MODE", ["replies capped at ~90 words", "steps as bullets", "one concrete next move"])],
            data={"adhd_mode": True},
        )
    if action in {"off", "disable", "stop", "normal"}:
        store.set_pref("adhd_mode", False)
        return reply("Focus mode off, Sir. Back to full prose.", data={"adhd_mode": False})
    return reply(
        f"Focus mode is {'on' if current else 'off'}, Sir.",
        cards=[_card("list", "FOCUS MODE", [f"adhd_mode: {current}"])],
        data={"adhd_mode": current},
    )

