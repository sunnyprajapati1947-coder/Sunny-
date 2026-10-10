from __future__ import annotations

import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.tool_bridge import build_registry

NEW_TOOLS = [
    "decision_choice", "decision_score", "decision_yes_no",
    "api_weather", "api_currency", "api_dictionary", "api_wikipedia",
    "api_directory_search", "market_analyze", "personal_remember",
    "personal_recall", "personal_forget", "personal_briefing",
    "repo_context_pack", "learning_find_build_guide", "learning_find_books",
    "learning_available_topics", "skills_list", "skills_get",
    "skills_validate", "skills_catalog_search", "web_agent_run",
]


class NewSourceRegistryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = build_registry()
        cls.names = set(cls.registry.names())

    def test_all_new_tools_registered(self):
        missing = [name for name in NEW_TOOLS if name not in self.names]
        self.assertEqual(missing, [])

    def test_first_wave_tools_still_registered(self):
        for name in ("web_search", "web_fetch", "web_research", "github_agent_status",
                     "phone_battery", "youtube_status", "nova_automation_run"):
            self.assertIn(name, self.names)

    def test_new_tools_have_valid_schemas(self):
        for name in NEW_TOOLS:
            tool = self.registry.get(name)
            schema = tool.parameter_schema()
            self.assertEqual(schema["type"], "object", name)
            self.assertIn("properties", schema, name)
            for prop in schema.get("required", []):
                self.assertIn(prop, schema["properties"], name)

    def test_web_agent_run_schema_bounds(self):
        schema = self.registry.get("web_agent_run").parameter_schema()
        self.assertEqual(schema["required"], ["goal"])
        self.assertEqual(schema["properties"]["max_steps"]["maximum"], 5)

    def test_no_high_impact_new_tools(self):
        """Second-wave tools are read-only analysis; none need approval gates."""
        for name in NEW_TOOLS:
            tool = self.registry.get(name)
            self.assertFalse(tool.high_impact, name)

    def test_tool_count(self):
        self.assertGreaterEqual(len(self.names), 46)


if __name__ == "__main__":
    unittest.main()
