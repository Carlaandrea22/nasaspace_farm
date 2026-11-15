import type { Territory } from "../territory/types";

export const forecastSource = "https://open-meteo.com/en/docs";
export const imergSource = "https://gpm.nasa.gov/data/imerg";
export const gamcSource = "https://recursosgamc.cochabamba.bo/api-doc";
export const inspectionThreshold = 30;
export const timeZone = "America/La_Paz";
export const forecastHorizonDays = 14;

export type WeatherDay = { date: string; rain: number | null; et0: number | null; minimum: number | null; maximum?: number | null; humidity?: number | null };
export type RecentRain = { date: string; rain: number | null; source: "imerg-early" | "modeled" | "missing" };
export type Forecast = { today: string; queriedAt: string; days: WeatherDay[]; recent: RecentRain[] };
export type TerritoryExposure = Pick<Territory, "source" | "queriedAt" | "district" | "drainage">;

const fullDate = /^\d{4}-\d{2}-\d{2}$/;
const dateLabel = new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeZone: "UTC" });
const localDays = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

export function localDate(instant: string) {
  return localDays.format(new Date(instant));
}

export function formatDate(value: string) {
  const stamp = dayTimestamp(value);
  return Number.isFinite(stamp) ? dateLabel.format(stamp) : "Por confirmar";
}

function dayTimestamp(date: string) {
  const stamp = Date.parse(`${date}T00:00:00Z`);
  return fullDate.test(date) && Number.isFinite(stamp) && new Date(stamp).toISOString().startsWith(date) ? stamp : NaN;
}

const dayMs = 86_400_000;

export function addDays(date: string, days: number) {
  return new Date(dayTimestamp(date) + days * dayMs).toISOString().slice(0, 10);
}

function metric(value: unknown, minimum = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : null;
}

export function toForecast(input: unknown, queriedAt: string, early: Record<string, number | null> = {}): Forecast {
  const payload = input as Partial<{
    timezone: string;
    daily_units: Record<string, string>;
    daily: Record<string, unknown[]>;
  }> | null;
  const { daily, daily_units: units } = payload ?? {};
  if (payload?.timezone !== timeZone || units?.precipitation_sum !== "mm" || units?.et0_fao_evapotranspiration !== "mm"
    || units?.temperature_2m_min !== "°C" || !Array.isArray(daily?.time) || !daily.time.length) {
    throw new Error("El pronóstico no declara la fecha local y las unidades esperadas.");
  }

  const rows = new Map<string, WeatherDay>();
  for (const [index, date] of daily.time.entries()) {
    if (typeof date !== "string" || !Number.isFinite(dayTimestamp(date))) continue;
    rows.set(date, {
      date,
      rain: metric(daily.precipitation_sum?.[index]),
      et0: metric(daily.et0_fao_evapotranspiration?.[index]),
      minimum: metric(daily.temperature_2m_min?.[index], -100),
      maximum: units.temperature_2m_max === "°C" ? metric(daily.temperature_2m_max?.[index], -100) : null,
      humidity: units.relative_humidity_2m_mean === "%" ? metric(daily.relative_humidity_2m_mean?.[index]) : null,
    });
  }

  const today = localDate(queriedAt);
  const days = Array.from(rows.values()).filter(({ date }) => date >= today && date <= addDays(today, forecastHorizonDays - 1)).sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) throw new Error("El proveedor no devolvió fechas futuras utilizables.");

  const recent = [-3, -2, -1].map<RecentRain>((offset) => {
    const date = addDays(today, offset);
    const estimated = rows.get(date)?.rain ?? null;
    const observed = metric(early[date]);
    return { date, rain: observed ?? estimated, source: observed !== null ? "imerg-early" : estimated !== null ? "modeled" : "missing" };
  });

  return { today, queriedAt, days, recent };
}

export const heatThreshold = 32;

export function heatSignals(forecast: Forecast) {
  return horizon(forecast.days, forecast.today, 3).flatMap((day) =>
    day.maximum != null && day.maximum >= heatThreshold ? [{ ...day, maximum: day.maximum }] : []);
}

export function summarizeWeather(days: WeatherDay[]) {
  const rainfall = days.filter((day) => day.rain !== null);
  const demand = days.filter((day) => day.et0 !== null);
  return {
    rain: days.length > 0 && rainfall.length === days.length ? rainfall.reduce((sum, day) => sum + (day.rain ?? 0), 0) : null,
    et0: days.length > 0 && demand.length === days.length ? demand.reduce((sum, day) => sum + (day.et0 ?? 0), 0) : null,
    count: days.length,
    rainCount: rainfall.length,
    et0Count: demand.length,
  };
}

