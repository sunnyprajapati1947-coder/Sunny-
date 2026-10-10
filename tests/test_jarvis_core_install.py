"""Only test installer syntax/guards/dry run; never install upstream runtimes."""
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest

from jarvis_start import SOURCES

SCRIPT = Path(__file__).resolve().parents[1] / "automation" / "install_jarvis_core.sh"


class JarvisCoreInstallTests(unittest.TestCase):
    def test_bash_syntax(self):
        result = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_printed_commands_use_catalog_revision_and_no_extras(self):
        source = next(source for source in SOURCES if source.id == "openjarvis")
        with TemporaryDirectory() as tmp:
            env = {**os.environ, "HOME": tmp}
            result = subprocess.run(["bash", str(SCRIPT), "--commands"], env=env, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(f"{source.url}@{source.revision}", result.stdout)
            self.assertIn("--only-binary=numpy,pandas,pyarrow,pydantic-core,jiter,primp", result.stdout)
            self.assertIn("python -m pip check", result.stdout)
            self.assertIn("jarvis --help", result.stdout)
            self.assertNotIn("[desktop]", result.stdout)
            self.assertNotIn("[voice]", result.stdout)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_default_is_also_a_dry_run(self):
        result = subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("No model", result.stdout)

    def test_apply_must_pass_python_guard_before_pip_or_git(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            # A controlled interpreter stub refuses the guard, so test does not
            # depend on the real machine's Python/env and never contacts PyPI.
            python = bin_dir / "python"
            python.write_text("#!/bin/sh\ncat >/dev/null\nprintf 'guard refused\\n' >&2\nexit 1\n")
            python.chmod(0o755)
            env = {**os.environ, "PATH": str(bin_dir) + os.pathsep + os.environ["PATH"], "HOME": str(root)}
            result = subprocess.run(["bash", str(SCRIPT), "--apply"], env=env, capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("guard refused", result.stderr)
            self.assertEqual(sorted(path.name for path in root.iterdir()), ["bin"])

    def test_unknown_mode_is_refused(self):
        result = subprocess.run(["bash", str(SCRIPT), "--install-all"], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
