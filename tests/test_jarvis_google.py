"""Offline Gemini adapter tests. All inference calls are mocked; no real keys/API."""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import tomllib
import unittest
from unittest.mock import Mock, patch

import jarvis_google as app
from jarvis_start import SOURCES

KEY = "test_only_not_a_real_api_key_123456789"


class JarvisGoogleTests(unittest.TestCase):
    def test_source_revision_matches_inventory(self):
        source = next(source for source in SOURCES if source.id == "openjarvis")
        self.assertEqual(app.SOURCE_REVISION, source.revision)

    def test_profile_is_secret_free_and_tools_analytics_are_disabled(self):
        profile = tomllib.loads(app.profile_text())
        self.assertEqual(profile["engine"]["default"], "cloud")
        self.assertEqual(profile["intelligence"]["provider"], "google")
        self.assertEqual(profile["agent"]["default_agent"], "simple")
        self.assertEqual(profile["agent"]["tools"], "")
        self.assertEqual(profile["agent"]["max_turns"], 1)
        self.assertFalse(profile["agent"]["context_from_memory"])
        for section in ["analytics", "telemetry", "traces", "learning"]:
            self.assertFalse(profile[section]["enabled"])
        self.assertFalse(profile["tools"]["mcp"]["enabled"])
        self.assertIn("Google Gemini over the internet", profile["agent"]["system_prompt"])
        self.assertNotIn(KEY, app.profile_text())

    def test_model_validation_prevents_other_providers_and_injection(self):
        self.assertEqual(app.normalize_model("models/gemini-flash-latest"), app.DEFAULT_MODEL)
        for value in ["gpt-5", "gemini-x\n[agent]", 'gemini-x"', "https://example.com/gemini-x", "gemini-flash-tts", "gemini-x-image", "gemini-embedding"]:
            with self.assertRaises(app.SetupError):
                app.normalize_model(value)

    def test_write_profile_is_private_and_does_not_overwrite(self):
        with TemporaryDirectory() as tmp:
            home = Path(tmp) / "private"
            target = app.write_profile(home, app.DEFAULT_MODEL)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            original = target.read_text()
            with self.assertRaises(app.SetupError):
                app.write_profile(home, "gemini-2.5-flash")
            self.assertEqual(target.read_text(), original)

    def test_write_profile_refuses_symlink(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            outside = root / "outside"
            outside.mkdir()
            home = root / "home"
            home.symlink_to(outside, target_is_directory=True)
            with self.assertRaises(app.SetupError):
                app.write_profile(home, app.DEFAULT_MODEL)
            self.assertEqual(list(outside.iterdir()), [])

    @patch("jarvis_google.getpass.getpass")
    @patch.dict(os.environ, {"GEMINI_API_KEY": KEY, "GOOGLE_API_KEY": "other_key_not_used_1234567890"})
    def test_existing_env_key_does_not_prompt_or_print(self, getpass):
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(app.read_key(), KEY)
        self.assertEqual(out.getvalue(), "")
        getpass.assert_not_called()

    @patch.dict(os.environ, {}, clear=True)
    @patch("jarvis_google.sys.stdin.isatty", return_value=False)
    @patch("jarvis_google.getpass.getpass")
    def test_no_key_non_tty_does_not_fall_back_to_echo(self, getpass, isatty):
        with self.assertRaises(app.SetupError):
            app.read_key()
        getpass.assert_not_called()

    def test_error_messages_never_echo_provider_exception_credentials(self):
        self.assertNotIn(KEY, app.error_message(RuntimeError("Authorization=" + KEY)))
        class QuotaError(Exception):
            code = 429
        message = app.error_message(QuotaError(KEY))
        self.assertIn("429", message)
        self.assertNotIn(KEY, message)

    @patch("jarvis_google.make_engine")
    @patch("jarvis_google.read_key")
    @patch("jarvis_google.dependency_status", return_value={"ready": True, "live_api_tested": False})
    def test_check_and_profile_modes_never_initialize_client(self, status, read_key, make_engine):
        out = io.StringIO()
        with TemporaryDirectory() as tmp, redirect_stdout(out):
            self.assertEqual(app.main(["--check"]), 0)
            self.assertEqual(app.main(["--write-profile", "--home", str(Path(tmp) / "profile")]), 0)
        read_key.assert_not_called()
        make_engine.assert_not_called()
        self.assertNotIn(KEY, out.getvalue())

    def test_real_pinned_config_loader_accepts_profile(self):
        from openjarvis.core.config import load_config
        with TemporaryDirectory() as tmp:
            home = Path(tmp) / "profile"
            file = app.write_profile(home, app.DEFAULT_MODEL)
            with patch.dict(os.environ, {"OPENJARVIS_HOME": str(home)}):
                config = load_config(file)
            self.assertEqual(config.intelligence.default_model, app.DEFAULT_MODEL)
            self.assertEqual(config.agent.default_agent, "simple")
            self.assertFalse(config.analytics.enabled)
            self.assertFalse(config.traces.enabled)

    def test_actual_google_sdk_types_and_framework_routing_with_mocked_api(self):
        from google.genai import types
        reply = types.GenerateContentResponse(
            candidates=[types.Candidate(content=types.Content(role="model", parts=[types.Part(text="Namaste Boss!")]))],
            usage_metadata=types.GenerateContentResponseUsageMetadata(
                prompt_token_count=5, candidates_token_count=3, total_token_count=8,
            ),
        )
        with patch("google.genai.Client") as Client:
            Client.return_value.models.generate_content.return_value = reply
            with patch.dict(os.environ, {"OPENAI_API_KEY": "not_used", "ANTHROPIC_API_KEY": "not_used"}):
                engine = app.make_engine(KEY)
            self.assertIsNone(engine._openai_client)
            self.assertIsNone(engine._anthropic_client)
            self.assertFalse(Client.call_args.kwargs["enterprise"])
            options = Client.call_args.kwargs["http_options"]
            self.assertEqual(options.timeout, 30000)
            self.assertEqual(options.retry_options.attempts, 1)
            self.assertFalse(options.client_args["trust_env"])
            session = app.ChatSession(engine, KEY, app.DEFAULT_MODEL)
            self.assertEqual(session.send("Namaste"), "Namaste Boss!")
            generate = Client.return_value.models.generate_content
            generate.assert_called_once()
            kwargs = generate.call_args.kwargs
            self.assertEqual(kwargs["model"], app.DEFAULT_MODEL)
            self.assertEqual(kwargs["config"].max_output_tokens, 512)
            self.assertIsNone(kwargs["config"].tools)
            self.assertNotIn(KEY, str(kwargs["contents"]))
            self.assertIn("Google Gemini", kwargs["config"].system_instruction)

    def test_builtin_cli_uses_secret_free_profile_with_a_mocked_google_response(self):
        from click.testing import CliRunner
        from google.genai import types
        from openjarvis.cli import cli
        reply = types.GenerateContentResponse(
            candidates=[types.Candidate(content=types.Content(role="model", parts=[types.Part(text="Namaste!")]))],
        )
        with TemporaryDirectory() as tmp:
            home = Path(tmp) / "profile"
            app.write_profile(home, app.DEFAULT_MODEL)
            env = {
                "OPENJARVIS_HOME": str(home), "GEMINI_API_KEY": KEY,
                "GOOGLE_GENAI_USE_ENTERPRISE": "false", "GOOGLE_GENAI_USE_VERTEXAI": "false",
                "OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": "", "OPENROUTER_API_KEY": "",
            }
            with patch.dict(os.environ, env), patch("google.genai.Client") as Client:
                Client.return_value.models.generate_content.return_value = reply
                result = CliRunner().invoke(cli, [
                    "--quiet", "ask", "--engine", "cloud", "--model", app.DEFAULT_MODEL,
                    "--agent", "simple", "--max-tokens", "512", "--no-stream", "Sirf Namaste bolo.",
                ])
                self.assertEqual(result.exit_code, 0, repr(result.exception) + result.output)
                self.assertIn("Namaste!", result.output)
                self.assertNotIn(KEY, result.output)
                generate = Client.return_value.models.generate_content
                generate.assert_called_once()
                self.assertIsNone(generate.call_args.kwargs["config"].tools)
                self.assertEqual(generate.call_args.kwargs["config"].max_output_tokens, 512)

    def test_history_is_bounded_redacted_and_key_in_question_is_blocked(self):
        engine = Mock()
        engine.generate.return_value = {"content": "Reply " + KEY + "\x1b", "cost_usd": 0}
        session = app.ChatSession(engine, KEY, app.DEFAULT_MODEL)
        for _ in range(4):
            reply = session.send("Hi")
        self.assertNotIn(KEY, reply)
        self.assertNotIn("\x1b", reply)
        self.assertEqual(len(session.history), 6)
        self.assertNotIn(KEY, str(session.history))
        before = engine.generate.call_count
        with self.assertRaises(app.SetupError):
            session.send(KEY)
        self.assertEqual(engine.generate.call_count, before)

    def test_tool_requests_are_not_executed_or_added_to_history(self):
        engine = Mock()
        engine.generate.return_value = {"content": "Hi", "tool_calls": [{"name": "shell"}]}
        session = app.ChatSession(engine, KEY, app.DEFAULT_MODEL)
        with self.assertRaises(app.SetupError):
            session.send("Hi")
        self.assertEqual(session.history, [])
        engine.execute.assert_not_called()

    def test_empty_answers_do_not_trigger_retries(self):
        engine = Mock()
        engine.generate.return_value = {"content": ""}
        with self.assertRaises(app.SetupError):
            app.ChatSession(engine, KEY, app.DEFAULT_MODEL).send("Hi")
        engine.generate.assert_called_once()

    def test_token_budget_validation(self):
        for value in [0, 63, 2049]:
            with self.assertRaises(app.SetupError):
                app.ChatSession(Mock(), KEY, app.DEFAULT_MODEL, value)


if __name__ == "__main__":
    unittest.main()
