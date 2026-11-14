"""Prepare small, versioned regional source bundles for Field Shift."""

import argparse
import csv
from datetime import date, datetime, time, timedelta, timezone
from io import BytesIO
from itertools import product
import json
from math import asin, cos, isfinite, radians, sin, sqrt
from pathlib import Path
import re
from urllib.parse import urlencode
from urllib.request import urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
HISTORICAL = ROOT / "src/data/la-maica-sources.json"
RECENT = ROOT / "src/data/imerg-early.json"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
WCS_URL = "https://maps.isric.org/mapserv"
IMERG_SOURCE = "https://gpm.nasa.gov/data/directory"
SMAP_SOURCE = "https://doi.org/10.5067/T5RUATAQREF8"
LOCAL_TIME = ZoneInfo("America/La_Paz")
POINT = (-66.18272, -17.42442)
SOIL_BOUNDS = (-66.194, -17.435, -66.174, -17.415)
POWER_FIELDS = {
    "tmax": ("T2M_MAX", "C"),
    "tmin": ("T2M_MIN", "C"),
    "rh": ("RH2M", "%"),
    "wind": ("WS2M", "m/s"),
    "solar": ("ALLSKY_SFC_SW_DWN", "MJ/m^2/day"),
    "rain": ("PRECTOTCORR", "mm/day"),
}
SOIL_FIELDS = ("wv0033", "wv1500", "sand", "clay")
DEPTHS = ((0, 5), (5, 15), (15, 30), (30, 60), (60, 100), (100, 200))


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    content = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def fetch(url):
    with urlopen(url, timeout=30) as response:
        return response.read()


def daterange(start, end):
    if end < start:
        raise ValueError("El día final debe ser igual o posterior al día inicial")
    for offset in range((end - start).days + 1):
        yield start + timedelta(days=offset)


def valid_number(raw, minimum, maximum=float("inf")):
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if isfinite(value) and minimum <= value <= maximum else None


def prepare_power(start, end, raw_path):
    params = {
        "parameters": ",".join(name for name, _ in POWER_FIELDS.values()),
        "community": "AG", "longitude": POINT[0], "latitude": POINT[1],
        "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"),
        "format": "JSON", "time-standard": "UTC",
    }
    url = POWER_URL + "?" + urlencode(params)
    raw = read_json(raw_path) if raw_path else json.loads(fetch(url))
    if raw["header"]["time_standard"] != "UTC":
        raise ValueError("NASA POWER debe estar etiquetado UTC")
    if any(raw["parameters"][name]["units"] != unit for name, unit in POWER_FIELDS.values()):
        raise ValueError("Las unidades de NASA POWER cambiaron")
    location = raw["geometry"]["coordinates"]
    # POWER rounds response longitude and latitude to three decimal places.
    if len(location) != 3 or any(abs(a - b) > 0.00051 for a, b in zip(location, POINT)):
        raise ValueError("El punto de NASA POWER debe coincidir con la referencia de La Maica")
    parameters = raw["properties"]["parameter"]
    fill_value = raw["header"]["fill_value"]
    dates = list(daterange(start, end))
    if raw["header"]["start"] != params["start"] or raw["header"]["end"] != params["end"]:
        raise ValueError("El archivo de NASA POWER debe cubrir el periodo solicitado")

    def value(name, day):
        raw_value = parameters[name].get(day.strftime("%Y%m%d"))
        minimum = -90 if name in ("T2M_MAX", "T2M_MIN") else 0
        maximum = 100 if name == "RH2M" else float("inf")
        return None if raw_value == fill_value else valid_number(raw_value, minimum, maximum)

    return {
        day.isoformat(): {key: value(name, day) for key, (name, _) in POWER_FIELDS.items()}
        for day in dates
    }, url, location[2]


