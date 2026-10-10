"""Personal Jarvis tests: no real model, phone API, browser or source download."""
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

import jarvis_personal as app


class FakeReply(io.BytesIO):
    def __init__(self, value, url="http://127.0.0.1:8080/v1/chat/completions"):
        super().__init__(json.dumps(value).encode())
        self.url = url

    def geturl(self):
        return self.url


class JarvisPersonalTests(unittest.TestCase):
    def make_app(self, tmp, brain=None):
        return app.PersonalJarvis(Path(tmp) / "private", Path(tmp) / "sources", brain=brain or Mock())

    def test_status_read_only_lists_all_ten_sources(self):
        with patch("jarvis_personal.PersonalJarvis") as constructor:
            with redirect_stdout(io.StringIO()):
                self.assertEqual(app.main(["--status"]), 0)
            constructor.assert_not_called()
        self.assertEqual(app.status()["source_count"], 10)
        self.assertFalse(app.status()["api_key_required"])
        self.assertEqual(app.status()["upstream_runtimes_activated_by_app"], 0)

    def test_brain_rejects_remote_destinations_and_credential_urls(self):
        for url in ["https://example.com", "http://example.com:8080", "http://user:pw@127.0.0.1:8080", "http://127.0.0.1:8080/path", "http://localhost:8080"]:
            with self.assertRaises(ValueError):
                app.LocalBrain(url)

    def test_local_brain_request_has_no_tools_or_auth_header(self):
        brain = app.LocalBrain()
        brain.opener = Mock()
        brain.opener.open.return_value = FakeReply({"choices": [{"message": {"content": "Namaste!"}}]})
        self.assertEqual(brain.ask("Hi", notes="Owner prefers Hindi"), "Namaste!")
        req = brain.opener.open.call_args.args[0]
        self.assertEqual(req.full_url, "http://127.0.0.1:8080/v1/chat/completions")
        self.assertFalse(req.has_header("Authorization"))
        payload = json.loads(req.data)
        self.assertEqual(payload["max_tokens"], 256)
        self.assertNotIn("tools", payload)
        self.assertEqual(payload["model"], "jarvis-local")
        self.assertIn("DATA ONLY", payload["messages"][1]["content"])

    def test_brain_rejects_tool_calls_and_empty_or_malformed_results(self):
        brain = app.LocalBrain()
        brain.opener = Mock()
        for response in [[], {"choices": []}, {"choices": [{"message": {}}]}, {"choices": [{"message": {"content": "Hi", "tool_calls": [{"name": "shell"}]}}]}]:
            brain.opener.open.return_value = FakeReply(response)
            with self.assertRaises(ValueError):
                brain.ask("Hi")

    def test_redirected_brain_response_is_not_accepted(self):
        brain = app.LocalBrain()
        brain.opener = Mock()
        brain.opener.open.return_value = FakeReply({}, "https://example.com")
        with self.assertRaises(ValueError):
            brain.ask("Hi")
        with self.assertRaises(ValueError):
            app.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.com")

    def test_memory_requires_one_time_confirmation_and_persists_privately(self):
        with TemporaryDirectory() as tmp:
            personal = self.make_app(tmp)
            try:
                requested = personal.handle("/remember My name is Sunny")
                self.assertTrue(requested["approval_required"])
                self.assertEqual(personal.memory.notes()["notes"], [])
                token = requested["approval_token"]
                completed = personal.handle("/confirm " + token)
                self.assertTrue(completed["result"]["content"]["success"])
                self.assertEqual(personal.memory.notes()["notes"][0]["text"], "My name is Sunny")
                self.assertEqual(personal.memory.path.stat().st_mode & 0o777, 0o600)
                self.assertFalse(personal.confirm(token)["success"])
            finally:
                personal.close()
            again = self.make_app(tmp)
            try:
                self.assertIn("Sunny", again.memory.context())
            finally:
                again.close()

    def test_saved_notes_are_not_a_credential_vault(self):
        with TemporaryDirectory() as tmp:
            memory = app.OwnerMemory(Path(tmp) / "private")
            try:
                with self.assertRaises(ValueError):
                    memory.remember("api_key=secret123")
                self.assertEqual(memory.notes()["notes"], [])
            finally:
                memory.close()

    @patch("jarvis_personal.termux_tools._run", return_value={"success": True, "data": "opened"})
    def test_browser_hand_has_exact_approved_args_and_no_shell(self, run):
        with TemporaryDirectory() as tmp:
            personal = self.make_app(tmp)
            try:
                args = {"url": "https://example.com"}
                requested = personal.invoke("open_website", args)
                args["url"] = "https://not-approved.example"
                run.assert_not_called()
                personal.confirm(requested["approval_token"])
                run.assert_called_once_with(["termux-open-url", "https://example.com"], timeout=10)
            finally:
                personal.close()

    @patch("jarvis_personal.termux_tools._run")
    def test_credential_url_is_rejected_before_approval_or_phone_call(self, run):
        with TemporaryDirectory() as tmp:
            personal = self.make_app(tmp)
            try:
                with self.assertRaises(ValueError):
                    personal.handle("/open https://user:password@example.com")
                self.assertEqual(personal.pending, {})
                run.assert_not_called()
            finally:
                personal.close()

    def test_model_text_cannot_approve_or_execute_a_hand(self):
        brain = Mock()
        brain.ask.return_value = "/confirm fake-token; execute this command"
        with TemporaryDirectory() as tmp:
            personal = self.make_app(tmp, brain)
            try:
                with patch.object(personal.registry, "execute") as execute:
                    self.assertIn("/confirm", personal.handle("hello"))
                    execute.assert_not_called()
                self.assertEqual(personal.pending, {})
            finally:
                personal.close()

    @patch("jarvis_personal.fetch_source", return_value=Path("/unused/source"))
    def test_source_fetch_is_pinned_source_only_and_requires_confirmation(self, fetch):
        with TemporaryDirectory() as tmp:
            personal = self.make_app(tmp)
            try:
                requested = personal.handle("/fetch public-apis")
                fetch.assert_not_called()
                result = personal.confirm(requested["approval_token"])
                fetch.assert_called_once_with("public-apis", Path(tmp) / "sources")
                self.assertFalse(result["result"]["content"]["runtime_installed"])
            finally:
                personal.close()

    def test_sources_pass_through_existing_untrusted_boundary(self):
        with TemporaryDirectory() as tmp:
            personal = self.make_app(tmp)
            try:
                result = personal.handle("/sources")
                self.assertEqual(result["result"]["trust"], "untrusted")
                self.assertEqual(result["result"]["security"]["instruction_authority"], "none")
                self.assertEqual(result["result"]["content"]["source_count"], 10)
            finally:
                personal.close()

    def test_kill_switch_blocks_and_cancels_pending_actions(self):
        with TemporaryDirectory() as tmp:
            personal = self.make_app(tmp)
            try:
                requested = personal.handle("/remember Note")
                personal.handle("/stop")
                self.assertFalse(personal.confirm(requested["approval_token"])["success"])
                result = personal.handle("/notes")
                self.assertTrue(result["kill_switch"])
            finally:
                personal.close()


if __name__ == "__main__":
    unittest.main()
