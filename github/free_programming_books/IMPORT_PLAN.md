# Nova — free-programming-books Import Plan

Source:
EbookFoundation/free-programming-books

What Nova adopted:
- A curated offline index of free books for popular subjects, so Nova can
  recommend real free reading offline.

Where it lives:
- core/data/book_shelf.json (curated by github/curate_source_data.py)
- core/learning_hub.py (learning_find_books)
- skills/learn-topic/SKILL.md

Rules:
1. Links point to the original free books; Nova never rehosts content.
2. Only freely-licensed entries from the upstream index are included.
