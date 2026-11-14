from datetime import date, datetime, timedelta, timezone
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

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


if __name__ == "__main__":
    unittest.main()
