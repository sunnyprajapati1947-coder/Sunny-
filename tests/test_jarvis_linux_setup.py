"""Test syntax and read-only script modes, not real Android/proot execution."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "automation" / "prepare_jarvis_linux.sh"


class JarvisLinuxSetupTests(unittest.TestCase):
    def test_bash_syntax(self):
        result = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_embedded_linux_commands_have_valid_bash_syntax(self):
        text = SCRIPT.read_text(encoding="utf-8")
        body = text.split("<<'LINUX'\n", 1)[1].rsplit("\nLINUX", 1)[0]
        result = subprocess.run(["bash", "-n"], input=body, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_default_and_commands_modes_are_read_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {**os.environ, "HOME": tmp, "PREFIX": "", "PD_CONTAINER": ""}
            for args in ([], ["--commands"]):
                result = subprocess.run(["bash", str(SCRIPT), *args], env=env, capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("ubuntu:24.04", result.stdout)
                self.assertIn("/opt/jarvis-venv", result.stdout)
                self.assertNotIn("pip install", result.stdout)
                self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_apply_outside_native_termux_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {**os.environ, "HOME": tmp, "PREFIX": "", "PD_CONTAINER": ""}
            result = subprocess.run(["bash", str(SCRIPT), "--apply"], env=env, capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("normal Termux shell", result.stderr)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_nested_proot_apply_is_refused_even_with_termux_prefix(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {
                **os.environ, "HOME": tmp,
                "PREFIX": "/data/data/com.termux/files/usr", "PD_CONTAINER": "other-container",
            }
            result = subprocess.run(["bash", str(SCRIPT), "--apply"], env=env, capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_unknown_mode_is_refused(self):
        result = subprocess.run(["bash", str(SCRIPT), "--install-all"], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
