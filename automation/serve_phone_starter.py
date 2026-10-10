#!/usr/bin/env python3
"""Serve ONLY the non-secret starter archive, never the repo or a directory listing.

Temporary delivery helper for Arena live preview. Binds 0.0.0.0; accepts preview
hosts; no phone/model control, credential handling, writes or upload endpoint.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile

ARCHIVE_NAME = "jarvis-phone-starter.zip"
ROOT = Path(__file__).resolve().parents[1]


def read_archive(path: Path) -> bytes:
    if path.name != ARCHIVE_NAME or not path.is_file() or path.is_symlink():
        raise ValueError("Expected the existing starter ZIP, not a directory or arbitrary file.")
    if path.stat().st_size > 1_000_000:
        raise ValueError("Starter unexpectedly large; do not serve models or datasets.")
    with ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ValueError("Invalid starter ZIP.")
        for name in archive.namelist():
            parts = Path(name).parts
            if not name.startswith("jarvis-phone-starter/") or ".." in parts:
                raise ValueError("Unsafe starter path.")
            if Path(name).name.startswith(".env") or name.endswith((".gguf", ".sqlite3", ".jsonl")):
                raise ValueError("Runtime data/credentials/models must not be in the starter.")
    return path.read_bytes()


def handler_factory(data: bytes):
    digest = sha256(data).hexdigest()
    page = f'''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Jarvis starter download</title>
<style>body{{font:17px/1.6 system-ui;background:#f4f7fb;color:#15223b;margin:0;padding:36px 20px}}main{{max-width:720px;margin:auto;background:white;padding:30px;border-radius:18px}}a{{display:inline-block;background:#175bea;color:white;padding:12px 20px;border-radius:10px;text-decoration:none}}code{{overflow-wrap:anywhere;font-size:13px}}small{{color:#546276}}</style>
<main><h1>Jarvis phone starter</h1><p>Source kit only. No model weights, API key, chat or installed upstream runtimes.</p>
<a href="/{ARCHIVE_NAME}" download="{ARCHIVE_NAME}">Download starter ZIP</a>
<p>Termux can download this file directly, avoiding Android Downloads/profile differences.</p>
<p><small>{len(data):,} bytes &middot; SHA-256</small><br><code>{digest}</code></p>
<p>Temporary session download link. Keep your phone's local model server running.</p></main></html>'''.encode()

    class DownloadHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.respond(False)

        def do_HEAD(self):
            self.respond(True)

        def respond(self, head: bool):
            route = urlsplit(self.path).path
            if route == "/":
                payload, content_type = page, "text/html; charset=utf-8"
            elif route == "/" + ARCHIVE_NAME:
                payload, content_type = data, "application/zip"
            elif route == "/healthz":
                payload = f'{{"status":"ready","bytes":{len(data)},"sha256":"{digest}"}}'.encode()
                content_type = "application/json"
            else:
                self.send_error(404, "Only the starter archive is available.")
                return
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if route == "/" + ARCHIVE_NAME:
                self.send_header("Content-Disposition", f'attachment; filename="{ARCHIVE_NAME}"')
                self.send_header("X-Archive-SHA256", digest)
            self.end_headers()
            if not head:
                self.wfile.write(payload)

    return DownloadHandler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    data = read_archive(ROOT / ARCHIVE_NAME)
    server = ThreadingHTTPServer(("0.0.0.0", args.port), handler_factory(data))
    print(f"Serving ONLY {ARCHIVE_NAME}: {len(data)} bytes; sha256={sha256(data).hexdigest()}", flush=True)
    print(f"Listening on 0.0.0.0:{args.port}; GET / or /{ARCHIVE_NAME}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
