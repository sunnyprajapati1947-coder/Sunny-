from __future__ import annotations

import sys
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import trading_desk as td


def synthetic_rows(n: int = 120, drift: float = 0.3, seed: int = 7) -> list[dict]:
    import random
    rng = random.Random(seed)
    price = 100.0
    rows = []
    for i in range(n):
        price += drift + rng.uniform(-2.5, 2.5)
        rows.append({"date": f"2026-01-{(i % 28) + 1:02d}", "close": round(price, 4)})
    return rows


class TradingDeskTest(unittest.TestCase):
    def test_symbol_cleaning(self):
        self.assertEqual(td._clean_symbol(" aapl "), "AAPL")
        self.assertEqual(td._clean_symbol("reliance.ns"), "RELIANCE.NS")
        self.assertEqual(td._clean_symbol("../../etc/passwd"), "")
        self.assertEqual(td._clean_symbol("x; rm -rf /"), "")

    def test_compute_stats_uptrend(self):
        stats = td.compute_stats(synthetic_rows(drift=0.5))
        self.assertEqual(stats["rows"], 120)
        self.assertEqual(stats["trend"], "uptrend")
        self.assertGreater(stats["sma_20"], stats["sma_50"])
        self.assertGreater(stats["rsi_14"], 0)
        self.assertLessEqual(stats["rsi_14"], 100)
        self.assertLessEqual(stats["max_drawdown_pct"], 0)

    def test_compute_stats_downtrend(self):
        stats = td.compute_stats(synthetic_rows(drift=-0.5, seed=3))
        self.assertEqual(stats["trend"], "downtrend")
        self.assertLess(stats["sma_20"], stats["sma_50"])

    def test_market_analyze_with_mocked_history(self):
        # Hermetic: patch the local lane too - on a real phone the fast lane
        # is often RUNNING, and the test must never hit it.
        with patch.object(td, "_fetch_history", return_value=synthetic_rows()), \
             patch("core.fast_router.ask", return_value={"success": False, "lane": "fast", "answer": None}):
            result = td.market_analyze("AAPL")
        self.assertTrue(result["success"])
        self.assertEqual(result["symbol"], "AAPL")
        self.assertIn("analyst", result["roles"])
        self.assertIn("bull_researcher", result["roles"])
        self.assertIn("bear_researcher", result["roles"])
        self.assertIn("trader", result["roles"])
        self.assertIn("risk_manager", result["roles"])
        self.assertIn("Not financial advice", result["disclaimer"])
        # Lanes are mocked offline in tests, so the deterministic read is used.
        self.assertEqual(result["lane"], "offline-deterministic")

    def test_market_analyze_rejects_bad_symbol(self):
        result = td.market_analyze("rm -rf /")
        self.assertFalse(result["success"])

    def test_market_analyze_rejects_fetch_failure(self):
        with patch.object(td, "_fetch_history", side_effect=ValueError("No data")):
            result = td.market_analyze("XXXXXX")
        self.assertFalse(result["success"])
        self.assertIn("Could not load", result["error"])

    def test_disabled(self):
        with patch.dict("os.environ", {"NOVA_TRADING_DESK_ENABLED": "false"}):
            self.assertFalse(td.market_analyze("AAPL")["success"])


if __name__ == "__main__":
    unittest.main()
