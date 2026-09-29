from __future__ import annotations

import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "github" / "local_ai_agent"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(SOURCE) not in sys.path:
    sys.path.insert(0, str(SOURCE))

from tools.web import WebToolError, _validate_public_url, build_web_tools


class WebToolsTest(unittest.TestCase):
    def test_web_tools_have_expected_names_and_schemas(self):
        search_tool, fetch_tool = build_web_tools()
        self.assertEqual(search_tool.name, "web_search")
        self.assertEqual(fetch_tool.name, "web_fetch")
        self.assertEqual(search_tool.parameters["required"], ["query"])
        self.assertEqual(fetch_tool.parameters["required"], ["url"])

    def test_web_blocks_local_or_unsafe_urls(self):
        urls = [
            "http://127.0.0.1:8080/health",
            "http://localhost:8080/",
            "http://10.0.0.1/",
            "http://192.168.1.1/",
            "http://169.254.169.254/",
            "file:///etc/passwd",
        ]
        for url in urls:
            with self.subTest(url=url):
                with self.assertRaises(WebToolError):
                    _validate_public_url(url)

    def test_web_blocks_url_credentials(self):
        with self.assertRaises(WebToolError):
            _validate_public_url("https://user:pass@example.com/")

    def test_web_accepts_public_https_host(self):
        self.assertEqual(
            _validate_public_url("https://example.com/"),
            "https://example.com/",
        )


if __name__ == "__main__":
    unittest.main()
