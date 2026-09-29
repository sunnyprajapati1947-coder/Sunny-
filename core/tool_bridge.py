from __future__ import annotations

from core.tool_registry import NovaTool, NovaToolRegistry
from github.local_ai_agent.tools.web import build_web_tools

from core.termux_tools import (
    battery_status,
    device_volume,
    notify,
    toast,
    vibrate,
)


def build_registry() -> NovaToolRegistry:
    """
    Initial Nova registry.

    GitHub tools will be connected one-by-one after compatibility tests.
    Nothing dangerous is enabled automatically.
    """

    registry = NovaToolRegistry()
    web_search, web_fetch = build_web_tools(
        timeout=10.0,
        max_bytes=120_000,
    )

    registry.register(
        NovaTool(
            name=web_search.name,
            category=web_search.category,
            description=web_search.description,
            run=web_search.run,
            parameters=web_search.parameters,
        )
    )
    registry.register(
        NovaTool(
            name=web_fetch.name,
            category=web_fetch.category,
            description=web_fetch.description,
            run=web_fetch.run,
            parameters=web_fetch.parameters,
        )
    )


    def github_agent_status():
        return {
            "success": True,
            "source": "MwesigwaLewis/local-ai-agent",
            "status": "imported",
            "mode": "adapter-only",
        }

    registry.register(
        NovaTool(
            name="github_agent_status",
            category="core",
            description="Check the imported GitHub Agent Core status.",
            run=github_agent_status,
        )
    )

    registry.register(
        NovaTool(
            name="phone_battery",
            category="phone",
            description="Read the Android device battery status through Termux API.",
            run=battery_status,
        )
    )

    registry.register(
        NovaTool(
            name="phone_volume",
            category="phone",
            description="Read Android audio volume levels through Termux API.",
            run=device_volume,
        )
    )

    registry.register(
        NovaTool(
            name="phone_notification",
            category="phone",
            description="Send a notification to the Android device.",
            run=notify,
            parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["title", "content"],
                "additionalProperties": False,
            },
        )
    )

    registry.register(
        NovaTool(
            name="phone_toast",
            category="phone",
            description="Show a short Android toast message.",
            run=toast,
            parameters={
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                },
                "required": ["message"],
                "additionalProperties": False,
            },
        )
    )

    registry.register(
        NovaTool(
            name="phone_vibrate",
            category="phone",
            description="Trigger a short Android vibration.",
            run=vibrate,
            parameters={
                "type": "object",
                "properties": {
                    "duration_ms": {
                        "type": "integer",
                        "minimum": 50,
                        "maximum": 3000,
                    },
                },
                "additionalProperties": False,
            },
        )
    )

    return registry
