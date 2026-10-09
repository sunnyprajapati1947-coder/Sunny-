"""Runs the real install/start/stop/doctor scripts with a temporary HOME and NOVA_HOME."""

import os
import shutil
import stat
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

from tests.helpers import MockOpenAIServer, ROOT, reply_body

HAS_BASH = shutil.which("bash") is not None
IN_CANDIDATE = os.environ.get("NOVA_CANDIDATE_TEST") == "1"  # update candidates skip slow script tests


def script_env(home: Path, nova_home: Path, **extra) -> dict:
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(home), "NOVA_HOME": str(nova_home),
           "NOVA_SKIP_PKG": "1", "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"}
    env.update(extra)
    return env


def run(script: str, env: dict, *args, timeout=120) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", str(ROOT / script), *args], cwd=str(ROOT), env=env, capture_output=True,
                          text=True, timeout=timeout)


@unittest.skipUnless(HAS_BASH and not IN_CANDIDATE, "bash required; skipped inside update candidate")
class ScriptTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.home.mkdir()
        self.nova_home = self.tmp / "novahome"
        self.env = script_env(self.home, self.nova_home)

    def tearDown(self):
        # never leave a daemon behind from a failing test
        pid_file = self.nova_home / "run" / "daemon.pid"
        if pid_file.exists():
            try:
                os.kill(int(pid_file.read_text()), 15)
            except (OSError, ValueError):
                pass

    def test_install_is_idempotent_and_preserves_user_edits(self):
        r1 = run("install-termux.sh", self.env)
        self.assertEqual(r1.returncode, 0, r1.stdout + r1.stderr)
        self.assertTrue((self.nova_home / "nova.toml").is_file())
        self.assertTrue((self.nova_home / "nova.db").is_file())
        secrets = self.nova_home / "secrets.env"
        self.assertEqual(stat.S_IMODE(secrets.stat().st_mode) & 0o077, 0)
        link = self.home / ".local" / "bin" / "nova"
        self.assertTrue(link.is_symlink())
        self.assertEqual(Path(os.readlink(link)).resolve(), (ROOT / "bin" / "nova").resolve())

        # user edits must survive a re-install
        (self.nova_home / "nova.toml").write_text("# my edit\n" + (self.nova_home / "nova.toml").read_text())
        secrets.write_text("NOVA_ONLINE_API_KEY=keep-me-123456789\n")
        r2 = run("install-termux.sh", self.env)
        self.assertEqual(r2.returncode, 0, r2.stdout + r2.stderr)
        self.assertIn("# my edit", (self.nova_home / "nova.toml").read_text())
        self.assertIn("keep-me-123456789", secrets.read_text())
        self.assertIn("Your existing ~/NovaAI folder was not modified", r2.stdout)

    def test_launcher_works_through_symlink(self):
        self.assertEqual(run("install-termux.sh", self.env).returncode, 0)
        link = self.home / ".local" / "bin" / "nova"
        out = subprocess.run([str(link), "ask", "what time is it"], env=self.env, capture_output=True, text=True,
                             timeout=60)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("20", out.stdout)  # the current year is printed by the time tool

    def test_start_uses_existing_llm_server_and_stop_keeps_it(self):
        self.assertEqual(run("install-termux.sh", self.env).returncode, 0)
        with MockOpenAIServer(lambda p, b: (200, reply_body('{"final": "ok"}'))) as llm:
            env = dict(self.env, NOVA_LLM_URL=llm.url + "/v1")
            start = run("start.sh", env)
            self.assertEqual(start.returncode, 0, start.stdout + start.stderr)
            self.assertIn("existing server used", start.stdout)
            self.assertIn("daemon started", start.stdout)
            pid_file = self.nova_home / "run" / "daemon.pid"
            deadline = time.time() + 10
            while not pid_file.exists() and time.time() < deadline:
                time.sleep(0.2)
            self.assertTrue(pid_file.exists())
            pid = int(pid_file.read_text())
            os.kill(pid, 0)  # alive

            again = run("start.sh", env)
            self.assertIn("already running", again.stdout)

            stop = run("stop.sh", env)
            self.assertEqual(stop.returncode, 0, stop.stdout + stop.stderr)
            self.assertIn("daemon stopped", stop.stdout)
            self.assertFalse(pid_file.exists())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)
            # the existing llm server (not started by Nova) is still answering
            self.assertTrue(llm.requests is not None)

    def test_start_without_model_warns_but_still_starts_daemon(self):
        self.assertEqual(run("install-termux.sh", self.env).returncode, 0)
        env = dict(self.env, NOVA_LLM_URL="http://127.0.0.1:9/v1", NOVA_START_LLAMA="1",
                   NOVA_LLAMA_SERVER_BIN="/nonexistent/llama-server")
        start = run("start.sh", env)
        self.assertEqual(start.returncode, 0, start.stdout + start.stderr)
        self.assertIn("llama-server not found", start.stderr)
        self.assertIn("daemon started", start.stdout)
        run("stop.sh", env)

    def test_doctor_and_update_scripts_run(self):
        self.assertEqual(run("install-termux.sh", self.env).returncode, 0)
        doc = run("doctor.sh", self.env, "--offline")
        self.assertIn("Summary:", doc.stdout)
        self.assertNotIn("FAIL       python", doc.stdout)
        upd = run("update.sh", self.env, "--help")
        self.assertEqual(upd.returncode, 0)
        self.assertIn("rollback", upd.stdout)

    def test_stop_when_nothing_running_is_clean(self):
        self.assertEqual(run("install-termux.sh", self.env).returncode, 0)
        stop = run("stop.sh", self.env)
        self.assertEqual(stop.returncode, 0)
        self.assertIn("not running", stop.stdout)


