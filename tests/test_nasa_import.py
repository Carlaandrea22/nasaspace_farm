from datetime import date, datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "import_nasa", Path(__file__).resolve().parent.parent / "scripts/import-nasa.py",
)
nasa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nasa)


class NasaImportTest(unittest.TestCase):
    def test_hourly_rate_conversion_and_missing_intervals(self):
        start = datetime(2025, 3, 1, tzinfo=timezone.utc)
        timestamps = [start + timedelta(minutes=30 * i) for i in range(48)]
        with TemporaryDirectory() as temp:
            path = Path(temp) / "rain.csv"
            prefix = "timestamp_utc,precipitation\n"
            rows = [f"{timestamp.isoformat()},2" for timestamp in timestamps]
            path.write_text(prefix + "\n".join(rows), encoding="utf-8")
            result = nasa.import_imerg(path, start.date(), start.date(), timezone.utc, "mm/h")
            self.assertEqual(result, {"2025-03-01": 48.0})
            path.write_text(prefix + "\n".join(rows[:-1]), encoding="utf-8")
            result = nasa.import_imerg(path, start.date(), start.date(), timezone.utc, "mm/h")
            self.assertEqual(result, {"2025-03-01": None})

    def test_early_local_cut_and_valid_zero(self):
        start = datetime(2026, 11, 13, 4, tzinfo=timezone.utc)
        rows = [f"{(start + timedelta(minutes=30 * i)).isoformat()},0" for i in range(48)]
        with TemporaryDirectory() as temp:
            path = Path(temp) / "early.csv"
            path.write_text("timestamp_utc,precipitation\n" + "\n".join(rows), encoding="utf-8")
            result = nasa.import_imerg(path, start.date(), start.date(), nasa.LOCAL_TIME, "mm/h")
            self.assertEqual(result, {"2026-11-13": 0.0})

    def test_daily_zero_differs_from_missing(self):
        with TemporaryDirectory() as temp:
            path = Path(temp) / "final.csv"
            path.write_text("date,precipitation\n2025-03-01,0\n2025-03-02,-9999.9\n", encoding="utf-8")
            days = nasa.import_imerg_daily(path, date(2025, 3, 1), date(2025, 3, 3))
            self.assertEqual(days, {"2025-03-01": 0.0, "2025-03-02": None, "2025-03-03": None})

    def test_power_imerg_preserves_zero_and_missing_values(self):
        payload = {
            "header": {"sources": ["IMERG"], "time_standard": "UTC", "start": "20241101",
                       "end": "20241103", "fill_value": -999.0},
            "geometry": {"coordinates": [-66.183, -17.424, 3126.04]},
            "parameters": {"IMERG_PRECTOT": {"units": "mm/day"}},
            "properties": {"parameter": {"IMERG_PRECTOT": {"20241101": 1.48,
                                                             "20241102": 0, "20241103": -999}}},
        }
        with patch.object(nasa, "fetch", return_value=json.dumps(payload).encode()):
            days, source = nasa.prepare_imerg_final_power(date(2024, 11, 1), date(2024, 11, 3))
        self.assertEqual(days, {"2024-11-01": 1.48, "2024-11-02": 0.0, "2024-11-03": None})
        self.assertIn("parameters=IMERG_PRECTOT", source)

    def test_power_imerg_rejects_dates_that_could_include_late_run(self):
        today = datetime.now(timezone.utc).date()
        with self.assertRaisesRegex(ValueError, "IMERG Late"):
            nasa.prepare_imerg_final_power(today - timedelta(days=5), today - timedelta(days=1))

    def test_appeears_holds_unreviewed_values_as_suspect(self):
        with TemporaryDirectory() as temp:
            source = Path(temp) / "appeears.csv"
            target = Path(temp) / "smap.csv"
            source.write_text(
                "ID,Latitude,Longitude,Date,SMAP_Geophysical_Data_sm_surface,SMAP_Geophysical_Data_sm_rootzone\n"
                "la-maica,-17.42442,-66.18272,2025-03-01,0.24,0.34\n"
                "la-maica,-17.42442,-66.18272,2025-03-02,-9999,0.34\n",
                encoding="utf-8",
            )
            nasa.normalize_appeears(source, target)
            result = nasa.import_smap(target)
            self.assertEqual(result[0]["quality"], "suspect")
            self.assertEqual(result[1]["quality"], "missing")
            self.assertIsNone(result[1]["surface"])

    def test_appeears_aggregates_eight_intervals_without_filling_gaps(self):
        with TemporaryDirectory() as temp:
            source = Path(temp) / "appeears.csv"
            target = Path(temp) / "smap.csv"
            header = "Latitude,Longitude,Date,SPL4SMGP_008_Geophysical_Data_sm_rootzone,SPL4SMGP_008_Geophysical_Data_sm_surface\n"
            rows = [
                f"-17.42442,-66.18272,2024-11-11 {hour:02}:30:00 UTC,0.3,{hour / 100}\n"
                for hour in range(1, 24, 3)
            ]
            source.write_text(header + "".join(rows), encoding="utf-8")
            nasa.normalize_appeears(source, target)
            self.assertEqual(nasa.import_smap(target), [
                {"date": "2024-11-11", "surface": 0.115, "root": 0.3, "quality": "suspect"},
            ])
            source.write_text(header + "".join(rows[:-1]), encoding="utf-8")
            nasa.normalize_appeears(source, target)
            self.assertEqual(nasa.import_smap(target), [
                {"date": "2024-11-11", "surface": None, "root": None, "quality": "missing"},
            ])


if __name__ == "__main__":
    unittest.main()
