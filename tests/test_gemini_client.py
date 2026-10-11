from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from core import gemini_client


class GeminiClientTest(unittest.TestCase):
    def test_missing_key_is_safe(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": ""}):
            result = gemini_client.ask("hello")
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "not_configured")

    def test_success_maps_history_and_system_prompt(self):
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return json.dumps({
                    "candidates": [{"content": {"parts": [{"text": "Namaste Boss!"}]}}]
                }).encode()

        with patch("core.gemini_client.urlopen", return_value=Response()) as open_mock:
            result = gemini_client.ask(
                "hello",
                api_key="test-secret",
                history=[{"role": "user", "content": "pichli baat"},
                         {"role": "assistant", "content": "haan"}],
                system="Hinglish me jawab do",
            )
        self.assertTrue(result["success"])
        self.assertEqual(result["answer"], "Namaste Boss!")
        request = open_mock.call_args.args[0]
        self.assertEqual(request.get_header("X-goog-api-key"), "test-secret")
        payload = json.loads(request.data)
        self.assertEqual(payload["contents"][1]["role"], "model")
        self.assertIn("systemInstruction", payload)

    def test_network_error_does_not_raise(self):
        from urllib.error import URLError
        with patch("core.gemini_client.urlopen", side_effect=URLError("offline")):
            result = gemini_client.ask("hello", api_key="test-secret")
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "network_error")

    def test_empty_response_is_not_success(self):
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return b'{"candidates":[]}'
        with patch("core.gemini_client.urlopen", return_value=Response()):
            result = gemini_client.ask("hello", api_key="test-secret")
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "empty_response")


if __name__ == "__main__":
    unittest.main()
