"""Tests for the approval-gated coding agent: exact patches and test runs."""
from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path

from jarvis import tools
from jarvis.skills import files


class _Workspace(unittest.TestCase):
    """Every test gets a throw-away folder inside $HOME (safe_path's base)."""

    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="jarvis-code-", dir=Path.home()))
        self.addCleanup(shutil.rmtree, self.root, True)

    def _file(self, name: str, text: str) -> Path:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path


class EditFileTests(_Workspace):
    def test_replaces_one_snippet_and_keeps_a_backup(self) -> None:
        path = self._file("app.py", "print('hello')\nprint('keep')\n")
        result = files.edit_file(str(path), "hello", "goodbye")

        self.assertIn("Patched app.py", result["text"])
        self.assertEqual(path.read_text(encoding="utf-8"), "print('goodbye')\nprint('keep')\n")
        self.assertEqual(result["data"]["matches"], 1)
        backup = Path(result["data"]["backup"])
        self.assertTrue(backup.is_file())
        self.assertIn("print('hello')", backup.read_text(encoding="utf-8"))

    def test_missing_snippet_changes_nothing(self) -> None:
        path = self._file("app.py", "alpha\n")
        result = files.edit_file(str(path), "not-there", "x")

        self.assertIn("not in app.py", result["text"])
        self.assertEqual(path.read_text(encoding="utf-8"), "alpha\n")
        self.assertEqual(result["data"]["matches"], 0)

    def test_ambiguous_snippet_is_refused(self) -> None:
        path = self._file("app.py", "x = 1\nx = 1\n")
        result = files.edit_file(str(path), "x = 1", "x = 2")

        self.assertIn("appears 2 times", result["text"])
        self.assertEqual(path.read_text(encoding="utf-8"), "x = 1\nx = 1\n")

    def test_occurrence_selects_a_specific_match(self) -> None:
        path = self._file("app.py", "x = 1\nx = 1\n")
        result = files.edit_file(str(path), "x = 1", "x = 2", occurrence=2)

        self.assertEqual(path.read_text(encoding="utf-8"), "x = 1\nx = 2\n")
        self.assertEqual(result["data"]["matches"], 2)

    def test_preflight_blocks_missing_text_but_allows_a_clean_patch(self) -> None:
        path = self._file("app.py", "alpha\n")
        blocked = files.edit_preflight(str(path), "nope")
        self.assertIn("not in app.py", blocked["text"])
        self.assertIsNone(files.edit_preflight(str(path), "alpha"))
        self.assertIn("cannot edit", files.edit_preflight("~/definitely-missing-file.txt", "a")["text"])

    def test_binary_and_empty_searches_are_refused(self) -> None:
        image = self.root / "pixel.png"
        image.write_bytes(b"\x89PNG\r\n")
        self.assertIn("binary", files.edit_file(str(image), "x", "y")["text"])
        text = self._file("app.py", "alpha\n")
        self.assertIn("exact text", files.edit_file(str(text), "", "y")["text"])


class RunTestsTests(_Workspace):
    def _project(self, *, passing: bool = True) -> Path:
        project = self.root / "proj"
        (project / "tests").mkdir(parents=True)
        body = (
            "import unittest\n\n"
            "class MathTest(unittest.TestCase):\n"
            "    def test_ok(self):\n"
            "        self.assertEqual(1 + 1, 2)\n"
        )
        if not passing:
            body = (
                "import unittest\n\n"
                "class MathTest(unittest.TestCase):\n"
                "    def test_bad(self):\n"
                "        self.assertEqual(1 + 1, 3)\n"
            )
        (project / "tests" / "test_math.py").write_text(body, encoding="utf-8")
        return project

    def test_passing_unittest_suite_is_reported_green(self) -> None:
        project = self._project()
        result = files.run_tests(str(project), timeout=60)

        self.assertTrue(result["data"]["ok"], result["data"])
        self.assertEqual(result["data"]["runner"], "unittest")
        self.assertIn("all green", result["text"])
        self.assertEqual(result["data"]["code"], 0)

    def test_failing_suite_is_reported_honestly(self) -> None:
        project = self._project(passing=False)
        result = files.run_tests(str(project), timeout=60)

        self.assertFalse(result["data"]["ok"])
        self.assertNotEqual(result["data"]["code"], 0)
        self.assertIn("something failed", result["text"])

    def test_missing_suite_and_missing_folder_explain_themselves(self) -> None:
        empty = self.root / "empty"
        empty.mkdir()
        self.assertIn("could not find a test suite", files.run_tests(str(empty))["text"])
        self.assertIn("not a folder", files.run_tests(str(self.root / "ghost"))["text"])


class CodingRegistryTests(unittest.TestCase):
    def test_patch_and_test_tools_are_gated(self) -> None:
        for name in ("edit_file", "run_tests"):
            tool = tools.get(name)
            self.assertIsNotNone(tool, name)
            self.assertTrue(tool.high_impact, name)
        self.assertIsNotNone(tools.get("edit_file").preflight)
        self.assertGreaterEqual(len(tools.TOOLS), 98)

    def test_intents_route_to_the_patch_tools(self) -> None:
        from jarvis.intents import match

        intent = match("replace hello with goodbye in file ~/notes.txt")
        self.assertEqual(intent.name, "edit_file")
        self.assertEqual(intent.args["path"], "~/notes.txt")
        self.assertEqual(intent.args["find"], "hello")
        self.assertEqual(intent.args["replace"], "goodbye")
        self.assertEqual(match("in file notes.txt replace foo with bar").args["path"], "notes.txt")
        self.assertEqual(match("run the tests").name, "run_tests")
        self.assertEqual(match("run tests in ~/project").args["path"], "~/project")


if __name__ == "__main__":
    unittest.main()
