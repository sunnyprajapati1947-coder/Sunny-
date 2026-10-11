from __future__ import annotations

import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.learning_hub import learning_available_topics, learning_find_books, learning_find_build_guide


class LearningHubTest(unittest.TestCase):
    def test_data_files_exist(self):
        data = ROOT / "core" / "data"
        for name in ("build_guides.json", "book_shelf.json", "api_directory.json", "skill_catalog.json"):
            self.assertTrue((data / name).is_file(), name)

    def test_find_build_guide_database(self):
        result = learning_find_build_guide("database")
        self.assertTrue(result["success"])
        topics = [m["topic"].lower() for m in result["matches"]]
        self.assertTrue(any("database" in t for t in topics))
        guides = result["matches"][0]["guides"]
        self.assertTrue(guides)
        for guide in guides:
            self.assertTrue(guide["url"].startswith("http"))

    def test_find_build_guide_synonyms(self):
        # 'git' should surface the Git topic even though it is short.
        result = learning_find_build_guide("git")
        self.assertTrue(result["success"])

    def test_find_build_guide_no_match(self):
        result = learning_find_build_guide("quantum unicorn teleporter")
        self.assertFalse(result["success"])
        self.assertIn("available_topics", result)

    def test_find_books_python(self):
        result = learning_find_books("python")
        self.assertTrue(result["success"])
        books = result["matches"][0]["books"]
        self.assertTrue(books)
        for book in books:
            self.assertTrue(book["url"].startswith("http"))

    def test_find_books_partial_subject(self):
        result = learning_find_books("machine learning")
        self.assertTrue(result["success"])
        subjects = " ".join(m["subject"].lower() for m in result["matches"])
        self.assertIn("machine learning", subjects)

    def test_find_books_no_match(self):
        result = learning_find_books("underwater basket weaving")
        self.assertFalse(result["success"])
        self.assertIn("available_subjects", result)

    def test_available_topics(self):
        result = learning_available_topics()
        self.assertTrue(result["success"])
        self.assertIn("Database", result["build_guide_topics"])
        self.assertIn("Python", result["book_subjects"])


if __name__ == "__main__":
    unittest.main()
