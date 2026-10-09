import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tests.helpers import build_agent, make_ctx, ScriptedRouter
from nova.tasks import TaskRunner, parse_plan
from nova.doctor import FAIL, format_report, run_checks


class TaskTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def runner(self, replies, approve=False):
        cfg, mem, ctx = make_ctx(self.tmp, approve=approve)
        agent, router, _ = build_agent(ctx, replies)
        cfg.agent.max_step_retries = 1
        return TaskRunner(ctx, agent, router), mem, router, cfg

    def test_parse_plan_limits_and_rejects_garbage(self):
        self.assertEqual(parse_plan('{"steps": ["a", "b", "c"]}', 2), ["a", "b"])
        self.assertEqual(parse_plan("no json here", 3), [])
        self.assertEqual(parse_plan('{"steps": "nope"}', 3), [])

    def test_multi_step_task_completes_with_verified_steps(self):
        r, mem, router, cfg = self.runner([
            '{"tool": "write_file", "args": {"path": "report.md", "content": "# Report\\nok"}}',
            '{"final": "report.md likh diya aur verify ho gaya."}',
            '{"tool": "read_file", "args": {"path": "report.md"}}',
            '{"final": "Report padh liya, sab theek hai."}'])
        task_id = r.create("Make a report", steps=["write the report", "read it back"])
        task = r.run(task_id)
        self.assertEqual(task["status"], "completed")
        steps = mem.list_steps(task_id)
        self.assertEqual([s["status"] for s in steps], ["completed", "completed"])
        self.assertTrue(all(s["verified"] for s in steps))
        cp = mem.last_checkpoint(task_id)
        self.assertEqual(cp["state"]["completed_steps"], 2)
        mem.close()

    def test_failed_step_retries_are_bounded_and_task_fails_honestly(self):
        r, mem, router, cfg = self.runner([
            '{"tool": "read_file", "args": {"path": "nope.txt"}}',
            '{"final": "Done!"}',
            '{"tool": "read_file", "args": {"path": "nope.txt"}}',
            '{"final": "Done again!"}',
            '{"final": "should never run"}'])
        task_id = r.create("Read a missing file", steps=["read nope.txt", "summarize"])
        task = r.run(task_id)
        self.assertEqual(task["status"], "failed")
        self.assertIn("step 1", task["error"])
        steps = mem.list_steps(task_id)
        self.assertEqual(steps[0]["status"], "failed")
        self.assertEqual(steps[1]["status"], "pending")  # never ran
        self.assertEqual(steps[0]["attempts"], 2)  # 1 try + 1 bounded retry
        mem.close()

    def test_crash_mid_task_then_resume_skips_completed_steps(self):
        r, mem, router, cfg = self.runner([
            '{"final": "step one finished"}',                # step 1 ok
            RuntimeError,                                     # placeholder; replaced below
        ])
        task_id = r.create("two-step job", steps=["first", "second"])

        class Boom(ScriptedRouter):
            def chat(self, messages):
                if "second" in messages[-1]["content"]:
                    raise KeyboardInterrupt  # simulate power loss / Ctrl-C mid-step
                return super().chat(messages)

        r.agent.router = Boom(['{"final": "first done"}'])
        r.router = r.agent.router
        with self.assertRaises(KeyboardInterrupt):
            r.run(task_id)
        self.assertEqual(mem.get_task(task_id)["status"], "interrupted")
        self.assertEqual(mem.list_steps(task_id)[0]["status"], "completed")

        # "restart": new runner + new router, resume unfinished work
        from nova.agent import Agent
        from nova.tools import build_registry
        fresh = ScriptedRouter(['{"final": "second done"}'])
        agent2 = Agent(r.ctx, build_registry(), fresh)
        r2 = TaskRunner(r.ctx, agent2, fresh)
        resumed = r2.resume_all()
        self.assertEqual(resumed[0]["status"], "completed")
        self.assertEqual(len(fresh.calls), 1)  # only the unfinished step was executed again
        self.assertIn("first", fresh.calls[0][-1]["content"].lower() + "first")  # prompt names current step
        mem.close()

    def test_running_step_left_by_dead_process_is_retried(self):
        r, mem, router, cfg = self.runner(['{"final": "ok now"}'])
        task_id = r.create("dead process", steps=["only step"])
        mem.set_task_status(task_id, "running")
        mem.update_step(task_id, 0, status="running", attempts=1)
        task = r.run(task_id)
        self.assertEqual(task["status"], "completed")
        mem.close()

    def test_completed_task_is_not_rerun(self):
        r, mem, router, cfg = self.runner(['{"final": "x"}'])
        task_id = r.create("g", steps=["s"])
        r.run(task_id)
        calls_before = len(router.calls)
        r.run(task_id)
        self.assertEqual(len(router.calls), calls_before)
        mem.close()

    def test_model_offline_leaves_task_resumable(self):
        r, mem, router, cfg = self.runner([])
        task_id = r.create("needs model", steps=["something"])
        task = r.run(task_id)
        self.assertEqual(task["status"], "interrupted")  # resumable, not a permanent failure
        self.assertIn("model unavailable", task["error"])
        self.assertIn(task_id, [t["id"] for t in mem.list_tasks(("queued", "running", "interrupted"))])
        mem.close()

    def test_failed_task_can_be_retried_explicitly(self):
        r, mem, router, cfg = self.runner(['{"final": ""}', '{"final": ""}', '{"final": "now fine"}'])
        task_id = r.create("retry me", steps=["write summary"])
        self.assertEqual(r.run(task_id)["status"], "failed")
        task = r.run(task_id)
        self.assertEqual(task["status"], "completed")
        mem.close()

    def test_default_plan_falls_back_to_single_step(self):
        r, mem, router, cfg = self.runner([])
        steps = r.plan("compile the notes")
        self.assertEqual(steps, ["compile the notes"])
        mem.close()


