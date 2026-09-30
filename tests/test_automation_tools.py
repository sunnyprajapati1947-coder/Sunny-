import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

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

    def test_audio_skips_without_tts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            root.mkdir()
            (root / "metadata.json").write_text("{\"script\": \"hello\"}", encoding="utf-8")
            with patch.object(automation_tools, "_tts_command", return_value=None):
                result = automation_tools.render_audio(str(root))
                self.assertFalse(result["success"])
                self.assertTrue(result["skipped"])

    def test_render_project_muxes_existing_voiceover(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            root.mkdir()
            (root / "metadata.json").write_text(json.dumps({
                "title": "Test", "script": "hello", "aspect": "16:9",
                "duration_seconds": 5
            }), encoding="utf-8")
            (root / "voiceover.wav").write_bytes(b"wav")
            fake = MagicMock()
            with patch.object(automation_tools.shutil, "which", return_value="/usr/bin/ffmpeg"), patch.object(automation_tools.subprocess, "run", fake):
                result = automation_tools.render_project(str(root))
                args = fake.call_args.args[0]
                self.assertIn("-i", args)
                self.assertIn(str(root / "voiceover.wav"), args)
                self.assertIn("-shortest", args)
                self.assertTrue(result["metadata"]["audio_muxed"])

    def test_pipeline_uses_existing_stages(self):
        with patch.object(automation_tools, "create_project", return_value={"project": "/tmp/nova-project"}), patch.object(automation_tools, "render_audio", return_value={"success": True}), patch.object(automation_tools, "render_project", return_value={"video": "/tmp/video.mp4", "metadata": {}}), patch.object(automation_tools, "render_thumbnail", return_value={"success": True}):
            result = automation_tools.run_pipeline("Test topic")
            self.assertTrue(result["success"])
            self.assertEqual(result["video"], "/tmp/video.mp4")

    def test_history_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(automation_tools, "HISTORY", Path(tmp) / "history.jsonl"):
                self.assertEqual(automation_tools.history()["items"], [])


if __name__ == "__main__":
    unittest.main()
