"""Phase 5: barge-in voice, desktop readiness check and Hinglish time."""
from __future__ import annotations

import json
import unittest
from datetime import datetime
from pathlib import Path

from jarvis import tools
from jarvis.config import Settings, _apply_overrides, validate_patch
from jarvis.intents import match
from jarvis.skills import desktop

ROOT = Path(__file__).resolve().parent.parent


class BargeInSettingTests(unittest.TestCase):
    def test_default_is_on(self) -> None:
        self.assertIs(Settings().barge_in, True)

    def test_patch_accepts_false(self) -> None:
        clean, warnings = validate_patch({"barge_in": False})
        self.assertIs(clean["barge_in"], False)
        self.assertEqual(warnings, [])

    def test_override_round_trip(self) -> None:
        settings = _apply_overrides(Settings(), {"barge_in": False})
        self.assertIs(settings.barge_in, False)
        self.assertIn("barge_in", settings.public())


class HudVoiceMarkupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.js = (ROOT / "web" / "assets" / "app.js").read_text(encoding="utf-8")
        cls.html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")

    def test_barge_in_controls_exist(self) -> None:
        for needle in (
            "WAKE_ALIASES",
            "function findWake(",
            "function startBargeWatch(",
            "function stopBargeWatch(",
            "barge_in",
            "barge-in · you took the floor",
            'visibilitychange',
        ):
            self.assertIn(needle, self.js)
        self.assertIn('id="setBarge"', self.html)
        self.assertIn("Barge-in", self.html)

    def test_wake_aliases_cover_common_mishears(self) -> None:
        self.assertIn("jarvice", self.js)
        self.assertIn("जार्विस", self.js)

    def test_settings_form_wires_the_toggle(self) -> None:
        self.assertIn('$("setBarge").checked = settings.barge_in !== false;', self.js)
        self.assertIn('barge_in: $("setBarge").checked,', self.js)


class DesktopCheckTests(unittest.TestCase):
    def test_report_shape(self) -> None:
        result = desktop.desktop_check()
        data = result["data"]
        self.assertIn("ready", data)
        self.assertIn("display", data)
        self.assertEqual(data["ready"], bool(data["display"] and data["checks"]["input"]["ok"]))
        self.assertIn(data["platform"], {"linux", "darwin", "windows"})
        self.assertTrue(result["speech"])
        self.assertEqual(result["cards"][0]["type"], "list")
        self.assertTrue(any("next:" in row for row in result["cards"][0]["rows"]))

    def test_missing_capabilities_print_an_install_command(self) -> None:
        data = desktop.desktop_check()["data"]
        if data["missing"]:
            self.assertTrue(data["install"])
        else:
            self.assertEqual(data["install"], "")

    def test_registered_and_routed(self) -> None:
        tool = tools.get("desktop_check")
        self.assertIsNotNone(tool)
        self.assertFalse(tool.high_impact)
        for phrase in ("desktop check", "desktop setup", "check desktop control"):
            self.assertEqual(match(phrase).name, "desktop_check")
        self.assertEqual(match("desktop status").name, "desktop_status")


class HinglishIntentTests(unittest.TestCase):
    def test_trailing_yaad_dilana_becomes_a_reminder(self) -> None:
        intent = match("aaj shaam paune 5 baje gym yaad dilana", datetime(2026, 10, 26, 12, 0))
        self.assertEqual(intent.name, "reminder_add")
        self.assertEqual(intent.args["text"], "gym")
        self.assertEqual(intent.args["due"], "2026-10-26T16:45:00")

    def test_time_first_then_yaad_dilana(self) -> None:
        intent = match("kal subah sawa 8 baje uthana yaad dilana", datetime(2026, 10, 26, 12, 0))
        self.assertEqual(intent.name, "reminder_add")
        self.assertEqual(intent.args["due"], "2026-10-27T08:15:00")

    def test_reminder_without_time_still_asks(self) -> None:
        intent = match("doodh lana yaad rakhna", datetime(2026, 10, 26, 12, 0))
        self.assertEqual(intent.name, "reminder_add")
        self.assertIsNone(intent.args.get("due"))
        self.assertEqual(intent.args.get("text"), "doodh lana")

    def test_calendar_understands_sawa(self) -> None:
        intent = match("schedule dentist kal subah sawa 8 baje", datetime(2026, 10, 26, 12, 0))
        self.assertEqual(intent.name, "calendar_event")
        self.assertIn("sawa 8 baje", intent.args["when"])


class ManifestTests(unittest.TestCase):
    def test_manifest_still_valid_json(self) -> None:
        manifest = json.loads((ROOT / "web" / "manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual(manifest["short_name"], "JARVIS")
        self.assertEqual(len(manifest["icons"]), 4)


if __name__ == "__main__":
    unittest.main()
