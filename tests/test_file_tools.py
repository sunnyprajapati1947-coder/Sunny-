"""v7 file tools — search, storage, safe open, pdf (hermetic tmp dirs)."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import file_tools as ft


def _make_pdf(path: Path, text: str) -> None:
    """Hand-rolled minimal text PDF (koi dependency nahi)."""
    content = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_pos = len(out)
    out += b"xref\n0 " + str(len(objs) + 1).encode() + b"\n"
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (b"trailer\n<< /Size " + str(len(objs) + 1).encode() + b" /Root 1 0 R >>\n"
            b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF")
    path.write_bytes(bytes(out))


class FileToolsTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="nova_files_"))
        (self.tmp / "docs").mkdir()
        (self.tmp / "notes.txt").write_text("hello nova", encoding="utf-8")
        (self.tmp / "science notes.pdf").write_bytes(b"%PDF-1.4 fake")
        (self.tmp / "docs" / "song.mp3").write_bytes(b"\x00" * 2048)
        (self.tmp / ".hidden").mkdir()
        (self.tmp / ".hidden" / "secret.txt").write_text("x", encoding="utf-8")
        envs = {"NOVA_FILE_ROOTS": str(self.tmp)}
        patcher = patch.dict("os.environ", envs)
        patcher.start()
        self.addCleanup(patcher.stop)


class FileSearchTest(FileToolsTestBase):
    def test_find_by_name(self):
        result = ft.file_search("notes")
        self.assertTrue(result["success"])
        self.assertEqual(result["count"], 2)  # notes.txt + science notes.pdf
        names = [f["name"] for f in result["files"]]
        self.assertIn("notes.txt", names)

    def test_find_pdf(self):
        result = ft.file_search("science")
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["files"][0]["name"], "science notes.pdf")

    def test_hidden_dirs_skipped(self):
        result = ft.file_search("secret")
        self.assertEqual(result["count"], 0)

    def test_short_pattern_rejected(self):
        self.assertFalse(ft.file_search("a")["success"])

    def test_no_roots_clean_error(self):
        with patch.dict("os.environ", {"NOVA_FILE_ROOTS": "/tmp/definitely_nahi_hai"}):
            result = ft.file_search("kuch")
        self.assertFalse(result["success"])
        self.assertIn("termux-setup-storage", result["error"])


class StorageStatusTest(FileToolsTestBase):
    def test_status_summary(self):
        result = ft.storage_status()
        self.assertTrue(result["success"])
        self.assertIn("khali", result["summary"])
        self.assertTrue(result["disks"])


class FileOpenTest(FileToolsTestBase):
    def test_outside_roots_blocked(self):
        result = ft.file_open("/etc/passwd")
        self.assertFalse(result["success"])
        self.assertIn("bahar", result["error"])

    def test_traversal_blocked(self):
        # allowed root ke andar se bahar nikalne ki koshish
        sneaky = str(self.tmp / ".." / "escape.txt")
        result = ft.file_open(sneaky)
        self.assertFalse(result["success"])

    def test_missing_file(self):
        result = ft.file_open(self.tmp / "nahi_hai.txt")
        self.assertFalse(result["success"])

    def test_relative_name_searches_first(self):
        # termux-open sandbox me nahi hai — par search-miss path test karo
        result = ft.file_open("bilkul_nahi_hai_aisa")
        self.assertFalse(result["success"])


class PdfReadTest(FileToolsTestBase):
    def test_reads_text_pdf(self):
        try:
            from pypdf import PdfReader  # noqa: F401
        except ImportError:
            self.skipTest("pypdf not installed")
        _make_pdf(self.tmp / "real.pdf", "Hello Nova PDF test")
        result = ft.pdf_read("real")
        self.assertTrue(result["success"], result)
        self.assertEqual(result["pages"], 1)
        self.assertIn("Hello Nova PDF test", result["text"])

    def test_missing_pdf(self):
        result = ft.pdf_read("nahi_hai_aisa_pdf")
        self.assertFalse(result["success"])

    def test_outside_blocked(self):
        result = ft.pdf_read("/etc/secret.pdf")
        self.assertFalse(result["success"])

    def test_graceful_without_pypdf(self):
        import builtins
        real_import = builtins.__import__

        def fake_import(name, *args, **kwargs):
            if name == "pypdf":
                raise ImportError("no pypdf")
            return real_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=fake_import):
            result = ft.pdf_read("science notes")
        self.assertFalse(result["success"])
        self.assertIn("pip install pypdf", result["error"])


if __name__ == "__main__":
    unittest.main()
