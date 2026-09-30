import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import automation_tools


class AutomationToolsTests(unittest.TestCase):
    def test_empty_topic_rejected(self):
        with self.assertRaises(ValueError):
            automation_tools.create_project("")

    def test_project_fallback_without_qwen(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(automation_tools, "ROOT", root / "youtube"), patch.object(automation_tools, "PROJECTS", root / "youtube" / "projects"), patch.object(automation_tools, "_qwen", return_value=None):
                result = automation_tools.create_project("Test topic")
                self.assertTrue(result["success"])
                self.assertFalse(result["metadata"]["qwen_used"])
                self.assertTrue((Path(result["project"]) / "metadata.json").is_file())

    def test_history_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(automation_tools, "HISTORY", Path(tmp) / "history.jsonl"):
                self.assertEqual(automation_tools.history()["items"], [])


if __name__ == "__main__":
    unittest.main()
