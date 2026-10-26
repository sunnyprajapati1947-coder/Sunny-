"""Tests for desktop control, real sending and the installable PWA."""
import json
import tempfile
import unittest
from pathlib import Path

from jarvis import tools
from jarvis.config import get_settings
from jarvis.skills import communication, desktop


class DesktopControlTests(unittest.TestCase):
    def setUp(self):
        self.was_armed = desktop.armed()
        desktop.desktop_arm("off")
        self.addCleanup(lambda: desktop.desktop_arm("on" if self.was_armed else "off"))

    def test_status_reports_platform(self):
        result = desktop.desktop_status()
        self.assertIn("platform", result["data"])
        self.assertIn(result["data"]["platform"], {"linux", "windows", "darwin"})

    def test_input_is_gated_when_disarmed(self):
        result = desktop.desktop_type("hello")
        self.assertEqual(result["data"]["armed"], False)
        self.assertIn("not armed", result["text"])

    def test_arming_unlocks_and_panic_locks(self):
        desktop.desktop_arm("on")
        self.assertTrue(desktop.armed())
        desktop.desktop_arm("panic")
        self.assertFalse(desktop.armed())

    def test_invalid_key_combo_rejected(self):
        desktop.desktop_arm("on")
        result = desktop.desktop_keys("ctrl+$(whoami)")
        self.assertIn("characters I do not accept", result["text"])

    def test_destructive_combo_blocked(self):
        desktop.desktop_arm("on")
        result = desktop.desktop_keys("ctrl+delete")
        self.assertIn("will not send", result["text"])

    def test_combo_normalisation(self):
        self.assertEqual(desktop._normalize_combo("Control + S"), "ctrl+s")
        self.assertEqual(desktop._normalize_combo("cmd shift 4"), "cmd+shift+4")

    def test_sendkeys_mapping(self):
        self.assertEqual(desktop._sendkeys("ctrl+s"), "^s")
        self.assertEqual(desktop._sendkeys("alt+tab"), "%{TAB}")
        self.assertIsNone(desktop._sendkeys("win+r"))

    def test_typing_explains_headless_or_missing_tool(self):
        desktop.desktop_arm("on")
        result = desktop.desktop_type("hello")
        self.assertTrue(
            "no desktop surface" in result["text"]
            or "xdotool" in result["text"]
            or "PowerShell" in result["text"]
            or "Typed" in result["text"]
        )


class CommunicationTests(unittest.TestCase):
    def test_email_without_smtp_is_honest(self):
        result = communication.email_send(to="someone@example.com", subject="Hi", body="Hello")
        self.assertIn("SMTP is not configured", result["text"])
        self.assertTrue(result["data"]["needs_smtp"])

    def test_calendar_writes_ics(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = communication.DATA_DIR
            communication.DATA_DIR = Path(tmp)
            try:
                result = communication.calendar_event(title="Dentist", when="tomorrow at 5 pm", remind=False)
            finally:
                communication.DATA_DIR = original
            self.assertIn("Added", result["text"])
            path = Path(result["data"]["path"])
            body = path.read_text(encoding="utf-8")
            self.assertIn("BEGIN:VEVENT", body)
            self.assertIn("SUMMARY:Dentist", body)
            self.assertIn("DTSTART:", body)
            self.assertAlmostEqual(result["data"]["minutes"], 30)

    def test_calendar_needs_a_time(self):
        result = communication.calendar_event(title="Buy milk", when="someday")
        self.assertTrue(result["data"].get("needs_time"))

    def test_calendar_derives_title_from_when(self):
        result = communication.calendar_event(title="", when="team meeting on friday at 10 am", remind=False)
        self.assertEqual(result["data"]["title"].lower(), "team meeting")

    def test_whatsapp_autosend_requires_arming(self):
        desktop.desktop_arm("off")
        result = communication.whatsapp_autosend(contact="+919999999999", message="hi")
        self.assertFalse(result["data"].get("armed", True))

    def test_ics_escaping(self):
        self.assertEqual(communication._ics_escape("a, b; c"), "a\\, b\\; c")


class PwaTests(unittest.TestCase):
    def test_manifest_is_valid(self):
        manifest = json.loads(Path("web/manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual(manifest["short_name"], "JARVIS")
        self.assertEqual(manifest["display"], "standalone")
        self.assertGreaterEqual(len(manifest["icons"]), 2)
        for icon in manifest["icons"]:
            target = Path("web" + icon["src"])
            self.assertTrue(target.is_file(), icon["src"])

    def test_service_worker_exists(self):
        worker = Path("web/sw.js").read_text(encoding="utf-8")
        self.assertIn("serviceWorker", Path("web/assets/app.js").read_text(encoding="utf-8"))
        self.assertIn("/api/", worker)
        self.assertIn("caches.open", worker)


class ToolRegistryTests(unittest.TestCase):
    def test_new_tools_registered(self):
        for name in (
            "desktop_status", "desktop_arm", "desktop_type", "desktop_keys",
            "desktop_click", "desktop_move", "desktop_windows", "desktop_focus",
            "desktop_read_screen", "email_send", "calendar_event", "whatsapp_autosend",
        ):
            self.assertIn(name, tools.TOOLS, name)

    def test_high_impact_sending(self):
        self.assertTrue(tools.TOOLS["email_send"].high_impact)
        self.assertTrue(tools.TOOLS["whatsapp_autosend"].high_impact)
        self.assertFalse(tools.TOOLS["desktop_type"].high_impact)


if __name__ == "__main__":
    unittest.main()
