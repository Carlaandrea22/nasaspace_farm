"""Local Field Shift prototype. Start with python -B fieldshift.py."""

import argparse
import calendar
import csv
import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from statistics import mean
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
POWER = "https://power.larc.nasa.gov/api/temporal/daily/point"
FORECAST = "https://api.open-meteo.com/v1/forecast"
IMERG = "https://gis.earthdata.nasa.gov/portal/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer"
VARIABLES = ("T2M", "T2M_MIN", "T2M_MAX", "RH2M", "PRECTOTCORR", "GWETROOT",
             "WS2M", "ALLSKY_SFC_SW_DWN")
HISTORY_YEARS = 10
BOLIVIA_TIME = timezone(timedelta(hours=-4))
# FAO-56 table 12. Use the maize grain profile as a provisional approximation
# for forage maize. Stop the schedule when the producer plans to cut.
PROFILES = {
    "2175": ("Maíz forrajero", "forraje", (0.30, 1.20, 0.60), 0.55),
    "481": ("Avena forrajera", "forraje", (0.30, 1.15, 0.25), 0.55),
    "1232": ("Cebada forrajera", "forraje", (0.30, 1.15, 0.25), 0.55),
    "2146": ("Haba", "consumo", (0.50, 1.15, 1.10), 0.45),
}


def crop_range(row, lower, upper):
    try:
        low, high = float(row[lower]), float(row[upper])
    except ValueError:
        return None
    if math.isfinite(low) and math.isfinite(high) and low <= high:
        return [low, high]
    return None


def load_crops(full=False):
    with (ROOT / "DatosPlantas" / "EcoCrop_DB.csv").open(encoding="cp1252", newline="") as file:
        rows = {row["EcoPortCode"]: row for row in csv.DictReader(file)}
    crops = []
    for code in rows if full else PROFILES:
        row = rows[code]
        species = row["ScientificName"]
        optimum = crop_range(row, "TOPMN", "TOPMX")
        limits = crop_range(row, "TMIN", "TMAX")
        if not optimum or not limits or not limits[0] <= optimum[0] <= optimum[1] <= limits[1]:
            continue
        name, use, kc, depletion_fraction = PROFILES.get(code, (species, None, None, None))
        crops.append({
            "id": code, "name": name, "species": species, "use": use,
            "source": f"https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id={code}",
            "temp_opt": optimum, "temp_limits": limits,
            "rain_opt": crop_range(row, "ROPMN", "ROPMX"),
            "ph_opt": crop_range(row, "PHOPMN", "PHOPMX"),
            "kc": kc, "p": depletion_fraction,
        })
    return crops


def crop_order(crop):
    temperature = crop["temperature"]
    categories = ("recommended", "conditional", "unsuitable")
    return (not crop["eligible"], categories.index(temperature["category"]),
            temperature["outside_days"], -temperature["optimal_days"],
            crop["ph_match"] is False)


def assess_temperature(temperatures, optimum, limits):
    low, high = optimum
    minimum, maximum = limits
    total = len(temperatures)
    cold = sum(temp < minimum for temp in temperatures)
    hot = sum(temp > maximum for temp in temperatures)
    outside = cold + hot
    optimal = sum(low <= temp <= high for temp in temperatures)
    average_gap = mean(max(low - temp, temp - high, 0) for temp in temperatures)
    largest_excess = max(max(minimum - temp, temp - maximum, 0) for temp in temperatures)
    # Screening rules for the demo. The reference ranges come from EcoCrop.
    if outside == 0 and optimal > total / 2:
        category = "recommended"
    elif outside <= total * 0.10 and largest_excess <= 2 and average_gap <= 2:
        category = "conditional"
    else:
        category = "unsuitable"
    return {"category": category, "optimal_days": optimal, "outside_days": outside,
            "cold_days": cold, "hot_days": hot, "total_days": total,
            "below_optimum_days": sum(temp < low for temp in temperatures),
            "above_optimum_days": sum(temp > high for temp in temperatures),
            "average_gap": round(average_gap, 2), "largest_excess": round(largest_excess, 2)}


def rank_crops(crops, temperatures, annual_rain, ph, priority):
    results = []
    for crop in crops:
        rain = crop["rain_opt"]
        soil = crop["ph_opt"]
        rain_ok = rain[0] <= annual_rain <= rain[1] if rain and annual_rain is not None else None
        ph_ok = soil[0] <= ph <= soil[1] if soil and ph is not None else None
        results.append({
            **crop,
            "eligible": priority in ("cualquiera", crop["use"]),
            "temperature": assess_temperature(temperatures, crop["temp_opt"], crop["temp_limits"]),
            "rainfall": {"score": rain_ok},
            "ph_match": ph_ok,
        })
    # Annual rainfall is context for an irrigated plot. Order by temperature
    # exposure first and use measured pH to resolve comparable options.
    return sorted(results, key=crop_order)


