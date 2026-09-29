from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
SOURCE = ROOT / "github" / "local_ai_agent"
if str(SOURCE) not in sys.path:
    sys.path.insert(0, str(SOURCE))

from core.tool_bridge import build_registry


registry = build_registry()
names = registry.names()

assert "web_search" in names
assert "web_fetch" in names

search_schema = registry.get("web_search").parameter_schema()
fetch_schema = registry.get("web_fetch").parameter_schema()

assert search_schema["required"] == ["query"]
assert fetch_schema["required"] == ["url"]

print("NOVA LIVE WEB TOOLS: PASS")
