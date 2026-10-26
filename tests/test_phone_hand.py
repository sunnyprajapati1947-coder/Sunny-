"""The phone hand: real Android actions through a fake Termux:API on PATH.

A stub directory stands in for the phone, so every assertion is about the exact
argv Jarvis would hand to Android — plus the honest behaviour when the bridge is
missing entirely.
"""
from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from jarvis import tools
from jarvis.skills import phone
from jarvis.store import get_store

BATTERY = {
    "health": "GOOD",
    "percentage": 76,
    "plugged": "PLUGGED_USB",
    "status": "CHARGING",
    "temperature": 31.0,
}
CONTACTS = [
    {"name": "Ravi Kumar", "number": "9876543210"},
    {"name": "Mom", "number": "+919812345678"},
]
NOTIFICATIONS = [
    {"appName": "WhatsApp", "title": "Ravi", "content": "call me"},
    {"appName": "Gmail", "title": "Invoice", "content": "due today"},
]
VOLUMES = [
    {"stream": "music", "volume": 8, "max_volume": 15},
    {"stream": "ring", "volume": 4, "max_volume": 7},
]

STUB_OUTPUT = {
    "termux-battery-status": json.dumps(BATTERY),
    "termux-contact-list": json.dumps(CONTACTS),
    "termux-notification-list": json.dumps(NOTIFICATIONS),
    "termux-clipboard-get": "copied from phone",
    "termux-location": json.dumps({"latitude": 25.5941, "longitude": 85.1376, "accuracy": 20}),
    "termux-wifi-connectioninfo": json.dumps({"ssid": "HomeNet", "link_speed_mbps": 433}),
}
STUB_SCRIPT = """#!/usr/bin/env python3
import json
import sys

with open({log!r}, "a", encoding="utf-8") as handle:
    handle.write(json.dumps([{name!r}, *sys.argv[1:]]) + "\\n")

{branch}
sys.exit(0)
"""
VOLUME_BRANCH = f"""if len(sys.argv) == 1:
    print(json.dumps({json.dumps(VOLUMES)}))
"""
PLAIN_BRANCH = "print({payload!r})"


class FakePhone:
    """Temporary PATH entry with one executable per Termux:API command."""

    def __init__(self, only: list[tuple[str, str]] | None = None) -> None:
        self.dir = Path(tempfile.mkdtemp(prefix="fake-termux-"))
        self.log = self.dir / "calls.log"
        self.bin = self.dir / "bin"
        self.bin.mkdir()
        names = only if only is not None else list(phone.CAPABILITIES.values())
        for binary, _ in names:
            self._write(binary)

    def _write(self, binary: str) -> None:
        if binary == "termux-volume":
            branch = VOLUME_BRANCH
        elif binary in STUB_OUTPUT:
            branch = PLAIN_BRANCH.format(payload=STUB_OUTPUT[binary])
        else:
            branch = ""
        script = STUB_SCRIPT.format(log=str(self.log), name=binary, branch=branch)
        path = self.bin / binary
        path.write_text(script, encoding="utf-8")
        path.chmod(0o755)

    def calls(self) -> list[list[str]]:
        if not self.log.exists():
            return []
        rows = []
        for line in self.log.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            rows.append(json.loads(line))
        return rows

    def written(self, name: str) -> list[str]:
        """Return the joined arguments of every call to one binary."""
        return [" ".join(parts[1:]) for parts in self.calls() if parts and parts[0] == name]

    def __enter__(self) -> "FakePhone":
        self._old_path = os.environ.get("PATH", "")
        os.environ["PATH"] = f"{self.bin}{os.pathsep}{self._old_path}"
        return self

    def __exit__(self, *_exc) -> None:
        os.environ["PATH"] = self._old_path
        shutil.rmtree(self.dir, ignore_errors=True)


