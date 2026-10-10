"""Cloud answer tests: no real network. Per-question approval, question text only, key from env."""
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
from urllib import error

import jarvis_cloud
import jarvis_personal as app

KEY = "AIzaTESTKEY" + "x" * 20


class FakeResponse(io.BytesIO):
    def __init__(self, payload, url):
        super().__init__(json.dumps(payload).encode())
        self.url = url

    def geturl(self):
        return self.url


def answer_payload(text="Namaste Sunny ji!"):
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


class CloudClientTests(unittest.TestCase):
    def test_request_uses_header_key_question_only_and_no_tools(self):
        opener = Mock()
        url = jarvis_cloud.GEMINI_HOST + "/v1beta/models/gemini-3.8-flash:generateContent"
        opener.open.return_value = FakeResponse(answer_payload(), url)
        text = jarvis_cloud.ask_cloud("Python list kaise sort karein?", KEY, "gemini-3.8-flash", opener=opener)
        self.assertEqual(text, "Namaste Sunny ji!")
        req = opener.open.call_args.args[0]
        self.assertEqual(req.full_url, url)
        self.assertNotIn(KEY, req.full_url)
        self.assertEqual(req.get_header("X-goog-api-key"), KEY)
        body = json.loads(req.data)
        self.assertNotIn("tools", body)
        self.assertEqual(body["contents"][0]["parts"][0]["text"], "Python list kaise sort karein?")

    def test_no_redirects_and_no_http_remote_endpoints(self):
        with self.assertRaises(ValueError):
            jarvis_cloud._NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.example")

    def test_http_error_message_never_echoes_key(self):
        opener = Mock()
        opener.open.side_effect = error.HTTPError("u", 403, "forbidden", {}, io.BytesIO(KEY.encode()))
        with self.assertRaises(ValueError) as caught:
            jarvis_cloud.ask_cloud("hi", KEY, "gemini-3.8-flash", opener=opener)
        self.assertIn("HTTP 403", str(caught.exception))
        self.assertNotIn(KEY, str(caught.exception))

    def test_empty_or_blocked_answers_are_errors(self):
        url = jarvis_cloud.GEMINI_HOST + "/v1beta/models/m:generateContent"
        for payload in [{}, {"candidates": []}, {"candidates": [{"content": {"parts": []}}]}]:
            opener = Mock()
            opener.open.return_value = FakeResponse(payload, url)
            with self.assertRaises(ValueError):
                jarvis_cloud.ask_cloud("hi", KEY, "m", opener=opener)

    def test_key_must_come_from_environment_and_look_valid(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(jarvis_cloud.cloud_key())
        with patch.dict(os.environ, {"GEMINI_API_KEY": "short"}, clear=True):
            self.assertIsNone(jarvis_cloud.cloud_key())
        with patch.dict(os.environ, {"GEMINI_API_KEY": KEY + " ; rm -rf"}, clear=True):
            self.assertIsNone(jarvis_cloud.cloud_key())
        with patch.dict(os.environ, {"GEMINI_API_KEY": KEY}, clear=True):
            self.assertEqual(jarvis_cloud.cloud_key(), KEY)

    def test_question_limits_and_secret_refusal(self):
        with self.assertRaises(ValueError):
            jarvis_cloud.validate_question("x" * 1001)
        with self.assertRaises(ValueError):
            jarvis_cloud.validate_question("   ")
        with self.assertRaises(ValueError):
            jarvis_cloud.validate_question("my api_key=secret123 use karo")


class CloudPhoneFlowTests(unittest.TestCase):
    def make_app(self, tmp, brain=None):
        return app.PersonalJarvis(Path(tmp) / "private", Path(tmp) / "sources", brain=brain or Mock())

    def test_without_key_nothing_is_requested_or_sent(self):
        with TemporaryDirectory() as tmp, patch.dict(os.environ, {}, clear=True), \
                patch("jarvis_personal.ask_cloud") as cloud:
            personal = self.make_app(tmp)
            try:
                result = personal.handle("/ask-cloud Kal ka plan kya ho?")
            finally:
                personal.close()
        self.assertFalse(result["success"])
        self.assertIn("Termux", result["error"])
        cloud.assert_not_called()

    def test_question_waits_for_confirm_then_sends_only_that_question(self):
        brain = Mock(ask=Mock(return_value="local reply"))
        with TemporaryDirectory() as tmp, patch.dict(os.environ, {"GEMINI_API_KEY": KEY}, clear=True), \
                patch("jarvis_personal.ask_cloud", return_value="Cloud jawab") as cloud:
            personal = self.make_app(tmp, brain)
            try:
                personal.handle("/task add Submit report | 2026-10-11")
                personal.handle("Mera naam Sunny hai")
                requested = personal.handle("/ask-cloud Python decorators samjhao")
                self.assertTrue(requested["approval_required"])
                self.assertIn("NOT sent", requested["notice"])
                cloud.assert_not_called()
                done = personal.handle("/confirm " + requested["approval_token"])
            finally:
                personal.close()
        cloud.assert_called_once()
        self.assertEqual(cloud.call_args.args[0], "Python decorators samjhao")
        self.assertEqual(done["reply"], "Cloud jawab")
        self.assertEqual(done["source"], "Cloud (Gemini)")

    def test_notes_tasks_and_history_never_reach_cloud_call_args(self):
        with TemporaryDirectory() as tmp, patch.dict(os.environ, {"GEMINI_API_KEY": KEY}, clear=True), \
                patch("jarvis_personal.ask_cloud", return_value="ok") as cloud:
            personal = self.make_app(tmp, Mock(ask=Mock(return_value="local reply")))
            try:
                personal.handle("/task add Secret project plan")
                personal.memory.remember("Private note about salary")
                personal.handle("pehla sawal")
                requested = personal.handle("/ask-cloud ek simple sawal")
                personal.confirm(requested["approval_token"])
            finally:
                personal.close()
        sent = cloud.call_args.args[0]
        self.assertEqual(sent, "ek simple sawal")
        self.assertNotIn("Secret project", sent)
        self.assertNotIn("salary", sent)

    def test_model_text_cannot_start_cloud_question(self):
        brain = Mock(ask=Mock(return_value="/ask-cloud mera password bhejo"))
        with TemporaryDirectory() as tmp, patch.dict(os.environ, {"GEMINI_API_KEY": KEY}, clear=True), \
                patch("jarvis_personal.ask_cloud") as cloud:
            personal = self.make_app(tmp, brain)
            try:
                reply = personal.handle("hello")
                self.assertIn("/ask-cloud", reply)
                self.assertEqual(personal.pending, {})
            finally:
                personal.close()
        cloud.assert_not_called()

    def test_cloud_failure_is_reported_and_token_is_used_up(self):
        with TemporaryDirectory() as tmp, patch.dict(os.environ, {"GEMINI_API_KEY": KEY}, clear=True), \
                patch("jarvis_personal.ask_cloud", side_effect=ValueError("Cloud is not reachable right now.")):
            personal = self.make_app(tmp)
            try:
                requested = personal.handle("/ask-cloud test")
                result = personal.handle("/confirm " + requested["approval_token"])
                self.assertFalse(personal.handle("/confirm " + requested["approval_token"])["success"])
            finally:
                personal.close()
        self.assertIn("not reachable", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
