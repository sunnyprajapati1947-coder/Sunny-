from __future__ import annotations

import unittest
from unittest.mock import patch

import requests

from github.local_ai_agent.tools import web


class WebSearchFallbackTests(unittest.TestCase):
    def test_google_news_rss_parser(self):
        class Response:
            content = b"""<?xml version="1.0" encoding="UTF-8"?>
            <rss><channel><item>
              <title>AI research update</title>
              <link>https://example.com/story</link>
              <description>New public research details.</description>
            </item></channel></rss>"""

            def raise_for_status(self):
                return None

        with patch.object(web.requests, "get", return_value=Response()), \
             patch.object(web, "_validate_public_url", side_effect=lambda value: value):
            results = web._search_google_news("AI research", 3, 5.0)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].title, "AI research update")
        self.assertEqual(results[0].url, "https://example.com/story")
        self.assertIn("public research", results[0].snippet)

    def test_research_fetch_follows_each_validated_redirect(self):
        responses = [
            "HTTP 302 redirect to https://news.google.com/next. Redirects are not followed automatically; fetch that URL directly.",
            "HTTP 200 https://publisher.example/story\n" + ("Verified article text. " * 20),
        ]
        with patch.object(web, "_validate_public_url", side_effect=lambda value: value), \\
             patch.object(web, "fetch_page", side_effect=responses) as fetch:
            content = web._fetch_research_page("https://news.google.com/start")
        self.assertTrue(content.startswith("HTTP 200"))
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(fetch.call_args_list[1].args[0], "https://news.google.com/next")

    def test_empty_duckduckgo_results_use_news_fallback(self):
        fallback = [web.SearchResult("News result", "https://example.com/news", "Current detail")]
        with patch.object(web, "_search_html", return_value=[]), \
             patch.object(web, "_search_google_news", return_value=fallback):
            results = web.search("unique nova fallback query 2026")
        self.assertEqual(results, fallback)

    def test_duckduckgo_timeout_uses_news_fallback(self):
        fallback = [web.SearchResult("News result", "https://example.com/news", "Current detail")]
        with patch.object(web, "_search_html", side_effect=requests.Timeout()), \
             patch.object(web, "_search_google_news", return_value=fallback):
            results = web.search("unique nova timeout fallback query 2026")
        self.assertEqual(results, fallback)


if __name__ == "__main__":
    unittest.main()
