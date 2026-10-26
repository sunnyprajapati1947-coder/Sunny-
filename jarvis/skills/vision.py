"""Vision: 'Jarvis has eyes' — screen and camera analysis via the brain."""
from __future__ import annotations

from pathlib import Path

from jarvis.skills import system
from jarvis.util import reply


def look_at_screen(question: str = "") -> dict:
    shot = system.screenshot()
    path = (shot.get("data") or {}).get("path")
    if not path:
        return shot

    from jarvis.brain import get_brain

    brain = get_brain()
    if not brain.vision_available():
        return reply(
            "I captured the screen, Sir, but my vision link is offline. "
            "Set GEMINI_API_KEY to let me describe what I see.",
            speech="I captured the screen, but my vision link is offline, Sir.",
            cards=shot.get("cards", []),
        )

    analysis = brain.vision_file(Path(path), question or "Describe this screen concisely for the user.")
    if not analysis.get("ok"):
        return reply(
            f"I captured the screen, Sir, but could not analyse it: {analysis.get('error')}.",
            speech="I captured the screen but could not analyse it, Sir.",
            cards=shot.get("cards", []),
        )
    return reply(
        analysis["text"],
        speech=analysis.get("speech") or analysis["text"],
        cards=[*shot.get("cards", []), {"type": "text", "title": "VISION ANALYSIS", "body": analysis["text"]}],
        data={"path": path},
    )


def describe_image(image: str, question: str = "") -> dict:
    from jarvis.brain import get_brain

    result = get_brain().vision(image, question or "Describe this image concisely.")
    if not result.get("ok"):
        return reply(
            result.get("error") or "My vision link is offline, Sir.",
            speech="My vision link is offline, Sir.",
        )
    return reply(
        result["text"],
        speech=result.get("speech") or result["text"],
        cards=[{"type": "text", "title": "VISION ANALYSIS", "body": result["text"]}],
    )
