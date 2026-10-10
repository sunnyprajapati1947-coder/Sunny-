from __future__ import annotations

import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import jarvis_brain as jb
from core import study_assistant as sa
from core.fast_router import ask, route


class RouterFallbackTest(unittest.TestCase):
    def test_deep_prompt_falls_back_to_fast_when_deep_down(self):
        # A research-y prompt routes to deep, but deep (8080) is dead:
        # it must answer on the fast lane instead of returning offline.
        prompt = "Research five sources and analyze evidence, then write a detailed script"
        self.assertEqual(route(prompt), "deep")
        with patch("core.fast_router._call", side_effect=[None, "fast lane jawab"]) as call_mock:
            result = ask(prompt)
        self.assertTrue(result["success"])
        self.assertEqual(result["lane"], "fast_fallback")
        self.assertEqual(result["answer"], "fast lane jawab")
        self.assertEqual(call_mock.call_count, 2)

    def test_fast_prompt_still_fast(self):
        with patch("core.fast_router._call", return_value="ok") as call_mock:
            result = ask("Choose one niche")
        self.assertEqual(result["lane"], "fast")
        self.assertEqual(call_mock.call_count, 1)


class PhoneIntentTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_v3_")
        envs = {
            "NOVA_CHAT_HISTORY": str(Path(self.tmp) / "chat.json"),
            "NOVA_PROFILE_PATH": str(Path(self.tmp) / "profile.json"),
        }
        patcher = patch.dict("os.environ", envs)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_torch_on_intent(self):
        with patch("core.tool_bridge.torch_light", return_value={"success": True, "torch": "on"}):
            result = jb.respond("torch jala do")
        self.assertEqual(result["via"], "tool")
        self.assertIn("on", result["reply"])

    def test_torch_off_intent(self):
        with patch("core.tool_bridge.torch_light", return_value={"success": True, "torch": "off"}) as tl:
            result = jb.respond("torch band karo")
        self.assertEqual(result["via"], "tool")
        # off word detected -> on=False passed to the tool
        self.assertIs(tl.call_args[1].get("on"), False)

    def test_clipboard_intent(self):
        with patch("core.tool_bridge.clipboard_get", return_value={"success": True, "text": "meeting 5 baje"}):
            result = jb.respond("clipboard me kya hai")
        self.assertEqual(result["via"], "tool")
        self.assertIn("meeting 5 baje", result["reply"])

    def test_volume_intent(self):
        with patch("core.tool_bridge.set_volume", return_value={"success": True, "stream": "music", "volume": 70}) as sv:
            result = jb.respond("volume badhao")
        self.assertEqual(result["via"], "tool")
        sv.assert_called_once()
        self.assertEqual(sv.call_args[1].get("volume"), 70)

    def test_brightness_intent(self):
        with patch("core.tool_bridge.set_brightness", return_value={"success": True, "brightness": 30}):
            result = jb.respond("brightness kam karo")
        self.assertEqual(result["via"], "tool")
        self.assertIn("30", result["reply"])


class StudyModuleTest(unittest.TestCase):
    def test_subject_aliases(self):
        self.assertEqual(sa._resolve_subject("vigyan"), "Science")
        self.assertEqual(sa._resolve_subject("ganit ka syllabus"), "Mathematics")
        self.assertEqual(sa._resolve_subject("sst"), "Social Science")

    def test_study_plan(self):
        result = sa.study_plan("science")
        self.assertTrue(result["success"])
        self.assertGreaterEqual(len(result["chapters"]), 10)
        self.assertTrue(result["tips"])
        self.assertIn("cbseacademic", result["note"])

    def test_study_plan_unknown(self):
        result = sa.study_plan("sanskrit")
        self.assertFalse(result["success"])
        self.assertIn("Science", result["subjects"])

    def test_study_quiz(self):
        result = sa.study_quiz("science", count=3)
        self.assertTrue(result["success"])
        self.assertEqual(len(result["questions"]), 3)
        for q in result["questions"]:
            self.assertEqual(len(q["options"]), 4)
            self.assertIn(q["answer"], q["options"])

    def test_study_quiz_hindi_alias_unsupported_subject(self):
        result = sa.study_quiz("hindi", count=3)
        # Hindi has no MCQs yet - must fail honestly, not fabricate.
        self.assertFalse(result["success"])

    def test_study_tips_general(self):
        result = sa.study_tips("kuch bhi")
        self.assertTrue(result["success"])
        self.assertTrue(result.get("general_tips"))

    def test_brain_study_intent(self):
        # study_plan is imported inside build_registry at call time, so patch
        # the source module; the fresh registry picks up the patched function.
        with patch("core.study_assistant.study_plan", return_value={
            "success": True, "subject": "Science",
            "chapters": [f"Chapter {i}" for i in range(1, 13)],
            "weightage": "80+20", "tips": ["tip1"], "note": "note"}) as sp:
            result = jb.respond("science ka syllabus batao")
        self.assertEqual(result["via"], "tool")
        sp.assert_called_once()
        self.assertIn("12 chapters", result["reply"])

    def test_brain_study_quiz_intent(self):
        with patch("core.study_assistant.study_quiz", return_value={
            "success": True, "subject": "Mathematics", "count": 3,
            "questions": [
                {"q": "sin30?", "options": ["0", "1/2", "1", "2"], "answer": "1/2"}
            ]}) as sq:
            result = jb.respond("maths ka quiz lagao")
        self.assertEqual(result["via"], "tool")
        sq.assert_called_once()
        self.assertIn("sin30", result["reply"])

    def test_detail_requests_get_more_tokens(self):
        with patch("core.fast_router.ask") as ask_mock:
            ask_mock.return_value = {"success": True, "lane": "fast", "answer": "detail..."}
            jb.respond("electricity chapter detail me samjhao")
        _, kwargs = ask_mock.call_args
        self.assertEqual(kwargs.get("max_tokens"), 800)

    def test_normal_requests_get_fewer_tokens(self):
        with patch("core.fast_router.ask") as ask_mock:
            ask_mock.return_value = {"success": True, "lane": "fast", "answer": "short..."}
            jb.respond("kaisa lag raha hai aaj")
        _, kwargs = ask_mock.call_args
        self.assertLessEqual(kwargs.get("max_tokens"), 400)


class NewsHeadlineTest(unittest.TestCase):
    def test_news_reads_real_headlines_from_page(self):
        search_payload = {
            "success": True,
            "results": [
                {"title": "Some News Site", "url": "https://example-news.com/1", "snippet": ""},
            ],
        }
        page_text = (
            "https://example-news.com/1\n"
            "Sign in\n"
            "Bihar board ne nayi exam date announce ki hai aaj shaam ko\n"
            "India ne series 2-1 se jeet li exciting match ke saath\n"
            "Mausam vibhag ne kal ke liye baarish ka alert jari kiya hai\n"
        )

        def fake_execute(name, arguments=None, **kwargs):
            if name == "web_search":
                return {"success": True, "result": {"trust": "untrusted", "content": search_payload}}
            if name == "web_fetch":
                return {"success": True, "result": {"trust": "untrusted", "content": {"success": True, "text": page_text}}}
            return {"success": False}

        with patch.object(jb, "_registry") as fake_registry:
            fake_registry.return_value.execute.side_effect = fake_execute
            result = jb.respond("aaj ki khabar batao")
        self.assertEqual(result["via"], "tool")
        self.assertIn("Bihar board", result["reply"])
        # Nav junk must not be spoken.
        self.assertNotIn("Sign in", result["reply"])


if __name__ == "__main__":
    unittest.main()
