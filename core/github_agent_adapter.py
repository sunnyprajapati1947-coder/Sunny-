from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "github" / "local_ai_agent"

if str(SOURCE) not in sys.path:
    sys.path.insert(0, str(SOURCE))

from agent.router import TaskRouter, RouteDecision
from agent.parser import (
    AssistantTurn,
    ToolCall,
    ParseError,
    parse_assistant_message,
)


def build_router(
    fast_model: str = "Qwen3.5-4B-Q4_0",
    strong_model: str = "Qwen3.5-4B-Q4_0",
) -> TaskRouter:
    return TaskRouter(
        fast_key=fast_model,
        strong_key=strong_model,
        enabled=True,
    )


def parse_qwen_message(message: dict) -> AssistantTurn:
    return parse_assistant_message(message)


def route_task(prompt: str) -> RouteDecision:
    router = build_router()
    return router.choose(prompt)


def adapter_status() -> dict:
    return {
        "success": True,
        "source": "MwesigwaLewis/local-ai-agent",
        "components": [
            "agent.loop",
            "agent.router",
            "agent.parser",
            "models.qwen",
        ],
        "mode": "Nova adapter",
        "security_boundary": "NovaToolRegistry",
    }
