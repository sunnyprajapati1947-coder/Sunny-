import json
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

    def test_research_evidence_reaches_qwen_prompt(self):
        captured = []
        def fake_qwen(prompt, timeout=45.0):
            captured.append(prompt)
            return None
        research = {
            "success": True,
            "enabled": True,
            "sources": [{"title": "Source", "url": "https://example.com", "snippet": "current fact"}],
            "documents": [{"title": "Source", "url": "https://example.com", "content": "Detailed evidence"}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(automation_tools, "ROOT", Path(tmp) / "youtube"), patch.object(automation_tools, "PROJECTS", Path(tmp) / "youtube" / "projects"), patch.object(automation_tools, "_qwen", side_effect=fake_qwen):
                result = automation_tools.create_project("Evidence topic", research=research)
                self.assertTrue(result["success"])
        self.assertEqual(len(captured), 1)
        self.assertIn("current fact", captured[0])
        self.assertIn("Detailed evidence", captured[0])

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

    def test_research_topic(self):
        fake = {"results": [{"title": "Source", "url": "https://example.com", "snippet": "fact"}],
                "documents": [{"title": "Source", "url": "https://example.com", "content": "fact"}]}
        with patch("github.local_ai_agent.tools.web.research", return_value=fake):
            result = automation_tools.research_topic("test topic")
            self.assertTrue(result["success"])
            self.assertEqual(len(result["sources"]), 1)

    def test_pipeline_uses_existing_stages(self):
        with patch.object(automation_tools, "research_topic", return_value={"success": True, "sources": [], "documents": []}), patch.object(automation_tools, "create_project", return_value={"project": "/tmp/nova-project"}), patch.object(automation_tools, "render_audio", return_value={"success": True}), patch.object(automation_tools, "render_project", return_value={"video": "/tmp/video.mp4", "metadata": {}}), patch.object(automation_tools, "render_thumbnail", return_value={"success": True}):
            result = automation_tools.run_pipeline("Test topic")
            self.assertTrue(result["success"])
            self.assertEqual(result["video"], "/tmp/video.mp4")

    def test_queue_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            video = project / "video.mp4"
            video.write_bytes(b"video")
            (project / "metadata.json").write_text(json.dumps({
                "title": "Queued title",
                "description": "Description",
                "tags": ["nova", "test"],
                "video": str(video),
            }), encoding="utf-8")
            with patch("core.youtube_queue._queue_file", return_value=Path(tmp) / "queue.json"):
                result = automation_tools.queue_project(str(project))
                self.assertTrue(result["success"])
                self.assertEqual(result["queue"]["status"], "queued")
                metadata = json.loads((project / "metadata.json").read_text(encoding="utf-8"))
                self.assertEqual(metadata["status"], "queued")
                self.assertEqual(metadata["queue_id"], result["queue"]["id"])

    def test_history_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(automation_tools, "HISTORY", Path(tmp) / "history.jsonl"):
                self.assertEqual(automation_tools.history()["items"], [])


if __name__ == "__main__":
    unittest.main()