@unittest.skipUnless(os.environ.get("NOVA_LLAMA_SERVER_BIN") and os.environ.get("NOVA_TINY_GGUF"),
                     "set NOVA_LLAMA_SERVER_BIN and NOVA_TINY_GGUF to run the real llama-server test")
class RealLlamaServerTests(unittest.TestCase):
    """Starts the REAL llama-server binary with a tiny test GGUF and drives it through Nova."""

    def test_start_sh_starts_real_llama_server_and_stop_sh_stops_it(self):
        tmp = Path(tempfile.mkdtemp())
        home, nova_home = tmp / "home", tmp / "nh"
        home.mkdir()
        port = 18190 + (os.getpid() % 500)
        env = script_env(home, nova_home, NOVA_START_LLAMA="1", NOVA_LLAMA_SERVER_BIN=os.environ["NOVA_LLAMA_SERVER_BIN"],
                         NOVA_LLM_URL=f"http://127.0.0.1:{port}/v1")
        self.assertEqual(run("install-termux.sh", env).returncode, 0)
        toml = nova_home / "nova.toml"
        toml.write_text(toml.read_text().replace('model_path = "~/NovaAI/models/Qwen3.5-0.8B-Q4_0.gguf"',
                                                 f'model_path = "{os.environ["NOVA_TINY_GGUF"]}"'))
        try:
            start = run("start.sh", env, timeout=240)
            self.assertIn("STARTED by Nova", start.stdout, start.stdout + start.stderr)
            # real chat path through the CLI/agent using the real server
            ask = subprocess.run([os.environ.get("NOVA_PYTHON", "python3"), "-m", "nova", "doctor"], cwd=str(ROOT),
                                 env=dict(env, PYTHONPATH=str(ROOT)), capture_output=True, text=True, timeout=120)
            self.assertIn("llm_chat", ask.stdout)
            self.assertRegex(ask.stdout, r"PASS\s+llm_chat")
            stop = run("stop.sh", env)
            self.assertIn("llama-server (started by Nova) stopped", stop.stdout, stop.stdout + stop.stderr)
        finally:
            run("stop.sh", env)


if __name__ == "__main__":
    unittest.main()