export function horizon(days: WeatherDay[], today: string, length: number) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return Array.from({ length }, (_, day) => {
    const date = addDays(today, day);
    return byDate.get(date) ?? { date, rain: null, et0: null, minimum: null };
  });
}

export function plantingTemperatureWindow(days: Pick<WeatherDay, "date" | "minimum" | "maximum">[], from: string, limits: number[]) {
  let start: string | undefined;
  let end: string | undefined;
  for (const day of days) {
    if (day.date < from) continue;
    const compatible = day.minimum != null && day.maximum != null && day.minimum >= limits[0] && day.maximum <= limits[3];
    if (end && (!compatible || day.date !== addDays(end, 1))) break;
    if (!compatible) continue;
    start ??= day.date;
    end = day.date;
  }
  return start && end ? { start, end } : null;
}

export function cropStage(planting: string, harvest: string, today: string) {
  const start = dayTimestamp(planting);
  const end = dayTimestamp(harvest);
  const current = dayTimestamp(today);
  if (![start, end, current].every(Number.isFinite) || end <= start) return "Etapa por confirmar";
  if (current < start) return "Siembra pendiente según la fecha declarada";
  if (current >= end) return "Ciclo terminado según las fechas declaradas";
  const progress = (current - start) / (end - start);
  if (progress < 0.2) return "Establecimiento";
  if (progress < 0.45) return "Desarrollo";
  if (progress < 0.8) return "Máxima demanda estimada";
  return "Fin de ciclo";
}

export function inspectionSignal(forecast: Forecast) {
  const recent = forecast.recent.find((day) => day.date === addDays(forecast.today, -1)
    && day.source === "imerg-early" && day.rain !== null && day.rain >= inspectionThreshold);
  const forecastHeavy = horizon(forecast.days, forecast.today, 3).find((day) => day.rain !== null && day.rain >= inspectionThreshold);
  if (recent) return { ...recent, via: "imerg" as const };
  return forecastHeavy ? { ...forecastHeavy, via: "forecast" as const } : null;
}

export function buildInspection(forecast: Forecast, territory: TerritoryExposure | null) {
  if (!territory || territory.district.status !== "unique" || territory.district.matches.length !== 1
    || !["unique", "ambiguous"].includes(territory.drainage.status) || !territory.drainage.matches.length
    || !Number.isFinite(Date.parse(territory.queriedAt)) || localDate(territory.queriedAt) !== forecast.today) return null;

  const district = territory.district.matches[0];
  if (!district.district) return null;

  const heavy = inspectionSignal(forecast);
  if (!heavy) return null;

  const zone = [district.district, district.commune].filter(Boolean).join(" · ");
  const sector = [...new Set(territory.drainage.matches.map(({ label }) => label).filter(Boolean))].join(", ");
  const weatherSource = heavy.via === "imerg" ? "NASA GPM IMERG Early (estimación satelital)" : "Open-Meteo (pronóstico)";
  const weatherUrl = heavy.via === "imerg" ? imergSource : forecastSource;
  const reason = `${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 }).format(heavy.rain ?? 0)} mm en ${formatDate(heavy.date)} según ${weatherSource}, con coincidencia en la capa Drenaje e Influencia.`;
  const action = "Revisar con el regante la acumulación de agua, obstrucciones visibles y acceso al sector antes del turno.";
  const limitation = `Criterio de inspección del MVP: al menos ${inspectionThreshold} mm en un día en combinación con exposición cartografiada. Se requieren datos hidráulicos para estimar el desborde de un canal.`;
  const title = `Ficha de inspección · ${zone}`;
  const text = [title, `Fecha: ${forecast.today}`, `Zona: ${zone}`, `Sector cartografiado: ${sector || "Sin nombre en la capa"}`,
    `Motivo: ${reason}`, `Acción: ${action}`, limitation, `Fuentes: ${weatherSource} ${weatherUrl}; GAMC · Proyecto 04 ${gamcSource}`,
    `Fecha de consulta meteorológica: ${forecast.queriedAt}`, `Fecha de consulta territorial: ${territory.queriedAt}`].join("\n");
  return { title, zone, sector, reason, action, limitation, text, date: forecast.today, weatherSource, weatherUrl };
}