def simulate_water(days, capacity, initial_deficit, fraction, kc, turn, irrigation):
    deficit = initial_deficit
    timeline = []
    for day in days:
        # Daily bucket: potential crop demand, net rain/irrigation, fixed roots.
        # The deficit is capped at the wilting point and at field capacity.
        applied = irrigation if day["date"] == turn else 0
        demand = day["et0"] * kc
        threshold = capacity * min(0.8, max(0.1, fraction + 0.04 * (5 - demand)))
        deficit = min(capacity, max(0, deficit + demand - day["rain"] - applied))
        timeline.append({**day, "demand": round(demand, 2), "irrigation": applied,
                         "deficit": round(deficit, 2), "threshold": round(threshold, 2),
                         "stress": deficit > threshold})
    stressed = [day["date"] for day in timeline if day["stress"]]
    return {"stress_days": len(stressed), "first_stress": next(iter(stressed), None),
            "days": timeline}


def fetch(url, **params):
    query = f"{url}?{urlencode(params)}"
    with urlopen(query, timeout=12) as response:
        return json.load(response), query


def historical(lat, lon, first_year, last_year, month, ph, priority, full=False):
    data, query = fetch(POWER, parameters=",".join(VARIABLES), community="AG",
                        latitude=lat, longitude=lon, start=f"{first_year}0101",
                        end=f"{last_year}1231", format="JSON", **{"time-standard": "LST"})
    series = data["properties"]["parameter"]
    missing = data["header"]["fill_value"]
    days = []
    temperatures = []
    temperature_years = []
    annual_totals = []
    for year in range(first_year, last_year + 1):
        year_rain = []
        month_temps = []
        year_length = 365 + calendar.isleap(year)
        for offset in range(year_length):
            day = date(year, 1, 1) + timedelta(days=offset)
            key = day.strftime("%Y%m%d")
            rain = series.get("PRECTOTCORR", {}).get(key, missing)
            if rain is not None and rain != missing:
                year_rain.append(rain)
            if day.month != month:
                continue
            values = {variable: series.get(variable, {}).get(key, missing) for variable in VARIABLES}
            values = {variable: None if value == missing else value for variable, value in values.items()}
            days.append({"date": day.isoformat(), **values})
            if values["T2M"] is not None:
                month_temps.append(values["T2M"])
        if len(month_temps) == calendar.monthrange(year, month)[1]:
            temperature_years.append(year)
            temperatures.extend(month_temps)
        if len(year_rain) == year_length:
            annual_totals.append(sum(year_rain))

    annual_rain = round(mean(annual_totals), 2) if annual_totals else None
    crops = rank_crops(load_crops(full), temperatures, annual_rain, ph, priority) if temperatures else []
    preferred = []
    if crops and crops[0]["eligible"] and crops[0]["temperature"]["category"] == "recommended":
        preferred = [crop["id"] for crop in crops if crop_order(crop) == crop_order(crops[0])]
    return {"days": days, "url": query, "annual_rain": annual_rain,
            "month_average": round(mean(temperatures), 2) if temperatures else None,
            "temperature_days": len(temperatures), "temperature_years": temperature_years,
            "rain_years": len(annual_totals), "first_year": first_year, "last_year": last_year,
            "crops": crops, "preferred": preferred, "full_catalog": full}


def forecast(lat, lon):
    # La Maica runs in local civil time.
    fields = ("precipitation_sum", "et0_fao_evapotranspiration", "temperature_2m_max")
    data, query = fetch(FORECAST, latitude=lat, longitude=lon, daily=",".join(fields),
                        timezone="America/La_Paz", forecast_days=14)
    daily = data["daily"]
    days = [{"date": day, "rain": rain, "et0": et0, "max_temp": temp}
            for day, rain, et0, temp in zip(daily["time"], *(daily[key] for key in fields), strict=True)]
    if not days:
        raise ValueError("El proveedor devolvió un pronóstico vacío.")
    return {"days": days, "url": query}


def imerg_sample(lat, lon):
    metadata, _ = fetch(IMERG, f="json")
    latest = datetime.fromtimestamp(metadata["timeInfo"]["timeExtent"][1] / 1000, tz=timezone.utc)
    utc = latest.replace(hour=0, minute=0, second=0, microsecond=0)
    stamp = int(utc.timestamp() * 1000)
    rule = {"where": f"StdTime = date '{utc:%Y-%m-%d %H:%M:%S}'",
            "mosaicMethod": "esriMosaicAttribute", "sortField": "StdTime",
            "sortValue": utc.isoformat(), "ascending": False}
    payload, query = fetch(
        f"{IMERG}/getSamples", f="json", geometry=f"{lon},{lat}",
        geometryType="esriGeometryPoint", returnFirstValueOnly="true",
        outFields="StdTime", mosaicRule=json.dumps(rule),
        renderingRule='{"rasterFunction":"None"}',
    )
    sample = next(iter(payload.get("samples", [])), None)
    if not sample or sample["attributes"]["stdtime"] != stamp:
        raise ValueError("IMERG no publicó una muestra identificable para el punto.")
    rate = float(sample["value"])
    if not math.isfinite(rate) or rate < 0:
        raise ValueError("El punto no tiene un valor válido en IMERG.")
    return {"rate": rate, "time_utc": utc.isoformat(), "resolution": sample["resolution"],
            "url": query}


