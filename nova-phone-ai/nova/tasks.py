"""Multi-step task runner with planning, per-step verification, bounded retries, checkpoints,
and resume after restart. A task is COMPLETED only when every step's agent result is verified."""

from __future__ import annotations

import json
import re
import secrets
import time

from nova.agent import Agent
from nova.context import Context
from nova.llm import LLMError, Router
from nova.util import redact

TERMINAL = {"completed"}  # 'failed' tasks can be re-run explicitly; 'interrupted' tasks resume automatically
RESUMABLE = ("queued", "running", "interrupted")


def new_task_id() -> str:
    return f"task-{int(time.time())}-{secrets.token_hex(3)}"


def parse_plan(text: str, max_steps: int) -> list[str]:
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        return []
    try:
        data = json.loads(match.group(0))
    except ValueError:
        return []
    steps = data.get("steps", []) if isinstance(data, dict) else []
    if not isinstance(steps, list):
        return []
    cleaned = [str(s).strip() for s in steps if str(s).strip()]
    return cleaned[:max_steps]


class TaskRunner:
    def __init__(self, ctx: Context, agent: Agent, router: Router):
        self.ctx = ctx
        self.agent = agent
        self.router = router
        self.memory = ctx.memory

    # ----- planning -------------------------------------------------------------
    def plan(self, goal: str) -> list[str]:
        max_steps = self.ctx.config.agent.max_plan_steps
        prompt = (f"Break this goal into at most {max_steps} short, concrete steps a phone assistant can do with its "
                  f"tools (workspace files, web search/read, workspace commands, unit tests, memory). "
                  f"Reply ONLY with JSON like {{\"steps\": [\"...\"]}}.\nGoal: {goal}")
        try:
            reply = self.router.chat([{"role": "user", "content": prompt}])
            steps = parse_plan(reply.text, max_steps)
        except LLMError:
            steps = []
        return steps or [goal]

    def create(self, goal: str, steps: list[str] | None = None) -> str:
        task_id = new_task_id()
        steps = steps or self.plan(goal)
        self.memory.create_task(task_id, redact(goal)[:500], [redact(s)[:500] for s in steps])
        self.memory.add_checkpoint(task_id, -1, {"goal": goal, "steps": steps, "completed": []})
        return task_id

    # ----- execution ------------------------------------------------------------
    def run(self, task_id: str) -> dict:
        task = self.memory.get_task(task_id)
        if task is None:
            raise KeyError(f"no such task: {task_id}")
        if task["status"] in TERMINAL:
            return task
        if task["status"] == "failed":  # explicit retry: reset only the failed steps
            for step in self.memory.list_steps(task_id):
                if step["status"] == "failed":
                    self.memory.update_step(task_id, step["idx"], status="pending")
        self.memory.set_task_status(task_id, "running")
        steps = self.memory.list_steps(task_id)
        for step in steps:  # a step left 'running' means the process died mid-step: retry it
            if step["status"] == "running":
                self.memory.update_step(task_id, step["idx"], status="pending")
        results: list[str] = [s["result"] or "" for s in steps if s["status"] == "completed"]
        goal = task["goal"]
        ctx = self.ctx
        ctx.task_id = task_id
        try:
            for step in self.memory.list_steps(task_id):
                if step["status"] == "completed":
                    continue
                outcome = self._run_step(task_id, goal, step, results)
                if not outcome.ok:
                    msg = outcome.error or "step failed"
                    # Model offline is not the task's fault: keep it resumable for the daemon.
                    status = "interrupted" if msg.startswith("model unavailable") else "failed"
                    self.memory.set_task_status(task_id, status, f"step {step['idx'] + 1}: {msg}")
                    ctx.log(f"task={task_id} failed at step {step['idx'] + 1}: {msg}")
                    return self.memory.get_task(task_id)
                results.append(outcome.answer)
                self.memory.add_checkpoint(task_id, step["idx"], {
                    "goal": goal, "completed_steps": step["idx"] + 1, "last_result": outcome.answer[:500]})
            verified = all(s["verified"] for s in self.memory.list_steps(task_id))
            if verified:
                self.memory.set_task_status(task_id, "completed")
            else:
                self.memory.set_task_status(task_id, "failed", "some steps were not verified")
        except KeyboardInterrupt:
            self.memory.set_task_status(task_id, "interrupted", "stopped by user; resume with: nova task resume " + task_id)
            raise
        except Exception as exc:  # unexpected crash: keep state so it can be resumed
            self.memory.set_task_status(task_id, "interrupted", f"{type(exc).__name__}: {exc}")
            raise
        finally:
            ctx.task_id = None
        return self.memory.get_task(task_id)

    def _run_step(self, task_id: str, goal: str, step: dict, prior: list[str]):
        retries = self.ctx.config.agent.max_step_retries
        last = None
        history_text = "\n".join(f"- {r[:300]}" for r in prior[-3:]) or "(none yet)"
        base_prompt = (f"Overall goal: {goal}\nCurrent step {step['idx'] + 1}: {step['description']}\n"
                       f"Previous results:\n{history_text}\n"
                       "Do ONLY this step. Use tools when the step needs real actions, then give the final answer.")
        for attempt in range(1, retries + 2):
            self.memory.update_step(task_id, step["idx"], status="running", attempts=step["attempts"] + attempt)
            prompt = base_prompt
            if last is not None and last.error:
                prompt += f"\nPrevious attempt failed: {last.error}. Try a different approach."
            last = self.agent.respond(prompt, history=[], use_rules=(attempt == 1),
                                      rule_text=step["description"])
            if last.ok:
                self.memory.update_step(task_id, step["idx"], status="completed", verified=1,
                                        result=redact(last.answer)[:2000])
                return last
            if last.error.startswith("model unavailable"):
                break  # no point retrying without a model; the task stays resumable
        self.memory.update_step(task_id, step["idx"], status="failed", verified=0,
                                result=redact(last.error if last else "")[:2000])
        last.error = last.error or "step failed"
        return last

    def resume_all(self) -> list[dict]:
        out = []
        for task in self.memory.list_tasks(RESUMABLE):
            out.append(self.run(task["id"]))
        return out
