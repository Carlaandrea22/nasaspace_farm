import earlyData from "../data/imerg-early.json";
import { sameImergCell } from '../domain/water-balance/source-parsers';
import { forecastHorizonDays, timeZone, toForecast } from "../features/operations/model";

type Point = { latitude: number; longitude: number };

function relevantEarly(point: Point) {
  const { location, days, cells } = earlyData as {
    location?: Point;
    days?: Record<string, number | null>;
    cells?: Record<string, { center: Point; days: Record<string, number | null> }>;
  };
  for (const cell of Object.values(cells ?? {})) {
    if (sameImergCell(point.latitude, point.longitude, cell.center.latitude, cell.center.longitude)) return cell.days;
  }
  if (!location || !days) return {};
  // The imported HDF5 extraction identifies this actual 0.1° pixel, not a radius.
  return sameImergCell(point.latitude, point.longitude, -17.45, -66.15) ? days : {};
}

export async function readWeather(point: Point) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    daily: "precipitation_sum,et0_fao_evapotranspiration,temperature_2m_min,temperature_2m_max,relative_humidity_2m_mean",
    timezone: timeZone,
    past_days: "7",
    forecast_days: String(forecastHorizonDays),
  }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error("Open-Meteo no está disponible");
  return toForecast(await response.json(), new Date().toISOString(), relevantEarly(point));
}
