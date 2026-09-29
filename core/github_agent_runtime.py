from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "github" / "local_ai_agent"

if str(SOURCE) not in sys.path:
    sys.path.insert(0, str(SOURCE))

from agent.loop import Agent
from config import Config
from models.qwen import QwenClient

from tasks.task_state import TaskState
from tasks.task_queue import NovaTaskQueue
from tasks.verified_queue import NovaVerifiedQueue
from core.tool_router import NovaToolRouter


class NovaGitHubToolBridge:
    def __init__(self, nova_registry, verified_queue=None):
        self.nova_registry = nova_registry
        self.tool_router = NovaToolRouter(min_score=1, max_tools=8)

        if verified_queue is None:
            state = TaskState()
            queue = NovaTaskQueue(state)
            verified_queue = NovaVerifiedQueue(queue)

        self.verified_queue = verified_queue

    def get_tool_definitions(self, prompt=""):
        definitions = []

        tools = self.tool_router.select(
            prompt,
            self.nova_registry.list_tools(),
        )

        for tool in tools:
            if not tool.enabled:
                continue

            definitions.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameter_schema(),
                },
            })

        return definitions

    def execute(self, name, arguments):
        task = self.verified_queue.queue.enqueue(
            f"tool:{name}"
        )

        report = self.verified_queue.run_task(
            task,
            lambda _task, current_args:
                self.nova_registry.execute(
                    name,
                    current_args,
                    approved=False,
                ),
            arguments=arguments,
        )

        data = {
            "success": report.success,
            "verified": report.success,
            "attempts": report.attempts + 1,
            "verification": report.verification.reason,
        }

        if report.verification.evidence:
            data["result"] = report.verification.evidence

        class Result:
            def __init__(self, payload):
                self.data = payload

            def content_within(self, limit):
                import json

                text = json.dumps(
                    self.data,
                    ensure_ascii=False,
                    default=str,
                )

                if limit > 0:
                    return text[:limit]

                return text

        return Result(data)


def build_github_agent(nova_registry):
    config = Config()

    client = QwenClient(config)
    bridge = NovaGitHubToolBridge(nova_registry)

    return Agent(
        client=client,
        config=config,
        tools=bridge,
    )


def runtime_status():
    return {
        "success": True,
        "runtime": "GitHub Agent Loop",
        "source": "MwesigwaLewis/local-ai-agent",
        "qwen": "GitHub QwenClient",
        "tools": "NovaToolRegistry",
        "security": "Nova boundary",
    }
