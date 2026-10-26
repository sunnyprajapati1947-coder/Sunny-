"""Central tool registry: every capability J.A.R.V.I.S. can execute.

The same registry powers deterministic intents and the LLM's tool-calling
planner, so there is exactly one execution path and one place to audit.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from jarvis.skills import (
    assistant,
    communication,
    desktop,
    creator,
    files,
    language,
    media,
    phone,
    productivity,
    system,
    vision,
    weather,
    web,
)


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
register(
    "translate_text",
    "Translate a phrase into another language.",
    language.translate_text,
    _obj(
        {
            "text": {**TEXT, "description": "Text to translate"},
            "target": {**TEXT, "description": "Target language, e.g. hindi"},
            "source": {**TEXT, "description": "Source language or auto"},
        },
        ["text"],
    ),
    category="web",
)
register(
    "seo_pack",
    "Build a YouTube SEO pack: titles, description and tags.",
    creator.build_seo_pack,
    _obj({"topic": {**TEXT, "description": "Video topic"}}),
    category="web",
)
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
register(
    "random_advice",
    "Give one piece of practical advice.",
    productivity.random_advice,
    _obj(),
    category="leisure",
)
register(
    "wake_greeting",
    "Greet the owner when they get home and summarise pending work.",
    productivity.wake_greeting,
    _obj(),
    category="core",
)
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
register(
    "edit_file",
    "Replace one exact snippet in a file, with a backup (requires approval).",
    files.edit_file,
    _obj({"path": TEXT, "find": TEXT, "replace": TEXT, "occurrence": {"type": "integer"}}, ["path", "find"]),
    category="files",
    high_impact=True,
    preflight=files.edit_preflight,
)
register(
    "run_tests",
    "Run the project's own pytest/unittest/npm suite (requires approval).",
    files.run_tests,
    _obj({"path": TEXT, "timeout": {"type": "integer"}}),
    category="files",
    high_impact=True,
)
register("read_file", "Read the text contents of a file.", files.read_file, _obj({"path": TEXT}, ["path"]), category="files")
register(
    "import_data",
    "Import key/value facts from a JSON/CSV/TXT file into long-term memory.",
    files.import_data,
    _obj({"path": {**TEXT, "description": "Dataset file path"}}),
    category="files",
)
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


# ------------------------------------------------------- brain, agent, memory
register(
    "brain_status",
    "Report the local Qwen lanes, runtime, recommended model and provider routing.",
    assistant.brain_status,
    _obj(),
    category="brain",
)
register(
    "brain_setup",
    "Show exact Ollama / llama.cpp commands to install the recommended local Qwen model.",
    assistant.brain_setup,
    _obj(),
    category="brain",
)
register(
    "brain_test",
    "Ping the fastest live local lane and measure latency.",
    assistant.brain_test,
    _obj(),
    category="brain",
)
register(
    "brain_chat",
    "Ask the local Qwen model directly, bypassing the cloud provider.",
    assistant.brain_chat,
    _obj(
        {
            "message": {**TEXT, "description": "Question for the local model"},
            "task": {"type": "string", "enum": ["general", "deep", "code"]},
        },
        ["message"],
    ),
    category="brain",
)
register(
    "agent_run",
    "Run the bounded multi-step agent on a goal; writes task_plan/findings/progress to disk.",
    assistant.agent_run,
    _obj(
        {
            "goal": {**TEXT, "description": "What should the agent accomplish?"},
            "max_steps": {"type": "integer", "minimum": 1, "maximum": 12},
        },
        ["goal"],
    ),
    category="agent",
)
register("agent_status", "Agent readiness, step budget and recent plans.", assistant.agent_status, _obj(), category="agent")
register(
    "plan_create",
    "Create a persistent plan with numbered steps on disk.",
    assistant.plan_create,
    _obj({"goal": TEXT, "steps": {**TEXT, "description": "Semicolon or newline separated steps"}}, ["goal"]),
    category="agent",
)
register("plan_show", "List plans or show one plan's checklist.", assistant.plan_show, _obj({"ref": TEXT}), category="agent")
register(
    "plan_update",
    "Tick a plan step, close a plan, or attach a finding.",
    assistant.plan_update,
    _obj(
        {
            "ref": {**TEXT, "description": "Plan id, goal keyword or index"},
            "step": {**TEXT, "description": "Step number or text to complete"},
            "status": {"type": "string", "enum": ["complete", "active", "blocked"]},
            "finding": {**TEXT, "description": "Evidence to record"},
        },
        ["ref"],
    ),
    category="agent",
)
register(
    "memory_search",
    "Search the long-term memory journal; empty query shows statistics.",
    assistant.memory_search,
    _obj({"query": TEXT}),
    category="memory",
)
register(
    "memory_save",
    "Store an observation in the long-term memory journal (credentials refused).",
    assistant.memory_save,
    _obj({"text": TEXT, "kind": {**TEXT, "description": "note, preference, decision, episode, fact"}}, ["text"]),
    category="memory",
)
register(
    "email_send",
    "Send a real email through the configured SMTP account (requires approval).",
    communication.email_send,
    _obj(
        {
            "to": {**TEXT, "description": "Recipient address or contact name"},
            "subject": TEXT,
            "body": {**TEXT, "description": "Plain-text body"},
        },
        ["to"],
    ),
    category="communication",
    high_impact=True,
    preflight=communication.email_send_preflight,
)
register(
    "calendar_event",
    "Create a real .ics calendar event and a reminder from natural language.",
    communication.calendar_event,
    _obj(
        {
            "title": {**TEXT, "description": "Event title (optional if given inside when)"},
            "when": {**TEXT, "description": "Free text like 'tomorrow at 5 pm'"},
            "duration_minutes": {"type": "integer", "minimum": 5, "maximum": 1440},
            "location": TEXT,
            "remind": {"type": "boolean"},
        }
    ),
    category="productivity",
    preflight=communication.calendar_event_preflight,
)
register(
    "whatsapp_autosend",
    "Open WhatsApp Desktop with a chat prefilled and press Enter (needs desktop armed + approval).",
    communication.whatsapp_autosend,
    _obj(
        {
            "contact": {**TEXT, "description": "Contact name or phone number"},
            "message": TEXT,
        },
        ["contact", "message"],
    ),
    category="communication",
    high_impact=True,
    preflight=communication.whatsapp_autosend_preflight,
)
register(
    "focus_mode",
    "Turn ADHD-friendly output on or off: short, numbered, one next action.",
    assistant.focus_mode,
    _obj({"action": {"type": "string", "enum": ["on", "off", "status"]}}),
    category="productivity",
)

register(
    "repo_map",
    "Summarise a repository: languages, key files, pruned tree.",
    assistant.repo_map,
    _obj({"path": {**TEXT, "description": "Directory path (default: current directory)"}}),
    category="files",
)


# ------------------------------------------------------------- phone hand
register(
    "phone_check",
    "Diagnose the Android phone hand (Termux:API): which actions work and how to fix the rest.",
    phone.phone_check,
    _obj(),
    category="phone",
)
register(
    "phone_status",
    "Phone battery, charging state, Wi-Fi and which hands-on actions are available.",
    phone.phone_status,
    _obj(),
    category="phone",
)
register("phone_battery", "Read the phone battery with health and temperature.", phone.phone_battery, _obj(), category="phone")
register(
    "phone_call",
    "Place a real call from the phone (requires approval).",
    phone.phone_call,
    _obj({"contact": {**TEXT, "description": "Contact name or phone number"}}, ["contact"]),
    category="phone",
    high_impact=True,
)
register(
    "phone_sms",
    "Send a real SMS from the phone's SIM (requires approval).",
    phone.phone_sms,
    _obj({"contact": {**TEXT, "description": "Contact name or number"}, "message": TEXT}, ["contact", "message"]),
    category="phone",
    high_impact=True,
    preflight=phone.phone_sms_preflight,
)
register(
    "phone_notify",
    "Post a notification on the phone.",
    phone.phone_notify,
    _obj({"title": TEXT, "message": TEXT}),
    category="phone",
)
register(
    "phone_vibrate",
    "Buzz the phone for a moment.",
    phone.phone_vibrate,
    _obj({"duration_ms": {"type": "integer", "minimum": 50, "maximum": 3000}}),
    category="phone",
)
register(
    "phone_torch",
    "Turn the phone flashlight on, off or toggle it.",
    phone.phone_torch,
    _obj({"action": {"type": "string", "enum": ["on", "off", "toggle"]}}),
    category="phone",
)
register(
    "phone_volume",
    "Read or set a phone volume stream (music, ring, alarm, call...).",
    phone.phone_volume,
    _obj({"level": {"type": "integer", "minimum": 0, "maximum": 100}, "stream": TEXT}),
    category="phone",
)
register(
    "phone_clipboard",
    "Read or write the phone clipboard.",
    phone.phone_clipboard,
    _obj({"action": {"type": "string", "enum": ["read", "write"]}, "text": TEXT}),
    category="phone",
)
register(
    "phone_speak",
    "Speak text out loud through the phone's own speech engine.",
    phone.phone_speak,
    _obj({"text": TEXT}, ["text"]),
    category="phone",
)
register(
    "phone_photo",
    "Take a photo with the phone camera and save it on the phone.",
    phone.phone_photo,
    _obj({"path": TEXT}),
    category="phone",
    high_impact=True,
)
register(
    "phone_contacts",
    "Search the phone's real contact list (optionally import matches).",
    phone.phone_contacts,
    _obj({"query": TEXT, "save": {"type": "boolean"}}),
    category="phone",
)
register(
    "phone_notifications",
    "Read the phone's notification shade.",
    phone.phone_notifications,
    _obj({"limit": {"type": "integer", "minimum": 1, "maximum": 20}}),
    category="phone",
)
register("phone_location", "Get the phone's current location.", phone.phone_location, _obj(), category="phone")
register(
    "phone_open",
    "Open a link or file on the phone itself.",
    phone.phone_open,
    _obj({"target": TEXT}, ["target"]),
    category="phone",
)


# --------------------------------------------------------- desktop control
register(
    "desktop_status",
    "Report platform, display, arming state and available desktop tools.",
    desktop.desktop_status,
    _obj(),
    category="desktop",
)
register(
    "desktop_check",
    "Diagnose desktop control: display, helpers, OCR and exact install command.",
    desktop.desktop_check,
    _obj(),
    category="desktop",
)
register(
    "desktop_arm",
    "Arm or disarm real keyboard/mouse control. Say 'desktop panic' to lock input.",
    desktop.desktop_arm,
    _obj({"action": {"type": "string", "enum": ["on", "off", "status"]}}),
    category="desktop",
)
register(
    "desktop_type",
    "Type text into the active window (clipboard-assisted for long text).",
    desktop.desktop_type,
    _obj({"text": {**TEXT, "description": "Text to type"}, "enter": {"type": "boolean"}}, ["text"]),
    category="desktop",
)
register(
    "desktop_keys",
    "Press a key combination such as ctrl+s, alt+tab or enter.",
    desktop.desktop_keys,
    _obj({"keys": {**TEXT, "description": "Combination like ctrl+shift+t"}}, ["keys"]),
    category="desktop",
)
register(
    "desktop_click",
    "Click the mouse, optionally at screen coordinates.",
    desktop.desktop_click,
    _obj(
        {
            "x": {"type": "integer", "minimum": 0, "maximum": 20000},
            "y": {"type": "integer", "minimum": 0, "maximum": 20000},
            "button": {"type": "string", "enum": ["left", "middle", "right"]},
            "clicks": {"type": "integer", "minimum": 1, "maximum": 3},
        }
    ),
    category="desktop",
)
register(
    "desktop_move",
    "Move the mouse pointer to screen coordinates.",
    desktop.desktop_move,
    _obj({"x": {"type": "integer", "minimum": 0}, "y": {"type": "integer", "minimum": 0}}, ["x", "y"]),
    category="desktop",
)
register(
    "desktop_windows",
    "List visible window titles.",
    desktop.desktop_windows,
    _obj(),
    category="desktop",
)
register(
    "desktop_focus",
    "Focus a window by title or app name.",
    desktop.desktop_focus,
    _obj({"title": {**TEXT, "description": "Window title or app name"}}, ["title"]),
    category="desktop",
)
register(
    "desktop_read_screen",
    "Screenshot the screen and read it with OCR, falling back to local Qwen-VL.",
    desktop.desktop_read_screen,
    _obj({"question": {**TEXT, "description": "Optional question for vision"}}),
    category="desktop",
)
