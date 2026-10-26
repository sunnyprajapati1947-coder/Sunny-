"""Central tool registry: every capability J.A.R.V.I.S. can execute.

The same registry powers deterministic intents and the LLM's tool-calling
planner, so there is exactly one execution path and one place to audit.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from jarvis.skills import communication, files, media, productivity, system, vision, weather, web


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: dict
    run: Callable[..., dict]
    category: str = "general"
    high_impact: bool = False
    preflight: Callable[..., dict | None] | None = None


def _obj(properties: dict | None = None, required: list[str] | None = None) -> dict:
    schema = {
        "type": "object",
        "properties": properties or {},
        "additionalProperties": False,
    }
    if required:
        schema["required"] = required
    return schema


TEXT = {"type": "string"}

TOOLS: dict[str, Tool] = {}


def register(
    name: str,
    description: str,
    run: Callable[..., dict],
    parameters: dict | None = None,
    *,
    category: str = "general",
    high_impact: bool = False,
    preflight: Callable[..., dict | None] | None = None,
) -> None:
    TOOLS[name] = Tool(
        name=name,
        description=description,
        parameters=parameters or _obj(),
        run=run,
        category=category,
        high_impact=high_impact,
        preflight=preflight,
    )


# ------------------------------------------------------------------ system
register("get_time", "Current local time and day.", system.get_time, _obj(), category="core")
register("get_date", "Today's date and weekday.", system.get_date, _obj(), category="core")
register("system_status", "CPU, memory, disk, battery and network telemetry.", system.system_status, _obj(), category="system")
register("status_report", "Full spoken diagnostic of the machine and assistant state.", system.status_report, _obj(), category="system")
register("battery_status", "Battery charge and charging state.", system.battery_status, _obj(), category="system")
register("network_info", "Local IP, hostname, internet reachability and latency.", system.network_info, _obj(), category="system")
register("internet_speed", "Measure download bandwidth with a speed test.", system.internet_speed, _obj(), category="system")
register(
    "open_app",
    "Open a desktop or web application (chrome, code, terminal, spotify, youtube, gmail...).",
    system.open_app,
    _obj({"app": {**TEXT, "description": "Application name or alias"}}, ["app"]),
    category="system",
)
register(
    "close_app",
    "Close an application window by name.",
    system.close_app,
    _obj({"app": {**TEXT, "description": "Application name"}}, ["app"]),
    category="system",
    high_impact=True,
)
register(
    "open_target",
    "Open a website, application or file path from a single free-form target.",
    system.open_target,
    _obj({"target": {**TEXT, "description": "URL, app name, or path"}}, ["target"]),
    category="system",
)
register(
    "set_volume",
    "Change system volume: absolute level, up, down, mute or unmute.",
    system.set_volume,
    _obj(
        {
            "level": {"type": "integer", "minimum": 0, "maximum": 100},
            "action": {"type": "string", "enum": ["set", "up", "down", "mute", "unmute"]},
        }
    ),
    category="system",
)
register(
    "set_brightness",
    "Set display brightness as a percentage (5-100).",
    system.set_brightness,
    _obj({"level": {"type": "integer", "minimum": 5, "maximum": 100}}, ["level"]),
    category="system",
)
register("lock_screen", "Lock the workstation immediately.", system.lock_screen, _obj(), category="system")
register(
    "window_control",
    "Arrange windows: minimize all, show desktop, or switch window.",
    system.window_action,
    _obj({"action": {"type": "string", "enum": ["minimize_all", "show_desktop", "switch"]}}, ["action"]),
    category="system",
)
register(
    "power",
    "Shut down, reboot or suspend the computer. Requires human approval.",
    system.power,
    _obj({"action": {"type": "string", "enum": ["shutdown", "reboot", "sleep"]}}, ["action"]),
    category="system",
    high_impact=True,
)
register("screenshot", "Capture the screen and return it to the HUD.", system.screenshot, _obj(), category="system")
register(
    "clipboard",
    "Read the clipboard, or copy text into it.",
    system.clipboard,
    _obj({"action": {"type": "string", "enum": ["read", "copy"]}, "text": TEXT}),
    category="system",
)

# -------------------------------------------------------------------- web
register(
    "web_search",
    "Search the web and provide a link (google, youtube, bing, maps, images...).",
    web.web_search,
    _obj({"query": TEXT, "engine": {"type": "string"}}, ["query"]),
    category="web",
)
register("open_url", "Open a specific http(s) URL in the browser.", web.open_url, _obj({"url": TEXT}, ["url"]), category="web")
register(
    "wikipedia",
    "Look up a factual summary from Wikipedia.",
    web.wikipedia,
    _obj({"query": TEXT}, ["query"]),
    category="web",
)
register("news", "Latest headlines, optionally on a topic.", web.news, _obj({"topic": TEXT}), category="web")
register("weather", "Current weather and today's forecast for a city.", weather.weather, _obj({"city": TEXT}), category="weather")

# ------------------------------------------------------------------ media
register(
    "play_music",
    "Play a song or genre from the local music folder, falling back to YouTube.",
    media.play_music,
    _obj({"query": TEXT}),
    category="media",
)
register(
    "media_control",
    "Control the current media player: play/pause, next, previous, stop.",
    media.media_control,
    _obj({"action": {"type": "string", "enum": ["playpause", "pause", "resume", "next", "previous", "stop"]}}, ["action"]),
    category="media",
)
register("now_playing", "Report the track currently playing.", media.now_playing, _obj(), category="media")

# ----------------------------------------------------------- productivity
register("note_add", "Save a note to local storage.", productivity.note_add, _obj({"text": TEXT}, ["text"]), category="productivity")
register(
    "notes_list",
    "List saved notes.",
    productivity.notes_list,
    _obj({"limit": {"type": "integer", "minimum": 1, "maximum": 50}}),
    category="productivity",
)
register("clear_notes", "Erase all notes (requires approval).", productivity.clear_notes, _obj(), category="productivity", high_impact=True)
register("todo_add", "Add an item to the task list.", productivity.todo_add, _obj({"text": TEXT}, ["text"]), category="productivity")
register("todos_list", "List tasks and their completion state.", productivity.todos_list, _obj(), category="productivity")
register("todo_done", "Mark a task complete by number, id or text.", productivity.todo_done, _obj({"ref": TEXT}, ["ref"]), category="productivity")
register("clear_todos", "Erase the task list (requires approval).", productivity.clear_todos, _obj(), category="productivity", high_impact=True)
register(
    "reminder_add",
    "Create a reminder for a natural-language time.",
    productivity.reminder_add,
    _obj({"text": TEXT, "when": TEXT, "due": TEXT}, ["text"]),
    category="productivity",
)
register("reminders_list", "List pending reminders.", productivity.reminders_list, _obj(), category="productivity")
register("reminders_clear", "Cancel every pending reminder.", productivity.clear_reminders, _obj(), category="productivity")
register("reminder_cancel", "Cancel a reminder by number or text.", productivity.reminder_cancel, _obj({"ref": TEXT}, ["ref"]), category="productivity")
register(
    "timer_set",
    "Start a countdown timer.",
    productivity.timer_set,
    _obj(
        {
            "minutes": {"type": "number", "minimum": 0, "maximum": 1440},
            "seconds": {"type": "number", "minimum": 0, "maximum": 86400},
            "label": TEXT,
        }
    ),
    category="productivity",
)
register("timers_list", "List running timers.", productivity.timers_list, _obj(), category="productivity")
register("timer_cancel", "Cancel a timer by id or label.", productivity.timer_cancel, _obj({"ref": TEXT}), category="productivity")
register("alarm_set", "Set a daily alarm for a clock time.", productivity.alarm_set, _obj({"time": TEXT, "label": TEXT}, ["time"]), category="productivity")
register("alarms_list", "List configured alarms.", productivity.alarms_list, _obj(), category="productivity")
register(
    "remember",
    "Store a durable fact about the user.",
    productivity.remember,
    _obj({"fact": TEXT, "key": TEXT, "value": TEXT}),
    category="memory",
)
register("recall", "Retrieve a stored fact, or list all facts.", productivity.recall, _obj({"key": TEXT}), category="memory")
register("forget", "Delete a stored fact.", productivity.forget, _obj({"key": TEXT}, ["key"]), category="memory")
register(
    "calculate",
    "Evaluate arithmetic safely (supports sqrt, sin, cos, log, powers).",
    productivity.calculate,
    _obj({"expression": TEXT}, ["expression"]),
    category="utility",
)
register(
    "convert_units",
    "Convert units of length, mass, volume, data, speed or temperature.",
    productivity.convert_units,
    _obj(
        {
            "value": {"type": "number"},
            "from_unit": TEXT,
            "to_unit": TEXT,
        },
        ["value", "from_unit", "to_unit"],
    ),
    category="utility",
)
register("joke", "Tell a short joke.", productivity.joke, _obj(), category="leisure")
register("quote", "Share a motivational quote.", productivity.quote, _obj(), category="leisure")
register("fun_fact", "Share an interesting fact.", productivity.fun_fact, _obj(), category="leisure")
register("coin_flip", "Flip a coin.", productivity.coin_flip, _obj(), category="leisure")
register("roll_dice", "Roll a die.", productivity.roll_dice, _obj({"sides": {"type": "integer", "minimum": 2, "maximum": 1000}}), category="leisure")
register(
    "random_number",
    "Pick a random integer within a range.",
    productivity.random_number,
    _obj({"low": {"type": "integer"}, "high": {"type": "integer"}}),
    category="leisure",
)
register("briefing", "Full daily briefing: date, weather, tasks, reminders, headlines.", productivity.briefing, _obj(), category="core")
register("history_search", "Search the assistant's conversation history.", productivity.history_search, _obj({"query": TEXT}), category="memory")

# ----------------------------------------------------------- communication
register(
    "whatsapp_send",
    "Open WhatsApp with a message ready to send (requires approval).",
    communication.whatsapp_send,
    _obj({"contact": TEXT, "message": TEXT}, ["contact"]),
    category="communication",
    high_impact=True,
    preflight=communication.whatsapp_preflight,
)
register(
    "email_compose",
    "Open a pre-filled email draft (requires approval).",
    communication.email_compose,
    _obj({"to": TEXT, "subject": TEXT, "body": TEXT}, ["to"]),
    category="communication",
    high_impact=True,
    preflight=communication.email_preflight,
)
register(
    "call_contact",
    "Start a phone call using a saved contact or number (requires approval).",
    communication.call_contact,
    _obj({"contact": TEXT}, ["contact"]),
    category="communication",
    high_impact=True,
    preflight=communication.call_preflight,
)
register(
    "save_contact",
    "Save a phone number or email for a person.",
    communication.save_contact,
    _obj({"name": TEXT, "phone": TEXT, "email": TEXT}, ["name"]),
    category="communication",
)
register("list_contacts", "List saved contacts.", communication.list_contacts, _obj(), category="communication")

# ------------------------------------------------------------------ files
register("list_dir", "List files and folders in a directory.", files.list_dir, _obj({"path": TEXT}), category="files")
register("find_file", "Search for files by name under the home directory.", files.find_file, _obj({"name": TEXT, "path": TEXT}, ["name"]), category="files")
register(
    "create_file",
    "Write a text file inside the home or Jarvis data folder (requires approval).",
    files.create_file,
    _obj({"path": TEXT, "content": TEXT}, ["path"]),
    category="files",
    high_impact=True,
    preflight=files.create_preflight,
)
register(
    "delete_file",
    "Delete a single file inside the home directory (requires approval).",
    files.delete_file,
    _obj({"path": TEXT}, ["path"]),
    category="files",
    high_impact=True,
    preflight=files.delete_preflight,
)
register("read_file", "Read the text contents of a file.", files.read_file, _obj({"path": TEXT}, ["path"]), category="files")
register("open_path", "Open a file or folder with the default application.", files.open_path, _obj({"path": TEXT}, ["path"]), category="files")

# ----------------------------------------------------------------- vision
register(
    "vision_look_at_screen",
    "Capture the screen and describe it with the vision model (requires approval).",
    vision.look_at_screen,
    _obj({"question": TEXT}),
    category="vision",
    high_impact=True,
)


def get(name: str) -> Tool | None:
    return TOOLS.get(name)


def names() -> list[str]:
    return sorted(TOOLS)


def by_category() -> dict[str, list[Tool]]:
    grouped: dict[str, list[Tool]] = {}
    for tool in TOOLS.values():
        grouped.setdefault(tool.category, []).append(tool)
    for items in grouped.values():
        items.sort(key=lambda item: item.name)
    return dict(sorted(grouped.items()))


def validate(tool: Tool, arguments: dict[str, Any]) -> tuple[bool, str]:
    if not isinstance(arguments, dict):
        return False, "Tool arguments must be an object."
    properties = tool.parameters.get("properties", {})
    required = tool.parameters.get("required", [])

    missing = [key for key in required if key not in arguments or arguments[key] is None]
    if missing:
        return False, "Missing required arguments: " + ", ".join(missing)

    unknown = [key for key in arguments if key not in properties]
    if tool.parameters.get("additionalProperties") is False and unknown:
        return False, "Unknown arguments: " + ", ".join(unknown)

    type_map = {
        "string": str,
        "number": (int, float),
        "integer": int,
        "boolean": bool,
        "object": dict,
        "array": list,
    }
    for key, value in arguments.items():
        spec = properties.get(key) or {}
        expected = spec.get("type")
        if expected not in type_map:
            continue
        if expected == "number" and isinstance(value, bool):
            return False, f"Argument {key} must be a number."
        if expected == "integer" and (isinstance(value, bool) or not isinstance(value, int)):
            if isinstance(value, float) and value.is_integer():
                arguments[key] = int(value)
            else:
                return False, f"Argument {key} must be an integer."
        elif not isinstance(value, type_map[expected]):
            return False, f"Argument {key} must be {expected}."
        enum = spec.get("enum")
        if enum and value not in enum:
            return False, f"Argument {key} must be one of: {', '.join(map(str, enum))}."
        if expected in {"number", "integer"} and "minimum" in spec and value < spec["minimum"]:
            return False, f"Argument {key} is below the minimum."
        if expected in {"number", "integer"} and "maximum" in spec and value > spec["maximum"]:
            return False, f"Argument {key} exceeds the maximum."
    return True, ""


def schema_for_llm() -> list[dict]:
    """Compact schemas for the planner prompt."""
    payload = []
    for tool in TOOLS.values():
        payload.append(
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            }
        )
    return payload
