from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ToolRoute:
    name: str
    score: int
    reason: str


class NovaToolRouter:
    """
    Lightweight keyword router.

    It does not execute tools and does not bypass security.
    It only decides which registered tool schemas should be exposed
    to the local model for the current request.
    """

    RULES = {
        "web": (
            "web", "internet", "online", "latest", "news", "search",
            "google", "website", "url", "browse", "current",
        ),
        "browser": (
            "browser", "open site", "website", "page", "click",
            "login", "navigate",
        ),
        "phone": (
            "phone", "android", "termux", "notification", "sms",
            "call", "camera", "location", "wifi", "bluetooth",
        ),
        "market": (
            "stock", "stocks", "share", "crypto", "bitcoin", "btc",
            "forex", "currency", "gold", "silver", "market",
            "trading", "price", "chart", "reliance", "aapl",
        ),
        "youtube": (
            "youtube", "video", "thumbnail", "channel", "upload",
            "shorts", "seo", "title", "description", "tags",
        ),
        "file": (
            "file", "files", "folder", "directory", "read", "write",
            "edit", "code", "python", "script", "document",
        ),
        "git": (
            "git", "github", "commit", "branch", "repository", "repo",
            "pull request", "diff",
        ),
        "memory": (
            "remember", "memory", "previous", "earlier", "saved",
            "preference", "what did i say",
        ),
        "system": (
            "system", "status", "health", "process", "cpu", "ram",
            "storage", "battery", "server",
        ),
    }

    def __init__(self, min_score: int = 1, max_tools: int = 8):
        self.min_score = max(1, min_score)
        self.max_tools = max(1, max_tools)

    @staticmethod
    def _match(text: str, phrase: str) -> bool:
        return re.search(
            rf"(?<!\w){re.escape(phrase)}(?!\w)",
            text,
            re.IGNORECASE,
        ) is not None

    def rank(self, prompt: str, tools) -> list[ToolRoute]:
        text = (prompt or "").strip().lower()
        ranked: list[ToolRoute] = []

        for tool in tools:
            haystack = " ".join(
                (
                    tool.name,
                    tool.category,
                    tool.description,
                )
            ).lower()

            score = 0
            reasons = []

            for category, keywords in self.RULES.items():
                hits = [
                    word for word in keywords
                    if self._match(text, word)
                ]

                if not hits:
                    continue

                if category in tool.category.lower() or any(
                    self._match(haystack, word) for word in hits
                ):
                    score += min(len(hits), 3)
                    reasons.append(category)

            if self._match(text, tool.name.lower()):
                score += 5
                reasons.append("exact tool")

            # Prefer one focused web capability when the user's intent is
            # clear. Fewer exposed schemas reduce model choice overhead.
            if tool.name == "web_research" and any(
                self._match(text, word)
                for word in ("latest", "current", "news", "research", "compare", "what happened")
            ):
                score += 4
                reasons.append("research intent")
            elif tool.name == "web_fetch" and any(
                self._match(text, word)
                for word in ("open", "fetch", "read this", "this url", "this website")
            ):
                score += 4
                reasons.append("fetch intent")
            elif tool.name == "web_search" and any(
                self._match(text, word)
                for word in ("search", "find", "look up", "google")
            ):
                score += 4
                reasons.append("search intent")

            if score >= self.min_score:
                ranked.append(
                    ToolRoute(
                        name=tool.name,
                        score=score,
                        reason=", ".join(dict.fromkeys(reasons))
                        or "keyword match",
                    )
                )

        ranked.sort(
            key=lambda item: (-item.score, item.name)
        )
        return ranked

    def select(self, prompt: str, tools):
        tools = list(tools)

        if not tools:
            return []

        ranked = self.rank(prompt, tools)

        if not ranked:
            # Ambiguous request: keep a small safe fallback instead of
            # exposing every tool to the model.
            return tools[: self.max_tools]

        selected_names = {
            item.name
            for item in ranked[: self.max_tools]
        }

        return [
            tool
            for tool in tools
            if tool.name in selected_names
        ]
