from __future__ import annotations

import sys
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "github" / "local_ai_agent"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(SOURCE) not in sys.path:
    sys.path.insert(0, str(SOURCE))

from tools.web import DEFAULT_MAX_TEXT_CHARS, RESEARCH_MAX_TEXT_CHARS, SearchResult, WebToolError, _clean_text, _validate_public_url, build_web_tools, research, search


class WebToolsTest(unittest.TestCase):
    def test_web_tools_have_expected_names_and_schemas(self):
        search_tool, fetch_tool, research_tool = build_web_tools()
        self.assertEqual(search_tool.name, "web_search")
        self.assertEqual(fetch_tool.name, "web_fetch")
        self.assertEqual(research_tool.name, "web_research")
        self.assertEqual(search_tool.parameters["required"], ["query"])
        self.assertEqual(fetch_tool.parameters["required"], ["url"])
        self.assertEqual(research_tool.parameters["required"], ["query"])
        self.assertEqual(research_tool.parameters["properties"]["fetch_results"]["maximum"], 3)

    def test_research_keeps_result_order_with_bounded_fetches(self):
        results = [
            SearchResult("One", "https://example.com/1", "first"),
            SearchResult("Two", "https://example.com/2", "second"),
            SearchResult("Three", "https://example.com/3", "third"),
        ]

        def fake_fetch(url, *, timeout_seconds, max_bytes):
            return f"CONTENT:{url}"

        with patch("tools.web.search", return_value=results) as search_mock:
            with patch("tools.web.fetch_page", side_effect=fake_fetch) as fetch_mock:
                payload = research("test", max_results=3, fetch_results=3)

        search_mock.assert_called_once()
        self.assertEqual(fetch_mock.call_count, 3)
        self.assertEqual(
            [item["title"] for item in payload["documents"]],
            ["One", "Two", "Three"],
        )
        self.assertEqual(payload["documents"][1]["content"], "CONTENT:https://example.com/2")

    def test_research_bounds_context_per_document(self):
        results = [SearchResult("One", "https://example.com/1", "first")]

        with patch("tools.web.search", return_value=results):
            with patch(
                "tools.web.fetch_page",
                return_value="x" * (RESEARCH_MAX_TEXT_CHARS + 500),
            ):
                payload = research("test", max_results=1, fetch_results=1)

        content = payload["documents"][0]["content"]
        self.assertLessEqual(len(content), RESEARCH_MAX_TEXT_CHARS + 100)
        self.assertIn("research context truncated", content)

    def test_research_isolates_unexpected_fetch_failure(self):
        results = [
            SearchResult("One", "https://example.com/1", "first"),
            SearchResult("Two", "https://example.com/2", "second"),
        ]

        def fail(url, *, timeout_seconds, max_bytes):
            if url.endswith("/1"):
                raise RuntimeError("boom")
            return "OK"

        with patch("tools.web.search", return_value=results):
            with patch("tools.web.fetch_page", side_effect=fail):
                payload = research("test", max_results=2, fetch_results=2)

        self.assertIn("unexpected fetch failure", payload["documents"][0]["content"])
        self.assertEqual(payload["documents"][1]["content"], "OK")

    def test_search_reuses_short_ttl_cache(self):
        results = [SearchResult("One", "https://example.com/1", "first")]

        with patch("tools.web._search_html", return_value=results) as search_mock:
            first = search("  Nova cache test  ", max_results=1)
            second = search("nova cache test", max_results=1)

        self.assertEqual(first, second)
        search_mock.assert_called_once()

    def test_research_deduplicates_fetch_urls(self):
        results = [
            SearchResult("One", "https://example.com/same", "first"),
            SearchResult("Duplicate", "https://example.com/same", "duplicate"),
            SearchResult("Two", "https://example.com/two", "second"),
        ]

        def fake_fetch(url, *, timeout_seconds, max_bytes):
            return f"CONTENT:{url}"

        with patch("tools.web.search", return_value=results):
            with patch("tools.web.fetch_page", side_effect=fake_fetch) as fetch_mock:
                payload = research("test", max_results=3, fetch_results=3)

        self.assertEqual(fetch_mock.call_count, 2)
        self.assertEqual(
            [item["title"] for item in payload["documents"]],
            ["One", "Two"],
        )

    def test_page_text_is_bounded_for_local_context(self):
        long_html = "<html><body>" + ("word " * (DEFAULT_MAX_TEXT_CHARS // 5 + 100)) + "</body></html>"

        with patch("tools.web.requests.get") as get_mock:
            response = get_mock.return_value
            response.is_redirect = False
            response.status_code = 200
            response.headers = {"Content-Type": "text/html"}
            response.url = "https://example.com/"
            class Raw:
                def read(self, amount, decode_content=True):
                    return long_html.encode("utf-8")
            response.raw = Raw()
            response.__enter__.return_value = response
            response.__exit__.return_value = False
            from tools.web import fetch_page
            content = fetch_page("https://example.com/")

        self.assertLessEqual(
            len(_clean_text(content)),
            DEFAULT_MAX_TEXT_CHARS + 100,
        )
        self.assertIn("text truncated", content)

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