class FakePhoneTests(unittest.TestCase):
    def test_check_reports_every_capability(self) -> None:
        with FakePhone():
            result = phone.phone_check()
        data = result["data"]
        self.assertTrue(data["ready"])
        self.assertEqual(data["missing"], [])
        self.assertEqual(len(data["capabilities"]), len(phone.CAPABILITIES))
        self.assertIn("fully connected", result["text"])

    def test_battery_is_parsed_not_dumped(self) -> None:
        with FakePhone():
            result = phone.phone_battery()
        self.assertIn("76%", result["text"])
        self.assertIn("charging", result["text"])
        items = {row["label"]: row["value"] for row in result["cards"][0]["items"]}
        self.assertEqual(items["charge"], "76%")
        self.assertEqual(items["temp"], "31.0°C")

    def test_sms_passes_number_and_text_to_android(self) -> None:
        get_store().set_contact("Ravi", phone="9876543210")
        with FakePhone() as fake:
            result = phone.phone_sms("Ravi", "running late")
            sent = fake.written("termux-sms-send")
        self.assertTrue(result["data"]["sent"], result)
        self.assertEqual(len(sent), 1)
        self.assertIn("-n", sent[0])
        self.assertIn("9876543210", sent[0])
        self.assertIn("running late", sent[0])

    def test_sms_text_with_shell_characters_is_literal(self) -> None:
        get_store().set_contact("Ravi", phone="9876543210")
        payload = "meet at 5; rm -rf / > /tmp/x | tee"
        with FakePhone() as fake:
            result = phone.phone_sms("Ravi", payload)
            sent = fake.written("termux-sms-send")
        self.assertTrue(result["data"]["sent"])
        self.assertIn(payload, sent[0])
        self.assertFalse(Path("/tmp/x").exists())

    def test_sms_preflight_blocks_bad_input(self) -> None:
        blocked = phone.phone_sms_preflight("nobody-here", "hi")
        self.assertEqual(blocked["data"]["unknown_contact"], True)
        get_store().set_contact("Ravi", phone="9876543210")
        self.assertEqual(phone.phone_sms_preflight("Ravi", "")["data"]["needs_message"], True)
        with FakePhone():
            self.assertIsNone(phone.phone_sms_preflight("Ravi", "hello"))

    def test_call_dials_the_resolved_number(self) -> None:
        get_store().set_contact("Ravi", phone="9876543210")
        with FakePhone() as fake:
            result = phone.phone_call("Ravi")
            dialed = fake.written("termux-telephony-call")
        self.assertTrue(result["data"]["called"], result)
        self.assertIn("9876543210", dialed[0])

    def test_call_contact_intent_uses_the_hand_when_present(self) -> None:
        from jarvis.skills import communication

        get_store().set_contact("Ravi", phone="9876543210")
        with FakePhone() as fake:
            result = communication.call_contact("Ravi")
            dialed = fake.written("termux-telephony-call")
        self.assertTrue(result["data"].get("called"), result)
        self.assertTrue(dialed)

    def test_torch_volume_notify_and_clipboard(self) -> None:
        with FakePhone() as fake:
            phone.phone_torch("on")
            phone.phone_torch("off")
            phone.phone_volume(60, "ring")
            phone.phone_notify("Battery", "charge me")
            clipboard = phone.phone_clipboard("read")
            torch = fake.written("termux-torch")
            volume = fake.written("termux-volume")
            notify = fake.written("termux-notification")
        self.assertEqual(torch, ["on", "off"])
        self.assertIn("ring 60", volume)
        self.assertIn("Battery", notify[0])
        self.assertIn("charge me", notify[0])
        self.assertEqual(clipboard["data"]["text"], "copied from phone")

    def test_volume_read_lists_streams(self) -> None:
        with FakePhone():
            result = phone.phone_volume(None)
        rows = result["cards"][0]["rows"]
        self.assertTrue(any("music: 8/15" in row for row in rows), rows)

    def test_notifications_and_contacts(self) -> None:
        with FakePhone():
            notes = phone.phone_notifications(5)
            contacts = phone.phone_contacts("ravi")
        self.assertEqual(notes["data"]["count"], 2)
        self.assertIn("WhatsApp", notes["cards"][0]["rows"][0])
        self.assertEqual(contacts["data"]["matches"], 1)
        self.assertIn("Ravi Kumar", contacts["cards"][0]["rows"][0])

    def test_location_and_speak(self) -> None:
        with FakePhone() as fake:
            location = phone.phone_location()
            spoken = phone.phone_speak("good morning sir")
            spoken_args = fake.written("termux-tts-speak")
        self.assertAlmostEqual(location["data"]["latitude"], 25.5941)
        self.assertIn("good morning sir", spoken_args[0])
        self.assertTrue(spoken["data"]["spoken"])

    def test_capabilities_are_detected_per_binary(self) -> None:
        partial = [("termux-battery-status", "read the battery"), ("termux-notification", "post a notification")]
        with FakePhone(only=partial):
            caps = phone.capabilities()
            result = phone.phone_check()
        self.assertTrue(caps["battery"])
        self.assertFalse(caps["sms"])
        self.assertIn("sms", result["data"]["missing"])
        self.assertIn("pkg install termux-api", " ".join(result["cards"][0]["rows"]))


