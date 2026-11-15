import earlyData from "../data/imerg-early.json";
import { forecastHorizonDays, timeZone, toForecast } from "../features/operations/model";

type Point = { latitude: number; longitude: number };

function relevantEarly(point: Point) {
  const { location, days } = earlyData as { location?: Point & { radiusKm: number }; days?: Record<string, number | null> };
  if (!location || !days) return {};
  const radians = Math.PI / 180;
  const lat = (location.latitude - point.latitude) * radians;
  const lon = (location.longitude - point.longitude) * radians;
  const haversine = Math.sin(lat / 2) ** 2
    + Math.cos(point.latitude * radians) * Math.cos(location.latitude * radians) * Math.sin(lon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(haversine, 1))) <= location.radiusKm ? days : {};
}

export async function readWeather(point: Point) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    daily: "precipitation_sum,et0_fao_evapotranspiration,temperature_2m_min,temperature_2m_max,relative_humidity_2m_mean",
    timezone: timeZone,
    past_days: "3",
    forecast_days: String(forecastHorizonDays),
  }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error("Open-Meteo no está disponible");
  return toForecast(await response.json(), new Date().toISOString(), relevantEarly(point));
}
