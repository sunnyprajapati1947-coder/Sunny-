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
from core import termux_tools as tt


class WhatsAppToolTest(unittest.TestCase):
    def test_rejects_short_number(self):
        result = tt.whatsapp_chat("123", text="hi")
        self.assertFalse(result["success"])
        self.assertIn("8-15", result["error"])

    def test_builds_wa_me_uri_with_number_and_text(self):
        with patch.object(tt, "_open_uri", return_value=True) as open_mock:
            result = tt.whatsapp_chat("+91 98765 43210", text="aaj meeting 5 baje")
        self.assertTrue(result["success"])
        self.assertEqual(result["number"], "919876543210")
        self.assertTrue(result["message_prefilled"])
        uri = open_mock.call_args[0][0]
        self.assertTrue(uri.startswith("https://wa.me/919876543210?text="))
        self.assertIn("meeting", uri)

    def test_picker_without_number(self):
        with patch.object(tt, "_open_uri", return_value=True) as open_mock:
            result = tt.whatsapp_chat("", text="hello duniya")
        self.assertTrue(result["success"])
        self.assertEqual(result["number"], "picker")
        uri = open_mock.call_args[0][0]
        self.assertTrue(uri.startswith("https://wa.me/?text="))

    def test_no_auto_send_note(self):
        with patch.object(tt, "_open_uri", return_value=True):
            result = tt.whatsapp_chat("919876543210")
        self.assertIn("Send button", result["note"])

    def test_dial_builds_tel_uri(self):
        with patch.object(tt, "_open_uri", return_value=True) as open_mock:
            result = tt.dial_number("919876543210")
        self.assertTrue(result["success"])
        self.assertEqual(result["dialer"], "919876543210")
        self.assertEqual(open_mock.call_args[0][0], "tel:919876543210")

    def test_dial_rejects_bad_number(self):
        self.assertFalse(tt.dial_number("12345")["success"])
        self.assertFalse(tt.dial_number("")["success"])


class BrainWhatsAppIntentTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_wa_")
        envs = {
            "NOVA_CHAT_HISTORY": str(Path(self.tmp) / "chat.json"),
            "NOVA_PROFILE_PATH": str(Path(self.tmp) / "profile.json"),
        }
        patcher = patch.dict("os.environ", envs)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_whatsapp_intent_extracts_number_and_message(self):
        with patch("core.tool_bridge.whatsapp_chat", return_value={
                "success": True, "number": "919876543210",
                "message_prefilled": True, "note": "x"}) as wc:
            result = jb.respond("919876543210 ko whatsapp pe bhejo ki aaj meeting 5 baje hai")
        self.assertEqual(result["via"], "tool")
        wc.assert_called_once()
        kwargs = wc.call_args[1]
        self.assertEqual(kwargs["number"].replace(" ", ""), "919876543210")
        self.assertIn("meeting", kwargs["text"])
        self.assertIn("Send button", result["reply"])

    def test_whatsapp_intent_without_number_opens_picker(self):
        with patch("core.tool_bridge.whatsapp_chat", return_value={
                "success": True, "number": "picker",
                "message_prefilled": False, "note": "x"}) as wc:
            result = jb.respond("whatsapp pe message bhejo")
        self.assertEqual(result["via"], "tool")
        self.assertEqual(wc.call_args[1]["number"], "")

    def test_whatsapp_kholo_opens_app_instead(self):
        # 'whatsapp kholo' the OPEN intent me jata hai (app khulti hai).
        with patch("core.tool_bridge.open_app", return_value={
                "success": True, "opened": "whatsapp", "mode": "app"}) as oa:
            result = jb.respond("whatsapp kholo")
        self.assertEqual(result["via"], "tool")
        oa.assert_called_once()

    def test_call_intent(self):
        with patch("core.tool_bridge.dial_number", return_value={
                "success": True, "dialer": "919876543210"}) as dn:
            result = jb.respond("919876543210 ko phone lagao")
        self.assertEqual(result["via"], "tool")
        dn.assert_called_once()
        self.assertEqual(dn.call_args[1]["number"].replace(" ", ""), "919876543210")
        self.assertIn("call button", result["reply"].lower())

    def test_call_intent_without_number_asks(self):
        result = jb.respond("phone lagao")
        self.assertTrue(result["success"])
        self.assertIn("Number bolo", result["reply"])

    def test_extract_message_ki_form(self):
        msg = jb._extract_message("919876543210 ko whatsapp pe bhejo ki kal subah 7 baje call karna")
        self.assertIn("kal subah", msg)
        self.assertNotIn("919876543210", msg)

    def test_extract_message_plain(self):
        msg = jb._extract_message("whatsapp bhejo homework gayab hai")
        self.assertIn("homework", msg)


class UpdateIntentTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_upd_")
        envs = {
            "NOVA_CHAT_HISTORY": str(Path(self.tmp) / "chat.json"),
            "NOVA_PROFILE_PATH": str(Path(self.tmp) / "profile.json"),
        }
        patcher = patch.dict("os.environ", envs)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_update_intent_runs_script(self):
        fake_run = type("R", (), {"returncode": 0, "stdout": "== JARVIS UPDATE ==\nAlready latest hai Boss. Kuch naya nahi hai.\n", "stderr": ""})
        with patch("subprocess.run", return_value=fake_run) as run_mock:
            result = jb.respond("jarvis update kar lo naya code le aao")
        self.assertTrue(result["success"])
        run_mock.assert_called_once()
        command = run_mock.call_args[0][0]
        self.assertEqual(command[0], "bash")
        self.assertIn("jarvis_update.sh", command[1])
        self.assertIn("latest", result["reply"].lower())

    def test_update_intent_failure_reported(self):
        fake_run = type("R", (), {"returncode": 1, "stdout": "Tests FAIL hue - rollback\n", "stderr": ""})
        with patch("subprocess.run", return_value=fake_run):
            result = jb.respond("nova repo update kar")
        self.assertTrue(result["success"])
        self.assertIn("dikkat", result["reply"].lower())

    def test_news_update_not_confused_with_self_update(self):
        # 'news update' news intent me jana chahiye, update intent me nahi.
        with patch("subprocess.run") as run_mock:
            with patch.object(jb, "_registry") as fake_registry:
                fake_registry.return_value.execute.return_value = {
                    "success": False, "result": None}
                jb.respond("news update batao")
        run_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