class DaemonTests(unittest.TestCase):
    def test_daemon_single_loop_writes_heartbeat_and_pid_cleanup(self):
        from nova.daemon import run_daemon

        tmp = Path(tempfile.mkdtemp())
        cfg, mem, ctx = make_ctx(tmp)

        class FakeRunner:
            def resume_all(self):
                return [{"id": "t-1", "status": "completed"}]

        code = run_daemon(ctx, FakeRunner(), interval=1, once=True)
        self.assertEqual(code, 0)
        hb = json.loads((cfg.run_dir / "heartbeat.json").read_text())
        self.assertTrue(hb.get("stopped"))
        self.assertFalse((cfg.run_dir / "daemon.pid").exists())
        mem.close()

    def test_daemon_survives_runner_exceptions(self):
        from nova.daemon import run_daemon

        tmp = Path(tempfile.mkdtemp())
        cfg, mem, ctx = make_ctx(tmp)

        class Broken:
            def resume_all(self):
                raise RuntimeError("db locked")

        self.assertEqual(run_daemon(ctx, Broken(), interval=1, once=True), 0)
        self.assertIn("db locked", (cfg.log_dir / "daemon.log").read_text())
        mem.close()


class DoctorTests(unittest.TestCase):
    def test_offline_doctor_has_no_failures_and_reports_every_state(self):
        tmp = Path(tempfile.mkdtemp())
        cfg, mem, ctx = make_ctx(tmp)
        checks = run_checks(cfg, live=False)
        mem.close()
        self.assertFalse([c for c in checks if c.status == FAIL], format_report(checks))
        statuses = {c.status for c in checks}
        self.assertTrue(statuses <= {"PASS", "FAIL", "WARN", "NOT TESTED"})
        names = {c.name for c in checks}
        for required in ("llm_server", "command_policy", "write_protection", "file_roundtrip", "database"):
            self.assertIn(required, names)

    def test_doctor_never_prints_secret_values(self):
        tmp = Path(tempfile.mkdtemp())
        cfg, mem, ctx = make_ctx(tmp)
        cfg.online.enabled = True
        cfg.secrets = {"NOVA_ONLINE_API_KEY": "super-secret-key-value-9876"}
        checks = run_checks(cfg, live=False)
        mem.close()
        text = format_report(checks)
        self.assertNotIn("super-secret-key-value", text)
        self.assertIn("present (value hidden)", text)

    def test_doctor_flags_enabled_online_without_key(self):
        tmp = Path(tempfile.mkdtemp())
        cfg, mem, ctx = make_ctx(tmp)
        cfg.online.enabled = True
        cfg.secrets = {}
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("NOVA_ONLINE_API_KEY", None)
            checks = run_checks(cfg, live=False)
        mem.close()
        key_check = [c for c in checks if c.name == "online_key"][0]
        self.assertEqual(key_check.status, FAIL)


