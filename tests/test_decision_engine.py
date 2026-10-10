from __future__ import annotations

import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.decision_engine import decide_choice, decide_score, decide_yes_no, predict


class DecisionEngineTest(unittest.TestCase):
    STATE = (
        "Hi, we were billed twice for March. Please refund the duplicate "
        "today or we will cancel our plan."
    )

    def test_predict_shape_mirrors_laya(self):
        result = predict(self.STATE, {
            "department": {"type": "choice", "criteria": {
                "billing": "invoices, payments, refunds",
                "technical": "bugs, outages, system errors",
                "other": "everything else"}},
            "urgency": {"type": "score", "criteria": ["not urgent", "soon", "blocking"]},
            "churn_risk": {"type": "noul", "instructions": "Does the user threaten to cancel or leave?"},
        })
        self.assertTrue(result["success"])
        self.assertIn("answers", result)
        self.assertIn("routing", result)
        self.assertEqual(result["routing"]["model"], "nova-system1-lexical")
        self.assertIn("choice", result["answers"]["department"])
        self.assertIn("score", result["answers"]["urgency"])
        self.assertIn("noul", result["answers"]["churn_risk"])

    def test_choice_routes_billing_via_stemming(self):
        result = predict(self.STATE, {
            "department": {"type": "choice", "criteria": {
                "billing": "invoices, payments, refunds",
                "technical": "bugs, outages, system errors"}},
        })
        self.assertEqual(result["answers"]["department"]["choice"], "billing")

    def test_choice_routes_technical(self):
        result = predict("The server crashed and gives system errors", {
            "department": {"type": "choice", "criteria": {
                "billing": "invoices, payments, refunds",
                "technical": "bugs, outages, system errors"}},
        })
        self.assertEqual(result["answers"]["department"]["choice"], "technical")

    def test_score_is_bounded(self):
        for state in ("", "urgent blocking now", "whenever"):
            result = predict(state, {"urgency": {"type": "score",
                                                 "criteria": ["not urgent", "blocking"]}})
            score = result["answers"]["urgency"]["score"]
            self.assertGreaterEqual(score, 0.0)
            self.assertLessEqual(score, 1.0)

    def test_noul_detects_hinglish_no(self):
        result = decide_yes_no("Boss kya main abhi upload karu? nahi abhi ruko",
                               "Should it proceed?")
        self.assertEqual(result["verdict"], "no")
        self.assertLess(result["probability_yes"], 0.5)

    def test_noul_detects_yes(self):
        result = decide_yes_no("Yes please go ahead and confirm the upload",
                               "Should it proceed?")
        self.assertEqual(result["verdict"], "yes")
        self.assertGreater(result["probability_yes"], 0.5)

    def test_tools(self):
        choice = decide_choice("payment failed twice, need refund", {
            "billing": "invoice payment refund", "technical": "bug outage crash"})
        self.assertTrue(choice["success"])
        self.assertEqual(choice["choice"], "billing")

        score = decide_score("the outage is blocking all work", "not urgent", "blocking")
        self.assertTrue(score["success"])
        self.assertGreater(score["score"], 0.5)

        empty = decide_choice("", {})
        self.assertFalse(empty["success"])


if __name__ == "__main__":
    unittest.main()
