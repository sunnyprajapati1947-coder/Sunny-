import os, tempfile, unittest
from unittest.mock import patch

from core.fast_router import route, ask

class FastRouterTests(unittest.TestCase):
    def test_short_prompt_uses_fast_lane(self):
        self.assertEqual(route("Choose one niche: AI news"), "fast")

    def test_complex_prompt_uses_deep_lane(self):
        self.assertEqual(route("Research five sources and analyze evidence, then write a detailed script"), "deep")

    def test_fast_falls_back_to_deep(self):
        with patch("core.fast_router._call", side_effect=[None, "deep answer"]):
            result = ask("Choose one niche")
        self.assertTrue(result["success"])
        self.assertEqual(result["lane"], "deep_fallback")

if __name__ == "__main__":
    unittest.main()
