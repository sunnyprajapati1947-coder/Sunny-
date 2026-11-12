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
                evidence = {
                    "success": True,
                    "enabled": True,
                    "sources": [{
                        "title": "Verified source",
                        "url": "https://example.com/source",
                        "snippet": (
                            "The source reports several concrete developments, explains the timeline, "
                            "identifies the organizations involved, and describes the publicly documented impact."
                        ),
                    }],
                    "documents": [],
                }
                result = automation_tools.create_project("Test topic", research=evidence)
                self.assertTrue(result["success"])
                self.assertFalse(result["metadata"]["qwen_used"])
                self.assertGreaterEqual(len(result["metadata"]["script"].split()), 45)
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
        self.assertIn("HOOK:", captured[0])

    def test_quality_gate_rejects_missing_sources_and_short_script(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            metadata = {
                "title": "Test title",
                "hook": "A sufficiently clear hook",
                "description": "A test description",
                "tags": ["test"],
                "script": "This is far too short.",
                "research": {"enabled": True, "sources": []},
            }
            (project / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
            result = automation_tools.validate_project(str(project))
            self.assertFalse(result["success"])
            self.assertIn("script_too_short", result["issues"])
            self.assertIn("no_research_sources", result["issues"])

    def test_quality_gate_rejects_headlines_without_article_text(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            metadata = {
                "title": "Test title",
                "hook": "A sufficiently clear hook",
                "description": "A test description",
                "tags": ["test"],
                "script": "This is a sufficiently long script that only repeats the headlines and contains no article evidence. " * 2,
                "research": {
                    "sources": [{"title": "Headline", "snippet": "Headline only"}],
                    "documents": [{
                        "title": "Redirect",
                        "content": "HTTP 302 redirect to https://news.google.com/story. Redirects are not followed automatically",
                    }],
                },
            }
            (project / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
            result = automation_tools.validate_project(str(project))
            self.assertFalse(result["success"])
            self.assertIn("research_content_unavailable", result["issues"])

    def test_run_pipeline_blocks_headlines_only(self):
        evidence = {
            "success": True,
            "sources": [{"title": "Headline", "snippet": "Headline only"}],
            "documents": [{
                "title": "Redirect",
                "content": "HTTP 302 redirect to https://news.google.com/story. Redirects are not followed automatically",
            }],
        }
        with patch.object(automation_tools, "research_topic", return_value=evidence), \
             patch.object(automation_tools, "create_project") as create:
            with self.assertRaises(RuntimeError) as raised:
                automation_tools.run_pipeline("Test topic")
        self.assertIn("headline-only script", str(raised.exception))
        create.assert_not_called()

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
                filter_graph = args[args.index("-vf") + 1]
                self.assertIn("w=iw:h=ih", filter_graph)
                self.assertIn("mod(t*120,iw)", filter_graph)
                self.assertIn("ih*0.84", filter_graph)
                self.assertIn("expansion=none", filter_graph)
                self.assertIn("textfile='render_title.txt'", filter_graph)
                self.assertIn("textfile='render_hook.txt'", filter_graph)
                self.assertIn("textfile='render_scene_0.txt'", filter_graph)
                self.assertEqual((root / "render_title.txt").read_text(encoding="utf-8"), "Test")
                self.assertNotIn("w=w:h=h", filter_graph)
                self.assertIn("-i", args)
                self.assertIn(str(root / "voiceover.wav"), args)
                self.assertIn("-shortest", args)
                self.assertTrue(result["metadata"]["audio_muxed"])
                self.assertEqual(result["metadata"]["visual_mode"], "cinematic_motion_cards")
                self.assertTrue(result["metadata"]["packaging"]["hook_first"])
                self.assertGreaterEqual(result["metadata"]["scene_count"], 1)

    def test_render_project_ffmpeg_smoke(self):
        if not automation_tools.shutil.which("ffmpeg"):
            self.skipTest("ffmpeg is not installed")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / "project"
            project.mkdir()
            metadata = {
                "title": "FFmpeg: render, smoke [test] 50%",
                "hook": "A short render's validation",
                "script": "This script checks colon: comma, brackets [x] and a literal 50% marker in an actual FFmpeg render.",
                "aspect": "9:16",
                "duration_seconds": 5,
                "visual_style": "cinematic",
            }
            (project / "metadata.json").write_text(
                json.dumps(metadata), encoding="utf-8"
            )
            with patch.object(automation_tools, "ROOT", root / "state"):
                result = automation_tools.render_project(str(project))
            self.assertTrue(result["success"])
            video = Path(result["video"])
            self.assertTrue(video.is_file())
            self.assertGreater(video.stat().st_size, 1000)

    def test_research_topic(self):
        fake = {"results": [{"title": "Source", "url": "https://example.com", "snippet": "fact"}],
                "documents": [{"title": "Source", "url": "https://example.com", "content": "fact"}]}
        with patch("github.local_ai_agent.tools.web.research", return_value=fake):
            result = automation_tools.research_topic("test topic")
            self.assertTrue(result["success"])
            self.assertEqual(len(result["sources"]), 1)

    def test_discover_niche_uses_current_signals(self):
        fake_research = {
            "success": True,
            "enabled": True,
            "sources": [{"title": "Trend", "url": "https://example.com", "snippet": "fresh signal"}],
            "documents": [],
        }
        captured_queries = []

        def fake_research_call(query):
            captured_queries.append(query)
            return fake_research

        generated = "NICHE: AI\nREASON: fresh\nTOPIC: New AI breakthrough"
        with patch.object(automation_tools, "research_topic", side_effect=fake_research_call), \
             patch.object(automation_tools, "fast_router_ask", return_value={"success": False}), \
             patch.object(automation_tools.time, "strftime", return_value="November 2026"), \
             patch.object(automation_tools, "_qwen", return_value=generated):
            result = automation_tools.discover_niche()
        self.assertEqual(len(captured_queries), 7)
        self.assertTrue(all("November 2026" in query for query in captured_queries))
        self.assertTrue(all("September 2026" not in query for query in captured_queries))
        self.assertTrue(result["success"])
        self.assertEqual(result["niche"], "AI")
        self.assertEqual(result["topic"], "New AI breakthrough")
        self.assertTrue(result["model_used"])

    def test_repair_refuses_to_invent_missing_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            project.mkdir()
            (project / "metadata.json").write_text(json.dumps({
                "topic": "Test",
                "title": "Test title",
                "hook": "A sufficiently clear hook",
                "description": "Description",
                "tags": ["test"],
                "script": "Short script",
                "research": {"sources": []},
            }), encoding="utf-8")
            with patch.object(automation_tools, "_qwen") as qwen:
                result = automation_tools.repair_project_content(
                    str(project), {"issues": ["no_research_sources"]}
                )
            self.assertFalse(result["success"])
            self.assertIn("refusing to invent sources", result["reason"])
            qwen.assert_not_called()

    def test_run_pipeline_reports_missing_research_sources(self):
        with patch.object(automation_tools, "research_topic", return_value={
            "success": False, "error": "network unavailable", "sources": [], "documents": []
        }), patch.object(automation_tools, "create_project") as create:
            with self.assertRaises(RuntimeError) as raised:
                automation_tools.run_pipeline("Test topic")
        self.assertIn("source_count=0", str(raised.exception))
        self.assertIn("network unavailable", str(raised.exception))
        create.assert_not_called()

    def test_pipeline_uses_existing_stages(self):
        with patch.object(automation_tools, "research_topic", return_value={"success": True, "sources": [{"title": "Source", "url": "https://example.com", "snippet": "Evidence"}], "documents": [{"title": "Article", "url": "https://example.com/article", "content": "Detailed source evidence. " * 10}]}), patch.object(automation_tools, "create_project", return_value={"project": "/tmp/nova-project"}), patch.object(automation_tools, "render_audio", return_value={"success": True}), patch.object(automation_tools, "validate_project", return_value={"success": True, "score": 100, "issues": []}), patch.object(automation_tools, "render_project", return_value={"video": "/tmp/video.mp4", "metadata": {}}), patch.object(automation_tools, "render_thumbnail", return_value={"success": True}), patch.object(automation_tools, "queue_project", return_value={"success": True, "queue": {"id": "q1", "status": "queued"}}):
            result = automation_tools.run_pipeline("Test topic")
            self.assertTrue(result["success"])
            self.assertEqual(result["video"], "/tmp/video.mp4")
            self.assertEqual(result["queue"]["status"], "queued")

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