def soil_profile(tiff_dir):
    """Extract the same nearest jointly valid WCS cell for all selected bands."""
    from rasterio.io import MemoryFile

    west, south, east, north = SOIL_BOUNDS
    crs = "http://www.opengis.net/def/crs/EPSG/0/4326"
    arrays = {}
    grid = None
    for name, (top, bottom) in product(SOIL_FIELDS, DEPTHS):
        basename = f"{name}_{top}-{bottom}cm"
        params = [
            ("SERVICE", "WCS"), ("VERSION", "2.0.1"), ("REQUEST", "GetCoverage"),
            ("COVERAGEID", basename + "_mean"), ("FORMAT", "GEOTIFF_INT16"),
            ("SUBSET", f"Lat({south},{north})"), ("SUBSET", f"Long({west},{east})"),
            ("SUBSETTINGCRS", crs), ("OUTPUTCRS", crs),
        ]
        contents = (tiff_dir / (basename + ".tif")).read_bytes() if tiff_dir else fetch(
            f"{WCS_URL}/{name}?" + urlencode(params),
        )
        with MemoryFile(BytesIO(contents)) as memory, memory.open() as raster:
            shape = (raster.height, raster.width, raster.transform, raster.crs.to_epsg())
            if not grid:
                grid = shape
            if shape != grid or shape[3] != 4326:
                raise ValueError("Las cuadrículas WCS deben coincidir y usar EPSG:4326")
            arrays[(name, top, bottom)] = raster.read(1, masked=True).filled(-9999)

    height, width, transform, _ = grid
    candidates = []
    for row, col in product(range(height), range(width)):
        longitude, latitude = transform * (col + 0.5, row + 0.5)
        if not (west <= longitude <= east and south <= latitude <= north):
            continue
        profile = []
        for top, bottom in DEPTHS:
            fc, wp, sand, clay = (
                int(arrays[(name, top, bottom)][row, col]) for name in SOIL_FIELDS
            )
            if not (0 < wp < fc <= 1000 and 0 < sand and 0 < clay and sand + clay <= 1000):
                break
            profile.append(dict(top=top, bottom=bottom, fc=fc / 1000, wp=wp / 1000,
                                sand=sand / 10, clay=clay / 10))
        if len(profile) == len(DEPTHS):
            latitude_distance = radians(latitude - POINT[1])
            longitude_distance = radians(longitude - POINT[0])
            a = sin(latitude_distance / 2) ** 2 + cos(radians(latitude)) * cos(radians(POINT[1])) * sin(longitude_distance / 2) ** 2
            distance = 12_742_000 * asin(sqrt(a))
            candidates.append((distance, row, col, latitude, longitude, profile))

    if not candidates:
        raise ValueError("No existe una celda común con datos válidos en el recorte WCS")
    distance, _, _, latitude, longitude, profile = min(candidates)
    return profile, dict(latitude=round(latitude, 6), longitude=round(longitude, 6),
                         distanceM=round(distance))


def import_imerg(path, start, end, zone, units):
    """Accept half-hourly rates or accumulations with an explicit UTC start."""
    intervals = {}
    with path.open(encoding="utf-8-sig", newline="") as csvfile:
        for row in csv.DictReader(csvfile):
            stamp = datetime.fromisoformat(row["timestamp_utc"])
            if stamp.utcoffset() != timedelta(0) or stamp.minute not in (0, 30) or stamp.second or stamp.microsecond:
                raise ValueError(f"Fecha IMERG fuera de la rejilla de 30 min UTC: {stamp}")
            if stamp in intervals:
                raise ValueError(f"Intervalo IMERG repetido: {stamp}")
            value = valid_number(row["precipitation"], 0)
            intervals[stamp] = value * 0.5 if units == "mm/h" and value is not None else value

    result = {}
    for day in daterange(start, end):
        midnight = datetime.combine(day, time(), zone).astimezone(timezone.utc)
        known = [intervals.get(midnight + timedelta(minutes=30 * i)) for i in range(48)]
        result[day.isoformat()] = None if None in known else round(sum(known), 4)
    return result


