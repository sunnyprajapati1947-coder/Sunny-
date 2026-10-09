"""Deterministic intent rules (English + Hinglish). They run real tools without the LLM, so Nova
still works when the local model is offline or unsure. Anything not matched goes to the model."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class RuleMatch:
    tool: str
    args: dict


_FILE = r"(?P<path>[\w./\-]+\.[A-Za-z0-9]+)"
_RULES = [
    (re.compile(r"^(?:(?:what(?:'s| is)?\s+(?:the\s+)?)?(?:current\s+)?(?:time|date)(?:\s+(?:is\s+it|today))?"
                r"|what time is it|abhi kitne baje(?: hain)?|aaj ki date(?: kya hai)?|aaj kya date hai|samay|tarikh)\??$", re.I),
     lambda m: RuleMatch("current_time", {})),
    (re.compile(r"^(?:battery|bydaa?ri)(?:\s+(?:kitni(?:\s+hai)?|kitna(?:\s+hai)?|status|level|percentage|percent))?\??$", re.I),
     lambda m: RuleMatch("phone_battery", {})),
    (re.compile(r"^(?:list|show|dikhao)\s+(?:the\s+)?(?:files|folder|directory|files list)(?:\s+(?:in|of)\s+(?P<path>\S+))?$", re.I),
     lambda m: RuleMatch("list_files", {"path": m.group("path") or "."})),
    (re.compile(r"^(?:read|open|padho|dikhao)\s+(?:the\s+)?(?:file\s+)?" + _FILE + r"$", re.I),
     lambda m: RuleMatch("read_file", {"path": m.group("path")})),
    (re.compile(r"^(?:read|open|padho|fetch)\s+(?P<url>https?://\S+)$", re.I),
     lambda m: RuleMatch("read_webpage", {"url": m.group("url")})),
    (re.compile(r"^(?:create|write|likho|banao)\s+(?:a\s+)?(?:file\s+)?" + _FILE + r"\s+(?:with content|with|containing|content|:)\s*(?P<content>.+)$",
                re.I | re.S),
     lambda m: RuleMatch("write_file", {"path": m.group("path"), "content": m.group("content")})),
    (re.compile(r"^(?:search|google|dhundo|khoj)(?:\s+karo)?\s+(?:the web\s+|web\s+|internet\s+)?(?:for\s+)?(?P<query>.{2,200}?)$", re.I),
     lambda m: RuleMatch("web_search", {"query": m.group("query")})),
    (re.compile(r"^(?:remember|yaad rakho)\s+(?:that\s+)?(?:my|mera|meri|mere)?\s*(?P<key>[\w .\-]{1,40}?)\s*(?:=|:|\bis\b|\bhai\b)\s*(?P<value>.+)$", re.I),
     lambda m: RuleMatch("remember", {"key": m.group("key").strip(), "value": m.group("value").strip()})),
    (re.compile(r"^(?:recall|what is my|what's my|mera|meri|mere)\s+(?P<key>[\w .\-]{1,40}?)\s*(?:kya hai|kya|\?)?\s*\??$", re.I),
     lambda m: RuleMatch("recall", {"key": m.group("key").strip()})),
    (re.compile(r"^(?:run tests?|tests? chalao|test chalao)(?:\s+in\s+(?P<path>\S+))?$", re.I),
     lambda m: RuleMatch("run_tests", {"path": m.group("path") or "."})),
]


def match_rule(text: str) -> RuleMatch | None:
    text = " ".join(text.strip().split())
    if not text:
        return None
    for pattern, build in _RULES:
        m = pattern.match(text)
        if m:
            return build(m)
    return None