def available(call, *args):
    try:
        return call(*args)
    except (OSError, ValueError, KeyError, TypeError) as error:
        return {"error": str(error)}


def number(params, name, low, high, default=None):
    value = params.get(name, [""])[0]
    if value == "" and default is not None:
        return default
    try:
        value = float(value)
    except ValueError:
        raise ValueError(f"Introduce un valor numérico para {name}.") from None
    if not low <= value <= high:
        raise ValueError(f"{name} debe estar entre {low} y {high}.")
    return value


def analyze(params):
    lat = number(params, "lat", -60, 60)
    lon = number(params, "lon", -180, 180)
    today = datetime.now(BOLIVIA_TIME).date()
    try:
        planting_date = date.fromisoformat(params.get("planting", [today.isoformat()])[0])
    except ValueError:
        raise ValueError("Introduce una fecha de siembra válida.") from None
    last_year = today.year - 1
    ph = number(params, "ph", 0, 14) if params.get("ph", [""])[0] else None
    priority = params.get("priority", ["cualquiera"])[0]
    if priority not in ("forraje", "consumo", "cualquiera"):
        raise ValueError("Prioridad desconocida.")
    scope = params.get("scope", ["pilot"])[0]
    if scope not in ("pilot", "full"):
        raise ValueError("Catálogo desconocido.")
    full = scope == "full"
    with ThreadPoolExecutor(3) as pool:
        history = pool.submit(available, historical, lat, lon,
                              last_year - HISTORY_YEARS + 1, last_year, planting_date.month, ph,
                              "cualquiera" if full else priority, full)
        upcoming = pool.submit(available, forecast, lat, lon)
        imerg = pool.submit(available, imerg_sample, lat, lon)
        return {"historical": history.result(), "forecast": upcoming.result(),
                "imerg": imerg.result(), "crops": load_crops()}


def irrigation(body):
    crop = next((c for c in load_crops() if c["id"] == body.get("crop")), None)
    if not crop:
        raise ValueError("Selecciona un cultivo del catálogo.")
    stage = body.get("stage")
    if stage not in (0, 1, 2):
        raise ValueError("Selecciona una etapa del cultivo.")
    capacity = number({"capacidad": [body.get("capacity", "")]}, "capacidad", 1, 500)
    deficit = number({"déficit": [body.get("deficit", "")]}, "déficit", 0, capacity)
    amount = number({"riego": [body.get("amount", "")]}, "riego", 0, 500)
    delay = number({"retraso": [body.get("delay", "")]}, "retraso", 0, 13)
    if delay % 1:
        raise ValueError("El retraso debe ser un número entero de días.")
    days = body.get("days")
    if not isinstance(days, list) or not 1 <= len(days) <= 14:
        raise ValueError("Se necesita un pronóstico de hasta 14 días.")
    dates = [date.fromisoformat(item["date"]) for item in days]
    if any((second - first).days != 1 for first, second in zip(dates, dates[1:])):
        raise ValueError("Los días del pronóstico deben ser consecutivos.")
    for day in days:
        for key in ("rain", "et0"):
            value = day.get(key)
            if not isinstance(value, (int, float)) or not 0 <= value <= 1000:
                raise ValueError("El pronóstico contiene datos de lluvia o ET₀ incompletos.")
    turn = date.fromisoformat(body.get("turn", ""))
    later = turn + timedelta(days=int(delay))
    if turn not in dates or later not in dates:
        raise ValueError("Ambos turnos deben caer dentro del pronóstico disponible.")
    args = (days, capacity, deficit, crop["p"], crop["kc"][stage])
    return {"scheduled": simulate_water(*args, turn.isoformat(), amount),
            "delayed": simulate_water(*args, later.isoformat(), amount),
            "turn": turn.isoformat(), "later": later.isoformat(), "kc": crop["kc"][stage]}


class Handler(BaseHTTPRequestHandler):
    def send(self, body, mime, status=200):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, data, status=200):
        self.send(json.dumps(data, ensure_ascii=False, allow_nan=False).encode(),
                  "application/json; charset=utf-8", status)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/":
            self.send((ROOT / "fieldshift.html").read_bytes(), "text/html; charset=utf-8")
        elif url.path == "/api/analisis":
            try:
                self.send_json(analyze(parse_qs(url.query, keep_blank_values=True)))
            except ValueError as error:
                self.send_json({"error": str(error)}, 400)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != "/api/riego":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 1 <= length <= 16384:
                raise ValueError("Tamaño de consulta inválido.")
            body = json.loads(self.rfile.read(length))
            self.send_json(irrigation(body))
        except (ValueError, TypeError, AttributeError, KeyError, OverflowError) as error:
            self.send_json({"error": f"No se pudo calcular el riego. {error}"}, 400)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    options = parser.parse_args()
    with ThreadingHTTPServer(("127.0.0.1", options.port), Handler) as server:
        print(f"Field Shift: http://127.0.0.1:{options.port}", flush=True)
        server.serve_forever()
