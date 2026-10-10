"""Keepalive script: restarts only after crashes, bounded, and exits on clean stop."""
import os
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "automation" / "jarvis_web_keepalive.sh"


def run_keepalive(command: str, **env) -> subprocess.CompletedProcess:
    environment = {**os.environ, "JARVIS_CMD": command, "BACKOFF_START": "0", "BACKOFF_MAX": "0", **env}
    return subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True, timeout=30, env=environment)


class KeepaliveTests(unittest.TestCase):
    def test_crash_is_restarted_until_max_restarts(self):
        result = run_keepalive("exit 3", MAX_RESTARTS="2")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.count("crashed (code 3)"), 2)
        self.assertIn("Stopping: reached MAX_RESTARTS=2", result.stdout)

    def test_clean_exit_is_not_restarted(self):
        result = run_keepalive("exit 0", MAX_RESTARTS="5")
        self.assertEqual(result.returncode, 0)
        self.assertNotIn("crashed", result.stdout)

    def test_default_command_targets_only_the_jarvis_web_page(self):
        text = SCRIPT.read_text()
        self.assertIn("jarvis_personal.py --web --port", text)
        self.assertNotIn("curl", text)
        self.assertNotIn("pip install", text)
        self.assertNotIn("wget", text)

    def test_script_is_valid_bash(self):
        result = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
