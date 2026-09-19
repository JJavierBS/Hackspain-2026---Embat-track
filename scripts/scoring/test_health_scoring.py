import unittest

from health_scoring import (
    DEFAULT_WEIGHTS_PATH,
    diagnose,
    interpolate,
    score_indicators,
    select_weights,
    normalize_weight_names,
    validate_weighted_indicators,
)


class HealthScoringTest(unittest.TestCase):
    def setUp(self):
        self.indicators = {
            "indicator_a": {"category": "category_a", "anchors": [[0, 0], [1, 100]]},
            "indicator_b": {"category": "category_b", "anchors": [[0, 0], [1, 100]]},
            "indicator_c": {"category": "category_c", "anchors": [[0, 0], [1, 100]]},
            "indicator_ignored": {"category": "category_ignored", "anchors": [[0, 0], [1, 100]]},
        }
        self.profile = {
            "name": "TEST_PROFILE",
            "weights": {"indicator_a": 2, "indicator_b": 3, "indicator_c": 5},
        }

    def test_interpolation_clamps_and_returns_zero_to_one(self):
        self.assertEqual(interpolate(0, self.indicators["indicator_a"]["anchors"]), 0.0)
        self.assertEqual(interpolate(2, self.indicators["indicator_a"]["anchors"]), 1.0)
        self.assertAlmostEqual(interpolate(0.5, [[0, 0], [1, 100]]), 0.5)

    def test_missing_indicator_is_excluded_and_weights_renormalize(self):
        scores = score_indicators({"indicator_a": 1, "indicator_b": 0.5}, self.indicators)
        result = diagnose(scores, self.indicators, self.profile, alert_threshold=0.5)

        self.assertAlmostEqual(sum(result["effective_weights"].values()), 1.0)
        self.assertAlmostEqual(result["global_index"], 2 / 5 + 0.5 * 3 / 5, places=9)
        self.assertEqual(result["available_indicators"], 2)

    def test_risk_contributions_sum_to_one_minus_index(self):
        scores = score_indicators(
            {"indicator_a": 1, "indicator_b": 0, "indicator_c": 0, "indicator_ignored": 0},
            self.indicators,
        )
        result = diagnose(scores, self.indicators, self.profile, alert_threshold=0.5)

        self.assertAlmostEqual(
            result["risk_contribution_total"], 1 - result["global_index"], places=9
        )
        self.assertEqual(result["risk_contributions"][0]["indicator"], "indicator_c")
        self.assertEqual(result["ignored_indicators"], ["indicator_ignored"])
        self.assertTrue(result["imminent_failure_risk"])

    def test_indicator_weights_are_not_split_equally(self):
        scores = score_indicators(
            {"indicator_a": 1, "indicator_b": 1, "indicator_c": 1}, self.indicators
        )
        result = diagnose(scores, self.indicators, self.profile, alert_threshold=0.5)

        self.assertEqual(result["effective_weights"]["indicator_a"], 0.2)
        self.assertEqual(result["effective_weights"]["indicator_b"], 0.3)
        self.assertEqual(result["effective_weights"]["indicator_c"], 0.5)

    def test_external_weights_support_single_or_arbitrary_named_profiles(self):
        name, weights = select_weights({"weights": {"indicator_a": 4}})
        self.assertIsNone(name)
        self.assertEqual(weights, {"indicator_a": 4})

        name, weights = select_weights(
            {"profiles": {"arbitrary_name": {"weights": {"indicator_b": 7}}}},
            "arbitrary_name",
        )
        self.assertEqual(name, "arbitrary_name")
        self.assertEqual(weights, {"indicator_b": 7})

    def test_default_weights_path_points_to_weights_calc_json(self):
        self.assertTrue(DEFAULT_WEIGHTS_PATH.is_file())
        self.assertEqual(DEFAULT_WEIGHTS_PATH.name, "weights.json")

    def test_weighted_indicators_need_matching_anchor_configuration(self):
        with self.assertRaisesRegex(ValueError, "indicator_missing"):
            validate_weighted_indicators(
                {"indicator_missing": 1}, self.indicators
            )

    def test_external_legacy_names_are_mapped_to_backend_names(self):
        self.assertEqual(
            normalize_weight_names({"ACT_GROWTH": 2, "PAY_LATENESS": 3, "PAY_OVERDUE": 5}),
            {
                "ACT_COLLECTIONS_GROWTH": 2,
                "PAY_SUPPLIER_LATENESS": 3,
                "PAY_OVERDUE_PAYABLES": 5,
            },
        )


if __name__ == "__main__":
    unittest.main()