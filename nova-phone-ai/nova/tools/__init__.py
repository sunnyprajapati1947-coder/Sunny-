"""Builds the tool registry from all tool modules."""

from nova.tools import builtin, code, files, shell, termux, web
from nova.tools.registry import ToolRegistry


def build_registry() -> ToolRegistry:
    registry = ToolRegistry()
    for module in (files, web, shell, code, termux, builtin):
        registry.extend(module.TOOLS)
    return registry