class NoBridgeTests(unittest.TestCase):
    """On a PC the hand must be honest and still offer a one-tap fallback."""

    def setUp(self) -> None:
        self.patch = mock.patch.dict(os.environ, {"PATH": "/nonexistent"}, clear=False)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_check_is_honest(self) -> None:
        result = phone.phone_check()
        self.assertFalse(result["data"]["ready"])
        self.assertEqual(len(result["data"]["missing"]), len(phone.CAPABILITIES))
        self.assertIn("No phone hand", result["text"])

    def test_sms_offers_a_link_instead_of_pretending(self) -> None:
        get_store().set_contact("Ravi", phone="9876543210")
        result = phone.phone_sms("Ravi", "hello")
        self.assertFalse(result["data"]["phone"])
        self.assertEqual(result["action"]["type"], "open_url")
        self.assertIn("+91", result["action"]["url"])
        self.assertIn("9876543210", result["action"]["url"])

    def test_call_offers_tel_link(self) -> None:
        get_store().set_contact("Ravi", phone="9876543210")
        result = phone.phone_call("Ravi")
        self.assertTrue(result["action"]["url"].startswith("tel:+"))
        self.assertIn("9876543210", result["action"]["url"])
        self.assertFalse(result["data"]["phone"])

    def test_sms_preflight_hands_back_the_link(self) -> None:
        get_store().set_contact("Ravi", phone="9876543210")
        blocked = phone.phone_sms_preflight("Ravi", "hello there")
        self.assertIsNotNone(blocked)
        self.assertEqual(blocked["action"]["type"], "open_url")
        self.assertIn("hello%20there", blocked["action"]["url"])

    def test_status_does_not_blame_the_battery(self) -> None:
        result = phone.phone_status()
        self.assertIn("no phone hand", result["text"].lower())
        self.assertEqual(result["cards"][0]["title"], "TERMUX:API SETUP")

    def test_device_actions_explain_themselves(self) -> None:
        for call in (
            lambda: phone.phone_torch("on"),
            lambda: phone.phone_vibrate(200),
            lambda: phone.phone_notifications(3),
            lambda: phone.phone_location(),
            lambda: phone.phone_photo(),
        ):
            result = call()
            self.assertFalse(result["data"]["phone"])
            self.assertTrue(result["text"])
            self.assertEqual(result["cards"][0]["title"], "TERMUX:API SETUP")


class RegistryTests(unittest.TestCase):
    def test_every_phone_tool_is_registered(self) -> None:
        expected = {
            "phone_check", "phone_status", "phone_battery", "phone_call", "phone_sms",
            "phone_notify", "phone_vibrate", "phone_torch", "phone_volume",
            "phone_clipboard", "phone_speak", "phone_photo", "phone_contacts",
            "phone_notifications", "phone_location", "phone_open",
        }
        for name in expected:
            tool = tools.get(name)
            self.assertIsNotNone(tool, name)
            self.assertEqual(tool.category, "phone")
        self.assertGreaterEqual(len(tools.TOOLS), 115)

    def test_side_effects_need_approval(self) -> None:
        self.assertTrue(tools.get("phone_sms").high_impact)
        self.assertTrue(tools.get("phone_call").high_impact)
        self.assertIsNotNone(tools.get("phone_sms").preflight)
        self.assertFalse(tools.get("phone_torch").high_impact)

    def test_hud_can_render_row_style_cards(self) -> None:
        app_js = (Path(__file__).resolve().parent.parent / "web" / "assets" / "app.js").read_text(encoding="utf-8")
        self.assertIn("card.items || card.rows", app_js)
        self.assertIn("footerPhone", app_js)
        index = (Path(__file__).resolve().parent.parent / "web" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="phoneNote"', index)

    def test_status_summary_shape(self) -> None:
        summary = phone.phone_hand_summary()
        self.assertEqual(set(summary), {"android", "ready", "available", "count", "total"})
        self.assertEqual(summary["total"], len(phone.CAPABILITIES))


class IntentTests(unittest.TestCase):
    def test_english_and_hinglish_routes(self) -> None:
        from jarvis.intents import match

        cases = {
            "phone check": "phone_check",
            "check the phone": "phone_check",
            "phone status": "phone_status",
            "phone battery": "phone_battery",
            "torch on": "phone_torch",
            "flashlight off": "phone_torch",
            "vibrate": "phone_vibrate",
            "phone volume 40": "phone_volume",
            "read my phone notifications": "phone_notifications",
            "where is my phone": "phone_location",
            "phone contacts ravi": "phone_contacts",
            "open youtube on the phone": "phone_open",
            "say good morning on the phone": "phone_speak",
            "sms ravi saying I am late": "phone_sms",
            "ravi ko sms bhejo main late hoon": "phone_sms",
            "ravi ko call karo": "call_contact",
        }
        for phrase, expected in cases.items():
            intent = match(phrase)
            self.assertIsNotNone(intent, phrase)
            self.assertEqual(intent.name, expected, phrase)

    def test_sms_payload_is_split_correctly(self) -> None:
        from jarvis.intents import match

        intent = match("sms ravi saying I am late")
        self.assertEqual(intent.args["contact"], "ravi")
        self.assertEqual(intent.args["message"], "I am late")

    def test_phone_battery_does_not_steal_pc_battery(self) -> None:
        from jarvis.intents import match

        self.assertEqual(match("battery").name, "battery_status")
        self.assertEqual(match("phone battery").name, "phone_battery")


if __name__ == "__main__":
    unittest.main()
