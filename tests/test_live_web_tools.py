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
