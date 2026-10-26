"""Hinglish time parsing: idioms people actually say out loud."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from jarvis.timeparse import parse_alarm_time, parse_duration, parse_when

REFERENCE = datetime(2026, 10, 26, 12, 0)  # Monday, noon


class DurationTests(unittest.TestCase):
    def test_plain_english_durations(self) -> None:
        self.assertEqual(parse_duration("in 10 minutes"), 600)
        self.assertEqual(parse_duration("after 2 hours"), 7200)
        self.assertEqual(parse_duration("remind me in 1 hour 30 minutes"), 5400)

    def test_hinglish_hour_idioms(self) -> None:
        self.assertEqual(parse_duration("aadhe ghante baad"), 1800)
        self.assertEqual(parse_duration("dedh ghante baad"), 5400)
        self.assertEqual(parse_duration("dhai ghante me"), 9000)
        self.assertEqual(parse_duration("sawa ghante baad"), 4500)

    def test_hinglish_units(self) -> None:
        self.assertEqual(parse_duration("bees minute baad"), 1200)
        self.assertEqual(parse_duration("paanch minat me"), 300)


class ClockIdiomTests(unittest.TestCase):
    def test_sawa(self) -> None:
        when, rest = parse_when("kal subah sawa 8 baje uthna", REFERENCE)
        self.assertEqual(when, datetime(2026, 10, 27, 8, 15))
        self.assertEqual(rest, "uthna")

    def test_paune(self) -> None:
        when, rest = parse_when("aaj shaam paune 5 baje gym", REFERENCE)
        self.assertEqual(when, datetime(2026, 10, 26, 16, 45))
        self.assertEqual(rest, "gym")

    def test_saadhe_and_dedh(self) -> None:
        self.assertEqual(parse_when("saadhe 6 baje", REFERENCE)[0], datetime(2026, 10, 26, 18, 30))
        self.assertEqual(parse_when("dedh baje", REFERENCE)[0], datetime(2026, 10, 26, 13, 30))

    def test_dhai(self) -> None:
        self.assertEqual(parse_when("dhai baje meeting", REFERENCE)[0], datetime(2026, 10, 26, 14, 30))

    def test_sawa_with_word_number(self) -> None:
        self.assertEqual(parse_when("sawa paanch baje", REFERENCE)[0], datetime(2026, 10, 26, 17, 15))

    def test_raat_midnight_is_not_noon(self) -> None:
        when, _ = parse_when("aaj raat 12 baje", REFERENCE)
        self.assertEqual(when, datetime(2026, 10, 27, 0, 0))


class DayTests(unittest.TestCase):
    def test_kal_aaj_parso(self) -> None:
        self.assertEqual(parse_when("kal subah 8 baje dentist", REFERENCE)[0], datetime(2026, 10, 27, 8, 0))
        self.assertEqual(parse_when("aaj shaam 6 baje", REFERENCE)[0], datetime(2026, 10, 26, 18, 0))
        self.assertEqual(parse_when("parso dopahar 2 baje", REFERENCE)[0], datetime(2026, 10, 28, 14, 0))

    def test_next_week_and_weekday(self) -> None:
        self.assertEqual(parse_when("agle hafte", REFERENCE)[0], datetime(2026, 11, 2, 9, 0))
        self.assertEqual(parse_when("agle somvaar ko 5 baje meeting", REFERENCE)[0], datetime(2026, 11, 2, 17, 0))
        self.assertEqual(parse_when("next friday 3 pm", REFERENCE)[0], datetime(2026, 10, 30, 15, 0))

    def test_weekday_rest_is_clean(self) -> None:
        self.assertEqual(parse_when("agle somvaar ko 5 baje meeting", REFERENCE)[1], "meeting")


class AlarmTests(unittest.TestCase):
    def test_alarm_uses_idioms(self) -> None:
        self.assertEqual(parse_alarm_time("paune 5 baje", REFERENCE), (16, 45))
        self.assertEqual(parse_alarm_time("sawa 6 baje subah", REFERENCE), (6, 15))
        self.assertEqual(parse_alarm_time("dedh baje", REFERENCE), (13, 30))

    def test_plain_alarm_unchanged(self) -> None:
        self.assertEqual(parse_alarm_time("7:30 am", REFERENCE), (7, 30))
        self.assertEqual(parse_alarm_time("at 6 pm", REFERENCE), (18, 0))


class RegressionTests(unittest.TestCase):
    def test_unknown_text_is_not_a_time(self) -> None:
        when, rest = parse_when("tell me a joke", REFERENCE)
        self.assertIsNone(when)
        self.assertEqual(rest, "tell me a joke")

    def test_relative_duration_target(self) -> None:
        when, _ = parse_when("20 minute me call karna", REFERENCE)
        self.assertEqual(when, REFERENCE + timedelta(seconds=1200))


if __name__ == "__main__":
    unittest.main()
