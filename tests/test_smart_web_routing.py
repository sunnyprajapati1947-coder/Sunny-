from __future__ import annotations

import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.tool_router import NovaToolRouter


class SmartWebRoutingTest(unittest.TestCase):
    class Tool:
        def __init__(self, name, category="web", description=""):
            self.name = name
            self.category = category
            self.description = description

    def setUp(self):
        self.tools = [
            self.Tool("web_search", description="Search the public web."),
            self.Tool("web_fetch", description="Fetch a public URL."),
            self.Tool("web_research", description="Current web research."),
        ]
        self.router = NovaToolRouter(min_score=1, max_tools=1)

    def test_current_question_prefers_research(self):
        selected = self.router.select("What is the latest AI news today?", self.tools)
        self.assertEqual([tool.name for tool in selected], ["web_research"])

    def test_url_request_prefers_fetch(self):
        selected = self.router.select("Open this website and read this URL", self.tools)
        self.assertEqual([tool.name for tool in selected], ["web_fetch"])

    def test_search_request_prefers_search(self):
        selected = self.router.select("Search the web for Qwen updates", self.tools)
        self.assertEqual([tool.name for tool in selected], ["web_search"])


if __name__ == "__main__":
    unittest.main()
