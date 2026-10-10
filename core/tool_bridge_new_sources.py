"""Second import wave: tools from the new GitHub sources.

Registers Nova tools adapted from:
- browser-use/jev-ultrafast        -> web_agent_run
- NandhaKishorM/laya               -> decision_choice / decision_score / decision_yes_no
- open-jarvis/OpenJarvis           -> personal_remember / personal_recall / personal_forget / personal_briefing
- codecrafters-io/build-your-own-x -> learning_find_build_guide (+ learning hub)
- public-apis/public-apis          -> api_weather / api_currency / api_dictionary / api_wikipedia / api_directory_search
- EbookFoundation/free-programming-books -> learning_find_books
- TauricResearch/TradingAgents     -> market_analyze
- trailhq/Graft                    -> repo_context_pack
- VoltAgent/awesome-agent-skills   -> skills_list / skills_get / skills_validate / skills_catalog_search

Same rules as the first wave: everything goes through the registry boundary,
security policy applies before execution, and nothing dangerous is enabled
automatically.
"""
from __future__ import annotations

from core.tool_registry import NovaTool, NovaToolRegistry


def register_new_source_tools(registry: NovaToolRegistry) -> None:
    """Register the second-wave tools on an existing registry."""

    # ---- Laya-inspired System-1 decision engine ---------------------------
    from core.decision_engine import decide_choice, decide_score, decide_yes_no

    registry.register(
        NovaTool(
            name="decision_choice",
            category="decision",
            description="Pick the best option for a situation using Nova's fast local System-1 decision engine (no model call).",
            run=decide_choice,
            parameters={
                "type": "object",
                "properties": {
                    "state": {"type": "string", "description": "The situation text."},
                    "options": {
                        "type": "object",
                        "description": "Mapping of option name to a short description.",
                        "additionalProperties": {"type": "string"},
                    },
                },
                "required": ["state", "options"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="decision_score",
            category="decision",
            description="Score a situation between a low and a high anchor (0.0 to 1.0) with the local decision engine.",
            run=decide_score,
            parameters={
                "type": "object",
                "properties": {
                    "state": {"type": "string"},
                    "low_anchor": {"type": "string", "description": "Description of the low end."},
                    "high_anchor": {"type": "string", "description": "Description of the high end."},
                },
                "required": ["state", "low_anchor", "high_anchor"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="decision_yes_no",
            category="decision",
            description="Fast yes/no judgement with a probability from the local decision engine.",
            run=decide_yes_no,
            parameters={
                "type": "object",
                "properties": {
                    "state": {"type": "string"},
                    "question": {"type": "string"},
                },
                "required": ["state", "question"],
                "additionalProperties": False,
            },
        )
    )

    # ---- public-apis-inspired no-key live skills ---------------------------
    from core.public_api_tools import (
        api_currency,
        api_dictionary,
        api_directory_search,
        api_weather,
        api_wikipedia,
    )

    registry.register(
        NovaTool(
            name="api_weather",
            category="web",
            description="Current weather for a city from wttr.in. No API key required.",
            run=api_weather,
            parameters={
                "type": "object",
                "properties": {"location": {"type": "string"}},
                "required": ["location"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="api_currency",
            category="market",
            description="Convert currency using ECB reference rates from Frankfurter. No API key required.",
            run=api_currency,
            parameters={
                "type": "object",
                "properties": {
                    "base": {"type": "string", "description": "3-letter code, e.g. USD."},
                    "target": {"type": "string", "description": "3-letter code, e.g. INR."},
                    "amount": {"type": "number", "minimum": 0},
                },
                "required": ["base", "target"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="api_dictionary",
            category="learning",
            description="English word definitions from dictionaryapi.dev. No API key required.",
            run=api_dictionary,
            parameters={
                "type": "object",
                "properties": {"word": {"type": "string"}},
                "required": ["word"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="api_wikipedia",
            category="learning",
            description="Short topic summary from the English Wikipedia REST API. No API key required.",
            run=api_wikipedia,
            parameters={
                "type": "object",
                "properties": {"title": {"type": "string"}},
                "required": ["title"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="api_directory_search",
            category="learning",
            description="Search Nova's curated offline copy of the public-apis directory for free APIs.",
            run=api_directory_search,
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "category": {"type": "string"},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        )
    )

    # ---- TradingAgents-inspired multi-role market analysis ------------------
    from core.trading_desk import market_analyze

    registry.register(
        NovaTool(
            name="market_analyze",
            category="market",
            description="Multi-role market analysis (analyst, bull, bear, trader, risk) for one ticker. Analysis only; Nova never executes trades.",
            run=market_analyze,
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Ticker, e.g. AAPL or RELIANCE.NS."},
                },
                "required": ["symbol"],
                "additionalProperties": False,
            },
        )
    )

    # ---- OpenJarvis-inspired personal profile -------------------------------
    from core.personal_profile import personal_briefing, personal_forget, personal_recall, personal_remember

    registry.register(
        NovaTool(
            name="personal_remember",
            category="memory",
            description="Store one personal fact or preference locally on the device.",
            run=personal_remember,
            parameters={
                "type": "object",
                "properties": {
                    "fact": {"type": "string"},
                    "category": {"type": "string", "enum": ["preference", "fact", "goal", "reminder", "note"]},
                },
                "required": ["fact"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="personal_recall",
            category="memory",
            description="Recall stored personal facts, optionally filtered by keywords.",
            run=personal_recall,
            parameters={
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="personal_forget",
            category="memory",
            description="Remove stored personal facts matching a query (local right-to-be-forgotten).",
            run=personal_forget,
            parameters={
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="personal_briefing",
            category="system",
            description="Compose the owner's local daily briefing: date, goals, reminders, and pending Nova tasks.",
            run=personal_briefing,
            parameters={
                "type": "object",
                "properties": {"owner": {"type": "string"}},
                "additionalProperties": False,
            },
        )
    )

    # ---- Graft-inspired repo context pack -----------------------------------
    from core.context_spec import repo_context_pack

    registry.register(
        NovaTool(
            name="repo_context_pack",
            category="file",
            description="Build a compact, read-only context pack of a repository (tree, languages, import hubs, skeletons) before answering coding questions.",
            run=repo_context_pack,
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Repository or folder path."},
                    "focus": {"type": "string", "description": "Optional words to pick key files."},
                    "write_file": {"type": "boolean", "description": "Also write NOVA_CONTEXT.md into the folder."},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        )
    )

    # ---- build-your-own-x + free-programming-books learning hub -------------
    from core.learning_hub import learning_available_topics, learning_find_books, learning_find_build_guide

    registry.register(
        NovaTool(
            name="learning_find_build_guide",
            category="learning",
            description="Find step-by-step 'build your own X' tutorials for a technology.",
            run=learning_find_build_guide,
            parameters={
                "type": "object",
                "properties": {"topic": {"type": "string"}},
                "required": ["topic"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="learning_find_books",
            category="learning",
            description="Find free programming books for a subject.",
            run=learning_find_books,
            parameters={
                "type": "object",
                "properties": {"subject": {"type": "string"}},
                "required": ["subject"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="learning_available_topics",
            category="learning",
            description="List the topics and subjects Nova's learning hub covers.",
            run=learning_available_topics,
            parameters={"type": "object", "properties": {}, "additionalProperties": False},
        )
    )

    # ---- awesome-agent-skills-inspired skill packs ---------------------------
    from core.skill_loader import skills_catalog_search, skills_get, skills_list, skills_validate

    registry.register(
        NovaTool(
            name="skills_list",
            category="skills",
            description="List Nova's installed local skill packs.",
            run=skills_list,
            parameters={"type": "object", "properties": {}, "additionalProperties": False},
        )
    )
    registry.register(
        NovaTool(
            name="skills_get",
            category="skills",
            description="Load one full skill pack by name.",
            run=skills_get,
            parameters={
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="skills_validate",
            category="skills",
            description="Validate a SKILL.md file without installing it.",
            run=skills_validate,
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
                "additionalProperties": False,
            },
        )
    )
    registry.register(
        NovaTool(
            name="skills_catalog_search",
            category="skills",
            description="Search the curated offline index of the community agent-skills catalog.",
            run=skills_catalog_search,
            parameters={
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
                "additionalProperties": False,
            },
        )
    )

    # ---- jev-ultrafast-inspired bounded web agent loop -----------------------
    from core.web_agent import web_agent_run

    registry.register(
        NovaTool(
            name="web_agent_run",
            category="browser",
            description="Run a bounded goal-driven web task with a jev-style element table and operation trace. Never logs in or submits forms.",
            run=web_agent_run,
            parameters={
                "type": "object",
                "properties": {
                    "goal": {"type": "string"},
                    "query": {"type": "string", "description": "Optional explicit search query."},
                    "start_url": {"type": "string", "description": "Optional http(s) page to start from."},
                    "max_steps": {"type": "integer", "minimum": 1, "maximum": 5},
                },
                "required": ["goal"],
                "additionalProperties": False,
            },
        )
    )
