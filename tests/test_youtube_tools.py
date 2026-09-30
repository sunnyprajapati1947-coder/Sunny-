from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.youtube_tools import (
    ALLOWED_PRIVACY,
    channel_status,
    prepare_video,
    upload_video,
    youtube_status,
)


class YouTubeToolsTest(unittest.TestCase):
    def test_status_does_not_require_oauth(self):
        with patch("core.youtube_tools.shutil.which", return_value="/usr/bin/ffmpeg"):
            payload = youtube_status()
        self.assertTrue(payload["success"])
        self.assertFalse(payload["api_key_required_for_upload"])
        self.assertEqual(payload["channel_creation"], "not_supported_by_youtube_data_api")

    def test_prepare_rejects_invalid_privacy(self):
        with self.assertRaises(ValueError):
            prepare_video("test", privacy="invalid")

    def test_prepare_rejects_invalid_aspect(self):
        with self.assertRaises(ValueError):
            prepare_video("test", aspect="4:3")

    def test_upload_rejects_missing_video_before_oauth(self):
        with self.assertRaises(FileNotFoundError):
            upload_video("/definitely/missing/video.mp4", "Test")

    def test_channel_status_uses_authenticated_service(self):
        class Channels:
            def list(self, **kwargs):
                return self
            def execute(self):
                return {"items": [{"id": "abc", "snippet": {"title": "Nova Test"}, "statistics": {}}]}

        class Service:
            def channels(self):
                return Channels()

        with patch("core.youtube_tools._youtube_service", return_value=Service()):
            payload = channel_status()
        self.assertTrue(payload["channel_found"])
        self.assertEqual(payload["channel_id"], "abc")


if __name__ == "__main__":
    unittest.main()
