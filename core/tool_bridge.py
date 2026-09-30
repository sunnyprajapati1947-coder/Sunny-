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
    web_search, web_fetch, web_research = build_web_tools(
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
    registry.register(
        NovaTool(
            name=web_research.name,
            category=web_research.category,
            description=web_research.description,
            run=web_research.run,
            parameters=web_research.parameters,
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
    from core.youtube_tools import channel_status, prepare_video, upload_video, youtube_status

    registry.register(
        NovaTool(
            name="youtube_status",
            category="youtube",
            description="Check Nova's local YouTube automation and OAuth readiness.",
            run=youtube_status,
        )
    )
    registry.register(
        NovaTool(
            name="youtube_channel_status",
            category="youtube",
            description="Check the authenticated YouTube channel; never creates a channel.",
            run=channel_status,
        )
    )
    registry.register(
        NovaTool(
            name="youtube_prepare_video",
            category="youtube",
            description="Create a lightweight local video project and YouTube metadata package on Android.",
            run=prepare_video,
            parameters={
                "type": "object",
                "properties": {
                    "topic": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "tags": {"type": "array"},
                    "privacy": {"type": "string", "enum": ["private", "unlisted", "public"]},
                    "aspect": {"type": "string", "enum": ["16:9", "9:16"]},
                    "duration_seconds": {"type": "integer", "minimum": 2, "maximum": 60},
                },
                "required": ["topic"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="youtube_upload_video",
            category="youtube",
            description="Upload one prepared local video to YouTube using OAuth. Uploading requires human approval.",
            run=upload_video,
            high_impact=True,
            parameters={
                "type": "object",
                "properties": {
                    "video_path": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "tags": {"type": "array"},
                    "privacy": {"type": "string", "enum": ["private", "unlisted", "public"]},
                    "category_id": {"type": "string"},
                },
                "required": ["video_path", "title"],
                "additionalProperties": False,
            },
        )
    )

    from core.automation_tools import history as automation_history, run_pipeline

    registry.register(
        NovaTool(
            name="nova_automation_run",
            category="youtube",
            description="Run Nova's local-first content pipeline: generate a topic package with local Qwen when available and render an MP4 with FFmpeg. Never publishes.",
            run=run_pipeline,
            parameters={
                "type": "object",
                "properties": {
                    "topic": {"type": "string"},
                    "aspect": {"type": "string", "enum": ["16:9", "9:16"]},
                    "duration_seconds": {"type": "integer", "minimum": 5, "maximum": 60},
                },
                "required": ["topic"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="nova_automation_history",
            category="youtube",
            description="Read recent Nova automation project history.",
            run=automation_history,
            parameters={
                "type": "object",
                "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 50}},
                "additionalProperties": False,
            },
        )
    )

    return registry
