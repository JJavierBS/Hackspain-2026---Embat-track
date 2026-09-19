import unittest

from cusum_forecast import cusum, forecast, linear_slope, reliability


class CusumForecastTest(unittest.TestCase):
    def test_linear_slope(self):
        self.assertAlmostEqual(linear_slope([0.2, 0.3, 0.4]), 0.1)

    def test_detects_sustained_decline(self):
        result = cusum([0.8, 0.8, 0.8, 0.7, 0.6, 0.5], k=0.01, h=0.05)
        self.assertTrue(result["alarm"])
        self.assertEqual(result["direction"], "DECLINING")

    def test_forecast_is_bounded(self):
        self.assertEqual(forecast([0.2, 0.1, 0.0], 2, 3), [0.0, 0.0])

    def test_forecast_damps_the_trend(self):
        result = forecast([0.2, 0.3], 3, 2, damping=0.8)
        self.assertAlmostEqual(result[0], 0.4)
        self.assertAlmostEqual(result[1], 0.48)
        self.assertAlmostEqual(result[2], 0.544)

    def test_short_history_is_reported_but_not_hidden(self):
        result = reliability(4)
        self.assertFalse(result["reliable"])
        self.assertEqual(result["level"], "LOW")
        self.assertIn("no es fiable", result["message"])

    def test_eight_months_is_reliable(self):
        result = reliability(8)
        self.assertTrue(result["reliable"])
        self.assertEqual(result["level"], "HIGH")


if __name__ == "__main__":
    unittest.main()