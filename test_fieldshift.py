import unittest

from fieldshift import load_crops, rank_crops, simulate_water


class FieldShiftTests(unittest.TestCase):
    def test_ecocrop_and_farmer_priority(self):
        crops = load_crops()
        ranked = rank_crops(crops, [19] * 100, 800, 6.0, "forraje")
        self.assertEqual(len(ranked), 4)
        self.assertEqual(ranked[-1]["name"], "Haba")
        self.assertFalse(ranked[-1]["eligible"])
        self.assertEqual(ranked[0]["temperature"]["optimal_days"], 100)

    def test_missing_rain_does_not_rank_as_drought(self):
        ranked = rank_crops(load_crops(), [19] * 100, None, None, "cualquiera")
        self.assertIsNone(ranked[0]["rainfall"]["score"])

    def test_delay_increases_stress_and_rain_can_prevent_it(self):
        days = [{"date": str(i), "rain": 0, "et0": 5} for i in range(7)]
        early = simulate_water(days, 60, 26, 0.5, 1, "0", 25)
        late = simulate_water(days, 60, 26, 0.5, 1, "5", 25)
        self.assertGreater(late["stress_days"], early["stress_days"])
        self.assertEqual(late["first_stress"], "0")
        days[0]["rain"] = 20
        wet = simulate_water(days, 60, 26, 0.5, 1, "5", 25)
        self.assertLess(wet["stress_days"], late["stress_days"])


if __name__ == "__main__":
    unittest.main()
