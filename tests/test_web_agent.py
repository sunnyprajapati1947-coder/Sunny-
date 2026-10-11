from __future__ import annotations

import sys
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import web_agent as wa


class FakeResult:
    def __init__(self, title, url, snippet=""):
        self.title = title
        self.url = url
        self.snippet = snippet


PAGE_WITH_LINKS = (
    "The Nova assistant page. Nova is a local-first assistant built in 2026. "
    "[More about Nova](https://example.com/nova-details) "
    "[Unrelated ads](https://example.com/ads) "
    "The Nova local lanes run Qwen models on device."
)
PAGE_WITH_FINDING = (
    "Nova release notes. The Nova assistant now supports skill packs. "
    "Nova skills are validated on load."
)


class WebAgentTest(unittest.TestCase):
    def test_search_seeds_element_table(self):
        with patch.object(wa, "search", return_value=[
            FakeResult("Nova assistant guide", "https://example.com/nova"),
            FakeResult("Ads page", "https://example.com/ads"),
        ]) as search_mock, patch.object(wa, "fetch_page", return_value=PAGE_WITH_LINKS):
            result = wa.web_agent_run("What is the Nova assistant?")
        search_mock.assert_called_once()
        self.assertTrue(result["success"])
        self.assertIn('TYPE_TEXT', result["operations"][0])
        self.assertTrue(any(op.startswith("CLICK [") for op in result["operations"]))
        self.assertTrue(result["findings"])
        self.assertTrue(all(u.startswith("http") for u in result["sources"]))

    def test_no_search_results(self):
        with patch.object(wa, "search", return_value=[]):
            result = wa.web_agent_run("anything")
        self.assertFalse(result["success"])

    def test_blocked_when_nothing_matches(self):
        with patch.object(wa, "search", return_value=[
            FakeResult("Cooking recipes", "https://example.com/food"),
        ]), patch.object(wa, "fetch_page", return_value="Pasta recipe page."):
            result = wa.web_agent_run("quantum computing benchmarks")
        # The only element never matches the goal -> BLOCKED, no fake findings.
        self.assertFalse(result["success"])
        self.assertTrue(any(op.startswith("BLOCKED") for op in result["operations"]))

    def test_start_url_requires_http(self):
        result = wa.web_agent_run("goal", start_url="file:///etc/passwd")
        self.assertFalse(result["success"])

    def test_goal_required(self):
        self.assertFalse(wa.web_agent_run("   ")["success"])

    def test_step_budget_is_bounded(self):
        pages = [FakeResult("Nova", "https://example.com/a")]
        with patch.object(wa, "search", return_value=pages) as search_mock, \
             patch.object(wa, "fetch_page", return_value=PAGE_WITH_LINKS):
            result = wa.web_agent_run("Nova assistant", max_steps=99)
        # The loop may not run more than MAX_STEPS fetches even if asked.
        self.assertLessEqual(
            sum(1 for op in result["operations"] if op.startswith("CLICK")),
            wa.MAX_STEPS,
        )

    def test_disabled(self):
        import os
        with patch.dict(os.environ, {"NOVA_WEB_AGENT_ENABLED": "false"}):
            self.assertFalse(wa.web_agent_run("goal")["success"])


if __name__ == "__main__":
    unittest.main()
