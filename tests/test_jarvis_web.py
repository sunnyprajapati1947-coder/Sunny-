"""Browser UI tests: loopback only, token required, terminal-only commands refused."""
import http.client
import json
import socket
import threading
from unittest.mock import Mock

import unittest

import jarvis_web


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class WebTests(unittest.TestCase):
    def setUp(self):
        self.port = free_port()
        self.token = "test-token-123"
        self.app = Mock()
        self.app.handle.return_value = "Namaste Sunny ji!"
        handler = jarvis_web.make_handler(self.app, self.token, self.port)
        self.server = jarvis_web.HTTPServer(("127.0.0.1", self.port), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def request(self, method, path, body=None, headers=None, host=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        head = {"Host": host or f"127.0.0.1:{self.port}"}
        head.update(headers or {})
        conn.request(method, path, body=body, headers=head)
        response = conn.getresponse()
        data = response.read()
        headers_out = dict(response.getheaders())
        conn.close()
        return response.status, data, headers_out

    def post(self, payload, token=None, content_type="application/json", host=None):
        headers = {"Content-Type": content_type}
        if token is not None:
            headers["X-Jarvis-Token"] = token
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        return self.request("POST", "/api/command", body, headers, host)

    def test_page_is_served_without_token_and_has_security_headers(self):
        status, data, headers = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"Jarvis", data)
        self.assertNotIn(self.token.encode(), data)
        self.assertIn("default-src 'self'", headers["Content-Security-Policy"])
        self.assertEqual(headers["X-Frame-Options"], "DENY")

    def test_non_loopback_host_header_is_refused(self):
        status, _, _ = self.request("GET", "/", host="evil.example:%d" % self.port)
        self.assertEqual(status, 403)
        status, _, _ = self.post({"line": "hi"}, token=self.token, host="192.168.1.5:%d" % self.port)
        self.assertEqual(status, 403)
        self.app.handle.assert_not_called()

    def test_command_requires_correct_token(self):
        self.assertEqual(self.post({"line": "hi"})[0], 401)
        self.assertEqual(self.post({"line": "hi"}, token="wrong")[0], 401)
        self.app.handle.assert_not_called()

    def test_valid_command_returns_reply_and_structured_results(self):
        status, data, _ = self.post({"line": "Namaste"}, token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data), {"reply": "Namaste Sunny ji!"})
        self.app.handle.return_value = {"success": True, "tasks": []}
        status, data, _ = self.post({"line": "/tasks"}, token=self.token)
        self.assertEqual(json.loads(data), {"result": {"success": True, "tasks": []}})

    def test_terminal_only_commands_are_refused(self):
        for line in ["/exit", "/resume", "/resume now"]:
            status, _, _ = self.post({"line": line}, token=self.token)
            self.assertEqual(status, 403, line)
        self.app.handle.assert_not_called()

    def test_bad_input_is_rejected_before_reaching_app(self):
        self.assertEqual(self.post({"line": "hi"}, token=self.token, content_type="text/plain")[0], 415)
        self.assertEqual(self.post(b"not json", token=self.token)[0], 400)
        self.assertEqual(self.post({"line": "   "}, token=self.token)[0], 400)
        self.assertEqual(self.post({"line": "x" * 2001}, token=self.token)[0], 400)
        self.assertEqual(self.post({"line": "x" * 5000}, token=self.token)[0], 413)
        self.app.handle.assert_not_called()

    def test_app_errors_are_returned_without_crashing_the_server(self):
        self.app.handle.side_effect = ValueError("Use /call NAME")
        status, data, _ = self.post({"line": "/call"}, token=self.token)
        self.assertEqual(status, 400)
        self.assertIn("Use /call NAME", json.loads(data)["error"])
        self.app.handle.side_effect = None
        self.assertEqual(self.post({"line": "hi"}, token=self.token)[0], 200)

    def test_server_refuses_non_loopback_bind_and_bad_ports(self):
        with self.assertRaises(ValueError):
            jarvis_web.serve(self.app, port=8787, host="0.0.0.0")
        with self.assertRaises(ValueError):
            jarvis_web.serve(self.app, port=80)

    def test_busy_port_gives_clear_error(self):
        with self.assertRaises(ValueError) as caught:
            jarvis_web.serve(self.app, port=self.port)
        self.assertIn("busy", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
