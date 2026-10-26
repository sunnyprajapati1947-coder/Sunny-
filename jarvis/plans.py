"""File-based planning — plans survive restarts, context loss and compaction.

Inspired by planning-with-files: every non-trivial task gets a folder under
``data/jarvis/plans/<slug>/`` containing the three files that matter:

* ``task_plan.md``  — goal and numbered checklist
* ``findings.md``   — evidence gathered along the way
* ``progress.md``   — timestamped log of what actually happened

The JSON index is the fast path for the API; the Markdown files are the human
source of truth that the agent (and you) can read at any time.
"""
from __future__ import annotations

import json
import re
import threading
from datetime import datetime
from pathlib import Path

from jarvis.config import DATA_DIR
from jarvis.util import iso, now

PLAN_DIR = DATA_DIR / "plans"
INDEX_FILE = PLAN_DIR / "index.json"
MAX_PLANS = 60


def _slug(text: str, limit: int = 42) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")
    return slug[:limit] or "plan"


def _parse_steps(raw: str) -> list[str]:
    parts = re.split(r"\s*(?:\n|;|\d+[.)]\s*|,\s*(?=\d))", str(raw or ""))
    steps = [re.sub(r"^[-*\s]+", "", part).strip(" .") for part in parts]
    return [step for step in steps if step][:12]


