from __future__ import annotations

import sys
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import public_api_tools as pat


class PublicApiToolsTest(unittest.TestCase):
    def test_weather_parses_wttr_payload(self):
        payload = {
            "current_condition": [{
                "temp_C": "31", "FeelsLikeC": "36", "humidity": "70",
                "windspeedKmph": "12",
                "weatherDesc": [{"value": "Partly cloudy"}],
            }],
            "nearest_area": [{
                "areaName": [{"value": "Delhi"}],
                "region": [{"value": "Delhi"}],
            }],
        }
        with patch.object(pat, "_get_json", return_value=payload):
            result = pat.api_weather("Delhi")
        self.assertTrue(result["success"])
        self.assertEqual(result["location"], "Delhi")
        self.assertEqual(result["temperature_c"], "31")
        self.assertEqual(result["description"], "Partly cloudy")

    def test_weather_offline_fails_gracefully(self):
        with patch.object(pat, "_get_json", side_effect=OSError("offline")):
            result = pat.api_weather("Delhi")
        self.assertFalse(result["success"])
        self.assertIn("offline", result["error"] or "failed")

    def test_weather_rejects_bad_location(self):
        self.assertFalse(pat.api_weather("   ")["success"])

    def test_currency_parses_frankfurter_payload(self):
        payload = {"base": "USD", "date": "2026-10-09", "rates": {"INR": 88.5}}
        with patch.object(pat, "_get_json", return_value=payload):
            result = pat.api_currency("usd", "inr", 10)
        self.assertTrue(result["success"])
        self.assertEqual(result["converted"], 88.5)
        self.assertEqual(result["base"], "USD")

    def test_currency_validates_codes(self):
        self.assertFalse(pat.api_currency("D", "INR")["success"])
        self.assertFalse(pat.api_currency("USD", "X")["success"])

    def test_dictionary_parses_payload(self):
        payload = [{
            "word": "agent",
            "meanings": [{
                "partOfSpeech": "noun",
                "definitions": [{"definition": "one who acts for another"}],
            }],
        }]
        with patch.object(pat, "_get_json", return_value=payload):
            result = pat.api_dictionary("agent")
        self.assertTrue(result["success"])
        self.assertEqual(len(result["meanings"]), 1)

    def test_wikipedia_parses_payload(self):
        payload = {
            "title": "JARVIS",
            "extract": "A fictional AI assistant.",
            "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/JARVIS"}},
        }
        with patch.object(pat, "_get_json", return_value=payload):
            result = pat.api_wikipedia("jarvis")
        self.assertTrue(result["success"])
        self.assertEqual(result["title"], "JARVIS")
        self.assertIn("fictional", result["summary"])

    def test_directory_search_offline(self):
        result = pat.api_directory_search("weather")
        self.assertTrue(result["success"])
        self.assertGreater(result["count"], 0)
        self.assertTrue(all("weather" in (a["name"] + a["description"]).lower()
                            for a in result["apis"]))

    def test_directory_search_category_filter(self):
        result = pat.api_directory_search("", category="Weather")
        self.assertTrue(result["success"])
        self.assertTrue(all(a["category"] == "Weather" for a in result["apis"]))

    def test_disabled_tools(self):
        with patch.dict("os.environ", {"NOVA_PUBLIC_API_TOOLS_ENABLED": "false"}):
            self.assertFalse(pat.api_weather("Delhi")["success"])
            self.assertFalse(pat.api_currency("USD", "INR")["success"])
            self.assertFalse(pat.api_dictionary("agent")["success"])
            self.assertFalse(pat.api_wikipedia("JARVIS")["success"])


if __name__ == "__main__":
    unittest.main()
