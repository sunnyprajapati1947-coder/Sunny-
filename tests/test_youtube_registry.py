from __future__ import annotations

import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.tool_bridge import build_registry


class YouTubeRegistryTest(unittest.TestCase):
    def test_youtube_tools_are_registered(self):
        registry = build_registry()
        names = set(registry.names())
        self.assertTrue({
            "youtube_status",
            "youtube_channel_status",
            "youtube_prepare_video",
            "youtube_upload_video",
        }.issubset(names))

    def test_upload_is_high_impact(self):
        registry = build_registry()
        self.assertTrue(registry.get("youtube_upload_video").high_impact)

    def test_upload_requires_approval(self):
        registry = build_registry()
        result = registry.execute(
            "youtube_upload_video",
            {"video_path": "/tmp/nope.mp4", "title": "Test"},
        )
        self.assertTrue(result["blocked"])
        self.assertTrue(result["approval_required"])


if __name__ == "__main__":
    unittest.main()
