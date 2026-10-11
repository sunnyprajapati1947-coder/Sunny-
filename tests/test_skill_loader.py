from __future__ import annotations

import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import skill_loader as sl


class SkillLoaderTest(unittest.TestCase):
    def test_seed_skills_list(self):
        result = sl.skills_list()
        self.assertTrue(result["success"])
        names = [s["name"] for s in result["skills"]]
        for expected in ("market-analysis", "daily-briefing", "learn-topic",
                         "repo-context", "web-research"):
            self.assertIn(expected, names)
        # Every listed pack carries a description and tool names.
        for skill in result["skills"]:
            self.assertTrue(skill.get("description"))

    def test_skills_get_full_pack(self):
        result = sl.skills_get("market-analysis")
        self.assertTrue(result["success"])
        skill = result["skill"]
        self.assertEqual(skill["name"], "market-analysis")
        self.assertIn("market_analyze", skill["tools"])
        self.assertIn("## Steps", skill["steps_markdown"])
        self.assertIn("## Guardrails", skill["steps_markdown"])

    def test_skills_get_rejects_bad_name(self):
        self.assertFalse(sl.skills_get("../etc/passwd")["success"])
        self.assertFalse(sl.skills_get("no-such-skill")["success"])

    def test_skills_validate(self):
        good = Path(tempfile.mkdtemp(prefix="nova_skill_")) / "SKILL.md"
        good.write_text(
            "---\nname: test-pack\ndescription: A test skill\ntools: web_search\n---\n\n# Steps\n1. Do it.\n",
            encoding="utf-8",
        )
        result = sl.skills_validate(str(good))
        self.assertTrue(result["success"])
        self.assertEqual(result["name"], "test-pack")

    def test_skills_validate_missing_fields(self):
        bad = Path(tempfile.mkdtemp(prefix="nova_skill_")) / "SKILL.md"
        bad.write_text("---\nname: incomplete\n---\n\nNo description.\n", encoding="utf-8")
        result = sl.skills_validate(str(bad))
        self.assertFalse(result["success"])
        self.assertIn("missing field: description", result["error"])

    def test_skills_validate_bad_name(self):
        bad = Path(tempfile.mkdtemp(prefix="nova_skill_")) / "SKILL.md"
        bad.write_text(
            "---\nname: Bad Name!\ndescription: x\n---\n\nBody.\n", encoding="utf-8"
        )
        result = sl.skills_validate(str(bad))
        self.assertFalse(result["success"])

    def test_catalog_search(self):
        result = sl.skills_catalog_search("skill-creator")
        self.assertTrue(result["success"])
        self.assertGreater(result["count"], 0)
        self.assertTrue(all("skill" in (s["name"] + s["description"]).lower()
                            for s in result["skills"]))

    def test_catalog_data_exists(self):
        catalog = ROOT / "core" / "data" / "skill_catalog.json"
        self.assertTrue(catalog.is_file())


if __name__ == "__main__":
    unittest.main()
