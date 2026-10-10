"""Artifact delivery tests without external network or repository exposure."""
from hashlib import sha256
import io
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from automation.serve_phone_starter import ARCHIVE_NAME, ROOT, handler_factory, read_archive


class FakeSocket:
    def __init__(self, route, method="GET"):
        self.input = io.BytesIO(f"{method} {route} HTTP/1.1\r\nHost: preview.e2b.app\r\nConnection: close\r\n\r\n".encode())
        self.output = bytearray()

    def makefile(self, *args, **kwargs):
        return self.input

    def sendall(self, data):
        self.output.extend(data)


class PhoneStarterDeliveryTests(unittest.TestCase):
    def respond(self, route, method="GET"):
        data = read_archive(ROOT / ARCHIVE_NAME)
        handler = handler_factory(data)
        socket = FakeSocket(route, method)
        with patch.object(handler, "log_message"):
            handler(socket, ("127.0.0.1", 12345), SimpleNamespace())
        return bytes(socket.output), data

    def test_existing_zip_is_safe_and_contains_main_script(self):
        data = read_archive(ROOT / ARCHIVE_NAME)
        self.assertLess(len(data), 1_000_000)
        with ZipFile(io.BytesIO(data)) as archive:
            self.assertIn("jarvis-phone-starter/jarvis_personal.py", archive.namelist())
            self.assertFalse(any(name.endswith((".env", ".gguf", ".sqlite3", ".jsonl")) for name in archive.namelist()))

    def test_download_bytes_headers_and_digest(self):
        response, data = self.respond("/" + ARCHIVE_NAME)
        headers, body = response.split(b"\r\n\r\n", 1)
        self.assertIn(b"200 OK", headers)
        self.assertIn(b"Content-Type: application/zip", headers)
        self.assertIn(sha256(data).hexdigest().encode(), headers)
        self.assertEqual(body, data)

    def test_head_has_headers_without_archive_body(self):
        response, data = self.respond("/" + ARCHIVE_NAME, "HEAD")
        headers, body = response.split(b"\r\n\r\n", 1)
        self.assertIn(str(len(data)).encode(), headers)
        self.assertEqual(body, b"")

    def test_repo_secrets_scripts_and_traversal_are_not_served(self):
        for path in ["/.env", "/README.md", "/../.git/config", "/jarvis_personal.py"]:
            response, _ = self.respond(path)
            self.assertIn(b"404", response.split(b"\r\n", 1)[0])

    def test_unsafe_archive_entry_is_refused(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / ARCHIVE_NAME
            for entry in ["../outside.txt", "jarvis-phone-starter/.env", "jarvis-phone-starter/model.gguf"]:
                with ZipFile(path, "w") as archive:
                    archive.writestr(entry, "test")
                with self.assertRaises(ValueError):
                    read_archive(path)


if __name__ == "__main__":
    unittest.main()