def import_imerg_daily(path, start, end):
    """Use a UTC daily product whose values are accumulated over exactly 24 hours."""
    days = {}
    with path.open(encoding="utf-8-sig", newline="") as csvfile:
        for row in csv.DictReader(csvfile):
            day = date.fromisoformat(row["date"])
            if day in days:
                raise ValueError(f"Día IMERG repetido: {day}")
            days[day] = valid_number(row["precipitation"], 0)
    return {day.isoformat(): days.get(day) for day in daterange(start, end)}


def import_smap(path):
    observations = {}
    with path.open(encoding="utf-8-sig", newline="") as csvfile:
        for row in csv.DictReader(csvfile):
            day = date.fromisoformat(row["date"]).isoformat()
            if day in observations:
                raise ValueError(f"Día SMAP repetido: {day}")
            surface = valid_number(row["surface"], 0, 1)
            root = valid_number(row["root"], 0, 1)
            quality = row["quality"].strip().lower()
            if quality not in ("accepted", "suspect", "missing"):
                raise ValueError(f"Calidad SMAP inválida: {quality}")
            if quality == "accepted" and (surface is None or root is None):
                quality = "missing"
            observations[day] = dict(date=day, surface=surface, root=root, quality=quality)
    return [observations[day] for day in sorted(observations)]


def normalize_appeears(source, destination):
    """Normalize one AppEEARS point sample. Quality stays suspect pending field review."""
    suffixes = ("_Geophysical_Data_sm_surface", "_Geophysical_Data_sm_rootzone")
    with source.open(encoding="utf-8-sig", newline="") as sample:
        reader = csv.DictReader(sample)
        columns = []
        for suffix in suffixes:
            names = [name for name in (reader.fieldnames or []) if name.endswith(suffix)]
            if len(names) != 1:
                raise ValueError(f"Se esperaba una columna AppEEARS {suffix}")
            columns.append(names[0])
        rows = []
        for row in reader:
            latitude = valid_number(row["Latitude"], -90, 90)
            longitude = valid_number(row["Longitude"], -180, 180)
            if latitude is None or longitude is None or abs(latitude - POINT[1]) > 0.001 or abs(longitude - POINT[0]) > 0.001:
                raise ValueError("El punto del archivo AppEEARS debe corresponder a la referencia de La Maica")
            day = date.fromisoformat(row["Date"][:10]).isoformat()
            surface, root = (valid_number(row[key], 0, 1) for key in columns)
            quality = "missing" if surface is None or root is None else "suspect"
            rows.append((day, surface, root, quality))
    with destination.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(("date", "surface", "root", "quality"))
        writer.writerows(rows)


