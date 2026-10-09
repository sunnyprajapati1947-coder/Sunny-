import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from tests.helpers import make_ctx, ROOT
from nova.tools import build_registry
from nova.tools.web import check_url, html_to_text


class ToolTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.cfg, self.mem, self.ctx = make_ctx(self.tmp)
        self.reg = build_registry()

    def tearDown(self):
        self.mem.close()

    def call(self, name, **args):
        return self.reg.call(name, args, self.ctx)

    # files -------------------------------------------------------------
    def test_write_read_edit_roundtrip_is_verified(self):
        w = self.call("write_file", path="notes/todo.txt", content="buy milk\n")
        self.assertTrue(w.ok, w.error)
        self.assertIn("verified", w.output)
        r = self.call("read_file", path="notes/todo.txt")
        self.assertTrue(r.ok)
        self.assertIn("buy milk", r.output)
        e = self.call("edit_file", path="notes/todo.txt", old="milk", new="bread")
        self.assertTrue(e.ok, e.error)
        self.assertEqual((self.cfg.workspace / "notes" / "todo.txt").read_text(), "buy bread\n")
        self.assertIn(".nova-backups", e.output)  # previous version kept

    def test_edit_refuses_ambiguous_or_missing_text(self):
        self.call("write_file", path="a.txt", content="x x x")
        self.assertFalse(self.call("edit_file", path="a.txt", old="x", new="y").ok)
        self.assertFalse(self.call("edit_file", path="a.txt", old="zzz", new="y").ok)
        self.assertEqual((self.cfg.workspace / "a.txt").read_text(), "x x x")
        self.assertTrue(self.call("edit_file", path="a.txt", old="x", new="y", replace_all=True).ok)

    def test_write_outside_workspace_and_into_core_is_blocked(self):
        self.assertFalse(self.call("write_file", path="../escape.txt", content="x").ok)
        self.assertFalse(self.call("write_file", path=str(ROOT / "nova" / "hacked.py"), content="x").ok)
        self.assertFalse((ROOT / "nova" / "hacked.py").exists())
        self.assertFalse(self.call("write_file", path="secrets.env", content="x").ok)

    def test_read_sensitive_or_missing_file_fails_cleanly(self):
        self.assertFalse(self.call("read_file", path="missing.txt").ok)
        self.assertFalse(self.call("read_file", path="/etc/passwd").ok)

    def test_list_files(self):
        self.call("write_file", path="one.txt", content="1")
        r = self.call("list_files")
        self.assertTrue(r.ok)
        self.assertIn("one.txt", r.output)

    # registry validation -------------------------------------------------
    def test_unknown_tool_and_bad_arguments(self):
        self.assertFalse(self.reg.call("nope", {}, self.ctx).ok)
        self.assertIn("missing required", self.call("read_file").error)
        self.assertIn("unknown argument", self.reg.call("read_file", {"path": "a", "zzz": 1}, self.ctx).error)
        self.assertIn("must be of type", self.reg.call("write_file", {"path": "a", "content": 5}, self.ctx).error)

    # approvals ------------------------------------------------------------
    def test_confirm_tools_denied_without_approval(self):
        r = self.call("run_python", code="print('hi')")
        self.assertFalse(r.ok)
        self.assertIn("not approved", r.error)

    def test_confirm_tools_run_when_approved(self):
        _, _, approved_ctx = make_ctx(self.tmp / "approved", approve=True)
        r = self.reg.call("run_python", {"code": "print('hello-from-nova')"}, approved_ctx)
        self.assertTrue(r.ok, r.error)
        self.assertIn("hello-from-nova", r.output)
        approved_ctx.memory.close()

    def test_run_python_failure_is_reported_not_hidden(self):
        _, _, approved_ctx = make_ctx(self.tmp / "approved2", approve=True)
        r = self.reg.call("run_python", {"code": "raise SystemExit(3)"}, approved_ctx)
        self.assertFalse(r.ok)
        self.assertIn("exit code 3", r.error)
        approved_ctx.memory.close()

    def test_run_tests_executes_workspace_tests(self):
        _, _, approved_ctx = make_ctx(self.tmp / "approved3", approve=True)
        tdir = approved_ctx.workspace / "proj" / "tests"
        tdir.mkdir(parents=True)
        (tdir / "test_sample.py").write_text("import unittest\nclass T(unittest.TestCase):\n"
                                             "    def test_ok(self):\n        self.assertEqual(1+1, 2)\n")
        r = self.reg.call("run_tests", {"path": "proj/tests"}, approved_ctx)
        self.assertTrue(r.ok, r.error)
        self.assertIn("OK", r.output)
        approved_ctx.memory.close()

    # shell / github --------------------------------------------------------
    def test_safe_shell_command_runs_without_approval(self):
        self.call("write_file", path="hello.txt", content="hi")
        r = self.call("run_command", command="ls")
        self.assertTrue(r.ok, r.error)
        self.assertIn("hello.txt", r.output)

    def test_blocked_shell_command_never_runs(self):
        r = self.call("run_command", command="rm -rf /")
        self.assertFalse(r.ok)
        self.assertIn("blocked", r.error)

    def test_shell_metacharacters_are_not_interpreted(self):
        self.call("write_file", path="f.txt", content="x")
        r = self.call("run_command", command="ls ; echo INJECTED")
        # No shell ran: ';', 'echo' and 'INJECTED' were passed to ls as literal filenames.
        self.assertIn("cannot access 'INJECTED'", r.output)
        self.assertNotIn("\nINJECTED\n", "\n" + r.output + "\n")

    def test_gh_auth_is_blocked_and_gh_list_is_safe(self):
        self.assertIn("blocked", self.reg.call("github_cli", {"args": "auth token"}, self.ctx).error)
        r = self.reg.call("github_cli", {"args": "repo create x"}, self.ctx)
        self.assertFalse(r.ok)  # needs approval, denied here

    # termux ----------------------------------------------------------------
    def test_termux_tools_report_not_available_when_missing(self):
        import shutil
        if shutil.which("termux-battery-status"):
            self.skipTest("Termux:API present")
        r = self.call("phone_battery")
        self.assertFalse(r.ok)
        self.assertIn("NOT AVAILABLE", r.error)

    # memory tools ----------------------------------------------------------
    def test_remember_and_recall_are_verified(self):
        self.assertTrue(self.call("remember", key="favourite fruit", value="mango").ok)
        r = self.call("recall", key="favourite fruit")
        self.assertEqual(r.output, "mango")
        self.assertFalse(self.call("recall", key="unknown thing").ok)

    def test_current_time(self):
        r = self.call("current_time")
        self.assertTrue(r.ok)
        self.assertIn("iso", r.data)


class WebSearchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_wikipedia_backend_parses_results_from_api_shape(self):
        from tests.helpers import MockOpenAIServer
        payload = {"query": {"search": [{"title": "Python (programming language)",
                                         "snippet": "<span class=\"searchmatch\">Python</span> is a language"}]}}
        with MockOpenAIServer(lambda p, b: (200, payload)) as srv:
            cfg, mem, ctx = make_ctx(self.tmp)
            cfg.web.wikipedia_api = srv.url + "/w/api.php"
            r = build_registry().call("web_search", {"query": "python", "max_results": 3}, ctx)
            mem.close()
        self.assertTrue(r.ok, r.error)
        self.assertIn("Source: wikipedia", r.output)
        self.assertIn("Python (programming language)", r.output)
        self.assertEqual(r.data["results"][0]["snippet"], "Python is a language")

    def test_searxng_backend_preferred_when_configured(self):
        from tests.helpers import MockOpenAIServer
        payload = {"results": [{"title": "Nova docs", "url": "https://example.org/nova", "content": "Notes"}]}
        with MockOpenAIServer(lambda p, b: (200, payload)) as srv:
            cfg, mem, ctx = make_ctx(self.tmp)
            cfg.web.searxng_url = srv.url
            r = build_registry().call("web_search", {"query": "nova"}, ctx)
            mem.close()
        self.assertTrue(r.ok, r.error)
        self.assertIn("Source: searxng", r.output)
        self.assertIn("https://example.org/nova", r.output)

    def test_offline_search_reports_failure_not_fake_results(self):
        cfg, mem, ctx = make_ctx(self.tmp)
        cfg.web.wikipedia_api = "http://127.0.0.1:9/w/api.php"
        r = build_registry().call("web_search", {"query": "anything"}, ctx)
        mem.close()
        self.assertFalse(r.ok)
        self.assertIn("wikipedia", r.error)


class WebTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.cfg, self.mem, self.ctx = make_ctx(self.tmp)

    def tearDown(self):
        self.mem.close()

    def test_private_and_loopback_urls_refused_by_default(self):
        from nova.security import PolicyError
        for url in ["http://127.0.0.1:8080/", "http://localhost/", "file:///etc/passwd", "ftp://example.com/x",
                    "http://10.0.0.1/", "http://169.254.169.254/latest/meta-data"]:
            with self.assertRaises(PolicyError, msg=url):
                check_url(url, allow_private=False)

    def test_html_to_text_strips_scripts_and_keeps_title(self):
        title, text = html_to_text("<html><head><title>Hi Page</title><script>var x=1;</script></head>"
                                   "<body><h1>Header</h1><p>Body &amp; more</p></body></html>")
        self.assertEqual(title, "Hi Page")
        self.assertIn("Body & more", text)
        self.assertNotIn("var x", text)

    def test_read_webpage_from_local_server(self):
        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                body = b"<html><title>Local</title><body><p>Nova reads pages.</p></body></html>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        try:
            url = f"http://127.0.0.1:{srv.server_address[1]}/page"
            r = self.ctx and build_registry().call("read_webpage", {"url": url}, self.ctx)
            self.assertTrue(r.ok, r.error)
            self.assertIn("Nova reads pages.", r.output)
            self.assertIn("Title: Local", r.output)
            # Same server is refused when private hosts are not allowed
            self.cfg.web.allow_private_hosts = False
            r2 = build_registry().call("read_webpage", {"url": url}, self.ctx)
            self.assertFalse(r2.ok)
            self.assertIn("not a public address", r2.error)
        finally:
            srv.shutdown()
            srv.server_close()


if __name__ == "__main__":
    unittest.main()
