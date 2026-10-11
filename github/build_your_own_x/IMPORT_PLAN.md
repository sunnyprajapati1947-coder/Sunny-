# Nova — build-your-own-x Import Plan

Source:
codecrafters-io/build-your-own-x (step-by-step guides to rebuild technologies)

What Nova adopted:
- A curated offline index of build-your-own-X tutorials (real links from the
  upstream README), so Nova can answer "how do I build X?" offline.

Where it lives:
- core/data/build_guides.json (curated by github/curate_source_data.py)
- core/learning_hub.py (learning_find_build_guide)
- skills/learn-topic/SKILL.md

Rules:
1. Links point to the original free guides; Nova never rehosts content.
2. The index is bounded and refreshed only by an explicit curation run.
