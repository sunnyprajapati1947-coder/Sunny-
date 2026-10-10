"""Offline plan/profile/Termux-script tests: no model download or real server."""
from contextlib import redirect_stdout
import io
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import tomllib
import unittest
from unittest.mock import patch

import jarvis_offline as app

SCRIPT = Path(__file__).resolve().parents[1] / "automation" / "jarvis_offline.sh"


class JarvisOfflineTests(unittest.TestCase):
    def test_plan_uses_small_cpu_model_no_keys_or_automatic_activation(self):
        plan = app.offline_plan()
        self.assertFalse(plan["api_key_required"])
        self.assertFalse(plan["model_downloaded_by_plan"])
        self.assertFalse(plan["live_phone_inference_verified"])
        self.assertTrue(plan["native_engine_verified_by_user"])
        self.assertTrue(plan["server_readiness_verified_by_user"])
        self.assertEqual(plan["reported_model_server_health"], "ok")
        self.assertFalse(plan["personal_starter_deployed_to_phone"])
        self.assertEqual(plan["reported_phone_engine_version"], "0.6.0")
        self.assertEqual(plan["model_file"], "Qwen3-1.7B-Q8_0.gguf")
        self.assertEqual(plan["quantization"], "Q8_0")
        self.assertTrue(plan["model_filename_verified_from_user_log"])
        self.assertTrue(plan["online_tools_allowed_by_user"])
        self.assertIn("--no-agent", plan["server_args"])
        origins = plan["server_args"][plan["server_args"].index("--cors-origins") + 1]
        self.assertNotIn("*", origins)
        self.assertIn("http://127.0.0.1:8080", origins)
        self.assertEqual(plan["context_tokens"], 2048)
        self.assertEqual(plan["default_output_token_limit"], 256)
        self.assertEqual(plan["gpu_layers"], 0)
        self.assertEqual(plan["parallel_slots"], 1)
        self.assertEqual(plan["server_args"][plan["server_args"].index("--hf-file") + 1], app.MODEL_FILE)
        self.assertEqual(plan["server_args"][plan["server_args"].index("--host") + 1], "127.0.0.1")
        self.assertEqual(plan["cached_offline_server_args"][-1], "--offline")

    def test_profile_is_local_and_disables_tools_and_external_analytics(self):
        profile = tomllib.loads(app.profile_text())
        self.assertEqual(profile["intelligence"]["provider"], "local")
        self.assertEqual(profile["engine"]["default"], "llamacpp")
        self.assertEqual(profile["engine"]["llamacpp"]["host"], app.MODEL_HOST)
        self.assertEqual(profile["agent"]["tools"], "")
        self.assertFalse(profile["tools"]["mcp"]["enabled"])
        for name in ["analytics", "telemetry", "traces", "learning"]:
            self.assertFalse(profile[name]["enabled"])
        self.assertNotIn("GEMINI_API_KEY", app.profile_text())
        self.assertNotIn("api_key =", app.profile_text())

    @patch("subprocess.run")
    def test_default_plan_does_not_execute_commands(self, run):
        with redirect_stdout(io.StringIO()):
            self.assertEqual(app.main([]), 0)
        run.assert_not_called()

    def test_profile_never_overwrites_and_file_is_private(self):
        with TemporaryDirectory() as tmp:
            home = Path(tmp) / "local"
            path = app.write_profile(home)
            original = path.read_text()
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(ValueError):
                app.write_profile(home)
            self.assertEqual(path.read_text(), original)

    def test_profile_symlink_is_refused(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            outside = root / "outside"
            outside.mkdir()
            home = root / "home"
            home.symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                app.write_profile(home)
            self.assertEqual(list(outside.iterdir()), [])

    def test_bash_syntax_and_read_only_command_modes(self):
        syntax = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True, timeout=10)
        self.assertEqual(syntax.returncode, 0, syntax.stderr)
        with TemporaryDirectory() as tmp:
            env = {**os.environ, "HOME": tmp, "PREFIX": "", "PD_CONTAINER": ""}
            for args in [[], ["--commands"]]:
                result = subprocess.run(["bash", str(SCRIPT), *args], env=env, capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(app.MODEL_FILE, result.stdout)
                self.assertIn("--reasoning off", result.stdout)
                self.assertIn("pkg install llama-cpp", result.stdout)
                self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_non_termux_install_or_serve_is_refused_before_network_or_server(self):
        with TemporaryDirectory() as tmp:
            env = {**os.environ, "HOME": tmp, "PREFIX": "", "PD_CONTAINER": ""}
            for mode in ["--install", "--serve", "--offline-serve"]:
                result = subprocess.run(["bash", str(SCRIPT), mode], env=env, capture_output=True, text=True, timeout=10)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("native Termux", result.stderr)
                self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_script_and_plan_use_consistent_server_args(self):
        result = subprocess.run(["bash", str(SCRIPT), "--commands"], capture_output=True, text=True, timeout=10)
        line = next(line for line in result.stdout.splitlines() if line.startswith("llama-server -hf"))
        import shlex
        self.assertEqual(shlex.split(line), list(app.SERVER_ARGS))


if __name__ == "__main__":
    unittest.main()
