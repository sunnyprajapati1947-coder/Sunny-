import unittest
from unittest.mock import patch

from repair.self_heal import self_heal_once


class SelfHealTests(unittest.TestCase):
    def test_healthy_runtime_does_not_restart(self):
        with patch("repair.self_heal.qwen_healthy", return_value=True):
            result = self_heal_once()
        self.assertTrue(result["success"])
        self.assertFalse(result["restarted"])

    def test_unhealthy_runtime_uses_bounded_restart(self):
        with patch("repair.self_heal.qwen_healthy", side_effect=[False, True]),              patch("repair.self_heal.restart_qwen", return_value=True):
            result = self_heal_once()
        self.assertTrue(result["success"])
        self.assertTrue(result["restarted"])


if __name__ == "__main__":
    unittest.main()
