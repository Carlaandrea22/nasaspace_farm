import unittest
from unittest.mock import patch

from fieldshift import historical, load_crops, rank_crops, simulate_water


class FieldShiftTests(unittest.TestCase):
    def test_full_catalog_loads_valid_non_pilot_species(self):
        crops = load_crops(full=True)
        self.assertGreater(len(crops), 2000)
        self.assertTrue(any(crop["species"] == "Solanum tuberosum" for crop in crops))
        for crop in crops:
            self.assertEqual(sorted(crop["temp_limits"] + crop["temp_opt"]),
                             [crop["temp_limits"][0], *crop["temp_opt"], crop["temp_limits"][1]])

    def test_temperature_categories_distinguish_near_optimum_from_large_deviations(self):
        haba = next(crop for crop in load_crops() if crop["name"] == "Haba")
        for days, expected in (
            ([19] * 30, "recommended"),
            ([17] * 30, "conditional"),
            ([19] * 29 + [4], "conditional"),
            ([19] * 29 + [0], "unsuitable"),
            ([19] * 15 + [0] * 15, "unsuitable"),
            ([12] * 30, "unsuitable"),
        ):
            with self.subTest(expected=expected, sample=days[-1]):
                result = rank_crops([haba], days, None, None, "cualquiera")[0]
                self.assertEqual(result["temperature"]["category"], expected)

    @patch("fieldshift.fetch")
    def test_preferred_crop_must_pass_temperature_check(self, fetch):
        days = {f"202511{day:02}": 19 if day <= 15 else 0 for day in range(1, 31)}
        fetch.return_value = ({"properties": {"parameter": {"T2M": days}},
                               "header": {"fill_value": -999}}, "https://example.test")

        result = historical(-17.45, -66.17, 2025, 2025, 11, None, "consumo")

        self.assertEqual(result["preferred"], [])
        haba = next(crop for crop in result["crops"] if crop["name"] == "Haba")
        self.assertTrue(haba["eligible"])
        self.assertEqual(haba["temperature"]["outside_days"], 15)

    @patch("fieldshift.fetch")
    def test_history_uses_complete_occurrences_of_the_planting_month(self, fetch):
        temperatures = {f"202511{day:02}": 19 for day in range(1, 31)}
        temperatures.update({"20241101": 30, "20251201": 40})
        fetch.return_value = ({"properties": {"parameter": {"T2M": temperatures}},
                               "header": {"fill_value": -999}}, "https://example.test")

        result = historical(-17.45, -66.17, 2024, 2025, 11, None, "forraje")

        self.assertEqual(fetch.call_args.kwargs["start"], "20240101")
        self.assertEqual(fetch.call_args.kwargs["end"], "20251231")
        self.assertEqual(result["temperature_years"], [2025])
        self.assertEqual(result["month_average"], 19)
        self.assertEqual(result["temperature_days"], 30)
        self.assertIsNone(result["annual_rain"])

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
