import catalogue from "../data/ecocrop.json";
import { summarizeClimate, type ClimateDay, type ClimateProfile, type CropUse } from "../domain/climate/screening";
import type { Coordinates } from "../features/pilot/draft";

const fields = { T2M: "C", T2M_MIN: "C", T2M_MAX: "C", RH2M: "%", PRECTOTCORR: "mm/day" } as const;
type Field = keyof typeof fields;

export function parsePower(input: unknown, from: string, to: string): ClimateDay[] {
  const data = input as {
    header?: { fill_value?: number; time_standard?: string };
    parameters?: Partial<Record<Field, { units: string }>>;
    properties?: { parameter?: Partial<Record<Field, Record<string, unknown>>> };
  } | null;
  const values = data?.properties?.parameter;
  if (data?.header?.time_standard !== "LST" || !values || Object.entries(fields).some(([field, unit]) =>
    data.parameters?.[field as Field]?.units !== unit || !values[field as Field])) {
    throw new Error("NASA POWER no declaró el tiempo solar local y las unidades esperadas.");
  }
  const fillValue = data.header.fill_value ?? -999;
  function read(field: Field, date: string, minimum: number, maximum: number) {
    const value = values?.[field]?.[date];
    return typeof value === "number" && Number.isFinite(value) && value !== fillValue && value >= minimum && value <= maximum ? value : null;
  }
  const first = Date.parse(from);
  const last = Date.parse(to);
  const days = Array.from({ length: Math.floor((last - first) / 86_400_000) + 1 }, (_, index) => {
    const date = new Date(first + index * 86_400_000).toISOString().slice(0, 10);
    const key = date.replaceAll("-", "");
    return {
      date,
      temperature: read("T2M", key, -100, 80),
      minimum: read("T2M_MIN", key, -100, 80),
      maximum: read("T2M_MAX", key, -100, 80),
      humidity: read("RH2M", key, 0, 100),
      rain: read("PRECTOTCORR", key, 0, 5000),
    };
  });
  if (!days.some((day) => day.temperature !== null || day.rain !== null)) throw new Error("NASA POWER devolvió una serie vacía.");
  return days;
}

export async function readClimate(point: Coordinates, now = new Date()): Promise<ClimateProfile> {
  const lastYear = now.getUTCFullYear() - 1;
  const from = `${lastYear - 9}-01-01`;
  const to = `${lastYear}-12-31`;
  const url = new URL("https://power.larc.nasa.gov/api/temporal/daily/point");
  url.search = new URLSearchParams({
    community: "AG", parameters: Object.keys(fields).join(","), format: "JSON", "time-standard": "LST",
    latitude: point.latitude.toFixed(3), longitude: point.longitude.toFixed(3),
    start: from.replaceAll("-", ""), end: to.replaceAll("-", ""),
  }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("NASA POWER no está disponible.");
  const days = parsePower(await response.json(), from, to);
  return { point, from, to, queriedAt: now.toISOString(), ...summarizeClimate(days, catalogue.map((crop) => ({ ...crop, use: crop.use as CropUse }))) };
}