def normalize_imerg_file(directory, destination, run, version, daily):
    """Sample original NASA files or spatial subsets with retained metadata."""
    import xarray as xr

    stamps = {}
    for path in sorted(directory.iterdir()):
        if path.suffix.lower() not in (".nc4", ".nc", ".hdf5"):
            continue
        match = re.search(r"\.(\d{8})-S(\d{6})-", path.name)
        if not match:
            raise ValueError(f"No se reconoce la fecha en el nombre de {path.name}")
        prefix = "3B-DAY." if daily else ("3B-HHR-E." if run == "early" else "3B-HHR.")
        if not path.name.startswith(prefix) or f".V{version}." not in path.name:
            raise ValueError(f"La resolución o corrida de {path.name} no corresponde")
        stamp = datetime.strptime("".join(match.groups()), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        if stamp in stamps:
            raise ValueError(f"Granulo IMERG repetido: {stamp.isoformat()}")
        with xr.open_dataset(path, group="Grid" if not daily else None) as dataset:
            rain = dataset["precipitation"]
            units = rain.attrs["units"].lower().replace(" ", "")
            if units not in (("mm/day", "mmd-1") if daily else ("mm/hr", "mm/h", "mmh-1")):
                raise ValueError(f"Unidades IMERG incompatibles en {path.name}: {units}")
            pixel = rain.sel(lat=POINT[1], lon=POINT[0], method="nearest")
            if abs(pixel["lat"].item() - POINT[1]) > 0.075 or abs(pixel["lon"].item() - POINT[0]) > 0.075:
                raise ValueError(f"El granulo {path.name} no contiene el punto de La Maica")
            stamps[stamp] = valid_number(pixel.item(), 0)
    if not stamps:
        raise ValueError("No se encontraron granulos IMERG en el directorio")

    with destination.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(("date" if daily else "timestamp_utc", "precipitation"))
        for stamp, precipitation in sorted(stamps.items()):
            writer.writerow((stamp.date().isoformat() if daily else stamp.isoformat(), precipitation))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    power = commands.add_parser("power")
    power.add_argument("--raw", type=Path)
    soil = commands.add_parser("soil")
    soil.add_argument("--tiff-dir", type=Path)
    for name in ("imerg-final", "imerg-early"):
        command = commands.add_parser(name)
        command.add_argument("csv", type=Path)
        command.add_argument(
            "--units", required=True,
            choices=("mm/h", "mm", "mm/day") if name == "imerg-final" else ("mm/h", "mm"),
        )
        command.add_argument("--version", required=True, choices=("07B", "07C"))
    smap = commands.add_parser("smap")
    smap.add_argument("csv", type=Path)
    appeears = commands.add_parser("normalize-appeears")
    appeears.add_argument("source", type=Path)
    appeears.add_argument("destination", type=Path)
    imerg_files = commands.add_parser("normalize-imerg")
    imerg_files.add_argument("directory", type=Path)
    imerg_files.add_argument("destination", type=Path)
    imerg_files.add_argument("--daily", action="store_true")
    imerg_files.add_argument("--run", required=True, choices=("early", "final"))
    imerg_files.add_argument("--version", required=True, choices=("07B", "07C"))
    for name in ("power", "imerg-final", "imerg-early"):
        command = commands.choices[name]
        command.add_argument("--start", required=True, type=date.fromisoformat)
        command.add_argument("--end", required=True, type=date.fromisoformat)
    args = parser.parse_args()
    if args.command == "normalize-appeears":
        normalize_appeears(args.source, args.destination)
        return
    if args.command == "normalize-imerg":
        if args.daily and args.run != "final":
            parser.error("IMERG Early requiere granulos de 30 min para reconstruir el día boliviano")
        normalize_imerg_file(args.directory, args.destination, args.run, args.version, args.daily)
        return
    if args.command == "imerg-early":
        data = read_json(RECENT)
        data["days"] = import_imerg(args.csv, args.start, args.end, LOCAL_TIME, args.units)
        data["version"] = args.version
        write_json(RECENT, data)
        return
    data = read_json(HISTORICAL)
    if args.command == "power":
        data["power"], data["meta"]["powerSource"], data["meta"]["powerElevationM"] = prepare_power(
            args.start, args.end, args.raw,
        )
        data["meta"]["period"] = dict(start=args.start.isoformat(), end=args.end.isoformat(), timeStandard="UTC")
    elif args.command == "soil":
        data["soil"], data["meta"]["soilPoint"] = soil_profile(args.tiff_dir)
    elif args.command == "imerg-final":
        period = data["meta"]["period"]
        if args.start.isoformat() != period["start"] or args.end.isoformat() != period["end"]:
            parser.error("IMERG Final debe cubrir el mismo periodo que NASA POWER")
        if args.units == "mm/day":
            data["imerg"] = import_imerg_daily(args.csv, args.start, args.end)
        else:
            data["imerg"] = import_imerg(args.csv, args.start, args.end, timezone.utc, args.units)
        data["meta"]["imergVersion"] = args.version
    elif args.command == "smap":
        data["smap"] = import_smap(args.csv)
    data["meta"]["fetchedAt"] = datetime.now(LOCAL_TIME).date().isoformat()
    write_json(HISTORICAL, data)


if __name__ == "__main__":
    main()