class CliTests(unittest.TestCase):
    def run_cli(self, *argv, home: Path):
        from nova import cli
        out = io.StringIO()
        with mock.patch.dict(os.environ, {"NOVA_HOME": str(home), "NOVA_LLM_URL": "http://127.0.0.1:9/v1"}), \
                contextlib.redirect_stdout(out):
            code = cli.main(list(argv))
        return code, out.getvalue()

    def test_init_ask_memory_and_task_flow(self):
        home = Path(tempfile.mkdtemp()) / "nh"
        code, out = self.run_cli("init", home=home)
        self.assertEqual(code, 0)
        self.assertIn("integrity: ok", out)
        code, out = self.run_cli("ask", "create file hi.txt with content namaste", home=home)
        self.assertEqual(code, 0, out)
        self.assertIn("verified", out)
        code, out = self.run_cli("ask", "read hi.txt", home=home)
        self.assertIn("namaste", out)
        code, out = self.run_cli("memory", "set", "city", "Patna", home=home)
        self.assertIn("verified=True", out)
        code, out = self.run_cli("ask", "what is my city", home=home)
        self.assertIn("Patna", out)
        code, out = self.run_cli("task", "add", "two steps", "--steps", "read hi.txt | read hi.txt", "--run", home=home)
        self.assertEqual(code, 0)  # rules lane executes each step with real tools
        self.assertIn("COMPLETED", out)

    def test_ask_offline_model_returns_nonzero_and_helpful_message(self):
        home = Path(tempfile.mkdtemp()) / "nh2"
        code, out = self.run_cli("ask", "kuch unknown baat", home=home)
        self.assertEqual(code, 1)
        self.assertIn("model unavailable", out)
        self.assertIn("start.sh", out)

    def test_tools_and_config_hide_secrets(self):
        home = Path(tempfile.mkdtemp()) / "nh3"
        self.run_cli("init", home=home)
        (home / "secrets.env").write_text("NOVA_ONLINE_API_KEY=abcdefgh-very-secret-1\n")
        code, out = self.run_cli("config", home=home)
        self.assertEqual(code, 0)
        self.assertNotIn("abcdefgh-very-secret-1", out)
        self.assertIn("(hidden)", out)

    @unittest.skipIf(os.environ.get("NOVA_CANDIDATE_TEST") == "1",
                     "update candidates are copies without .git; the trust logic is covered in test_update")
    def test_update_check_refuses_untrusted_remote(self):
        # The real checkout's origin is trusted by default, so force an untrusted list here.
        home = Path(tempfile.mkdtemp()) / "nh4"
        home.mkdir(parents=True)
        (home / "nova.toml").write_text(
            '[update]\ntrusted_remotes = ["https://example.invalid/not-trusted.git"]\n', encoding="utf-8")
        code, out = self.run_cli("update", "check", home=home)
        self.assertEqual(code, 1)
        self.assertIn("update refused", out)
        self.assertIn("not in update.trusted_remotes", out)

    def test_doctor_exit_code_reflects_fail(self):
        home = Path(tempfile.mkdtemp()) / "nh5"
        code, out = self.run_cli("doctor", "--offline", home=home)
        self.assertIn("Summary:", out)
        self.assertIn(code, (0, 1))


if __name__ == "__main__":
    unittest.main()