class PlanManager:
    def __init__(self, root: Path | str | None = None) -> None:
        self.root = Path(root or PLAN_DIR)
        self._lock = threading.RLock()

    # ---------------------------------------------------------------- index
    def _load_index(self) -> list[dict]:
        try:
            payload = json.loads((self.root / "index.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        return [item for item in payload if isinstance(item, dict) and item.get("id")] if isinstance(payload, list) else []

    def _save_index(self, plans: list[dict]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        plans = plans[-MAX_PLANS:]
        index = self.root / "index.json"
        tmp = index.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(plans, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(index)

    def _find(self, plans: list[dict], ref: str) -> dict | None:
        needle = str(ref or "").strip().lower()
        if not needle:
            return None
        for plan in reversed(plans):
            if plan["id"] == needle:
                return plan
        for plan in reversed(plans):
            if needle in plan.get("goal", "").lower() or needle in plan["id"]:
                return plan
        return None

    # ---------------------------------------------------------------- files
    def _render(self, plan: dict) -> None:
        folder = self.root / plan["id"]
        folder.mkdir(parents=True, exist_ok=True)
        steps = "\n".join(
            f"{index}. [{'x' if step.get('done') else ' '}] {step.get('text', '')}"
            for index, step in enumerate(plan.get("steps", []), 1)
        )
        plan_md = (
            f"# {plan.get('goal', 'Plan')}\n\n"
            f"- **Status:** {plan.get('status', 'active')}\n"
            f"- **Created:** {plan.get('created', '')}\n"
            f"- **Updated:** {plan.get('updated', '')}\n"
            f"- **Source:** {plan.get('source', 'owner')}\n\n"
            f"## Steps\n\n{steps or 'No steps yet.'}\n"
        )
        (folder / "task_plan.md").write_text(plan_md, encoding="utf-8")
        findings = plan.get("findings") or []
        findings_md = "# Findings\n\n" + ("\n".join(f"- {item}" for item in findings) or "- None yet.") + "\n"
        (folder / "findings.md").write_text(findings_md, encoding="utf-8")
        progress = plan.get("progress") or []
        progress_md = "# Progress\n\n" + ("\n".join(f"- {item}" for item in progress) or "- Plan created.") + "\n"
        (folder / "progress.md").write_text(progress_md, encoding="utf-8")

    def _grade(self, plan: dict) -> None:
        done = sum(1 for step in plan.get("steps", []) if step.get("done"))
        total = len(plan.get("steps", []))
        if total and done == total and plan.get("status") == "active":
            plan["status"] = "complete"
        plan["progress_pct"] = int(done / total * 100) if total else 0

    # ------------------------------------------------------------------ api
    def create(self, goal: str, steps: list[str] | str | None = None, source: str = "owner") -> dict:
        goal = str(goal or "").strip()[:240]
        if not goal:
            raise ValueError("A plan needs a goal")
        step_list = _parse_steps(steps) if isinstance(steps, str) else [str(s).strip() for s in (steps or []) if str(s).strip()]
        if not step_list:
            step_list = ["Clarify the outcome", "Gather what is needed", "Do the work", "Verify and close"]
        with self._lock:
            plans = self._load_index()
            base = _slug(goal)
            ident = base
            suffix = 2
            existing = {plan["id"] for plan in plans}
            while ident in existing:
                ident = f"{base}-{suffix}"
                suffix += 1
            stamp = iso(now())
            plan = {
                "id": ident,
                "goal": goal,
                "status": "active",
                "created": stamp,
                "updated": stamp,
                "source": source[:60],
                "steps": [
                    {"id": f"{ident}-{number}", "text": text[:180], "done": False}
                    for number, text in enumerate(step_list, 1)
                ],
                "findings": [],
                "progress": [f"{stamp} — plan created ({len(step_list)} steps)"],
            }
            self._grade(plan)
            plans.append(plan)
            self._save_index(plans)
            self._render(plan)
            return plan

    def list(self, include_complete: bool = True) -> list[dict]:
        with self._lock:
            plans = self._load_index()
        if not include_complete:
            plans = [plan for plan in plans if plan.get("status") != "complete"]
        return list(reversed(plans))

    def get(self, ref: str) -> dict | None:
        with self._lock:
            return self._find(self._load_index(), ref)

    def update(self, ref: str, mutator) -> dict | None:
        with self._lock:
            plans = self._load_index()
            plan = self._find(plans, ref)
            if plan is None:
                return None
            mutator(plan)
            plan["updated"] = iso(now())
            self._grade(plan)
            self._save_index(plans)
            self._render(plan)
            return plan

    def complete_step(self, ref: str, step: str | int) -> dict | None:
        def mutate(plan: dict) -> None:
            steps = plan.get("steps", [])
            target = None
            key = str(step).strip().lower()
            if key.isdigit() and 1 <= int(key) <= len(steps):
                target = steps[int(key) - 1]
            else:
                target = next((item for item in steps if key and key in item.get("text", "").lower()), None)
            if target is None:
                raise ValueError("No matching step")
            target["done"] = True
            plan.setdefault("progress", []).append(
                f"{iso(now())} — completed step: {target.get('text', '')}"
            )

        try:
            return self.update(ref, mutate)
        except ValueError:
            return None

    def add_step(self, ref: str, text: str) -> dict | None:
        def mutate(plan: dict) -> None:
            steps = plan.get("steps", [])
            steps.append({"id": f"{plan['id']}-{len(steps) + 1}", "text": str(text)[:180], "done": False})
            plan["progress"].append(f"{iso(now())} — added step: {text}")

        return self.update(ref, mutate)

    def add_finding(self, ref: str, text: str) -> dict | None:
        def mutate(plan: dict) -> None:
            plan.setdefault("findings", []).append(str(text)[:400])
            plan.setdefault("progress", []).append(f"{iso(now())} — finding recorded")

        return self.update(ref, mutate)

    def close(self, ref: str, status: str = "complete") -> dict | None:
        def mutate(plan: dict) -> None:
            plan["status"] = "complete" if status.startswith("comp") else status
            plan.setdefault("progress", []).append(f"{iso(now())} — plan marked {plan['status']}")

        return self.update(ref, mutate)

    def remove(self, ref: str) -> bool:
        with self._lock:
            plans = self._load_index()
            plan = self._find(plans, ref)
            if plan is None:
                return False
            plans = [item for item in plans if item["id"] != plan["id"]]
            self._save_index(plans)
            folder = self.root / plan["id"]
            if folder.is_dir():
                for child in folder.glob("*"):
                    try:
                        child.unlink()
                    except OSError:
                        pass
                try:
                    folder.rmdir()
                except OSError:
                    pass
            return True

    def summary(self, ref: str) -> str:
        plan = self.get(ref)
        if not plan:
            return ""
        lines = [f"Plan “{plan['goal']}” ({plan.get('progress_pct', 0)}% complete)"]
        for index, step in enumerate(plan.get("steps", []), 1):
            lines.append(f"{index}. [{'x' if step.get('done') else ' '}] {step.get('text', '')}")
        if plan.get("findings"):
            lines.append("Findings: " + "; ".join(plan["findings"][-4:]))
        return "\n".join(lines)


_MANAGER: PlanManager | None = None
_LOCK = threading.Lock()


def get_plans() -> PlanManager:
    global _MANAGER
    with _LOCK:
        if _MANAGER is None:
            _MANAGER = PlanManager()
        return _MANAGER
