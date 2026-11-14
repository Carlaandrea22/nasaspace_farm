import { readFile } from "node:fs/promises";
import type { LayerLookup, Territory, TerritoryLayer, TerritoryMatch } from "../features/territory/types";

const endpoint = "https://serviciosgamc.cochabamba.bo/api/gs/wms";
const serviceIds: Record<TerritoryLayer, string> = {
  district: "7eb13092-bf0e-493b-aae6-03c43eedda2c",
  periurban: "c52066a1-32fd-4925-81e0-c2dcb8f4238f",
  drainage: "d4cea6e3-fc7f-482a-94ad-bd377df78886",
};

export type MapView = { bbox: [number, number, number, number]; width: number; height: number };
const extent = 20037508.35;
const source = "GAMC · Proyecto 04" as const;
const unavailable = (): LayerLookup => ({ status: "unavailable", matches: [] });

export function projectMercator(latitude: number, longitude: number) {
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  return [
    6378137 * longitude * Math.PI / 180,
    6378137 * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)),
  ] as const;
}

export function readMapView(query: URLSearchParams): MapView | null {
  const bbox = query.get("bbox")?.split(",").map((value) => value.trim() ? Number(value) : NaN);
  const width = Number(query.get("width"));
  const height = Number(query.get("height"));
  if (!bbox || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value) || Math.abs(value) > extent) ||
      bbox[0] >= bbox[2] || bbox[1] >= bbox[3] ||
      !Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > 1024 || height > 1024) return null;
  return { bbox: [bbox[0], bbox[1], bbox[2], bbox[3]], width, height };
}

export function featurePixel(view: MapView, latitude: number, longitude: number) {
  const [x, y] = projectMercator(latitude, longitude);
  const [west, south, east, north] = view.bbox;
  if (x < west || x > east || y < south || y > north) return null;
  return {
    x: Math.min(view.width - 1, Math.floor(((x - west) / (east - west)) * view.width)),
    y: Math.min(view.height - 1, Math.floor(((north - y) / (north - south)) * view.height)),
  };
}

function pointView(latitude: number, longitude: number): MapView {
  const [x, y] = projectMercator(latitude, longitude);
  return { bbox: [x - 500, y - 500, x + 500, y + 500], width: 256, height: 256 };
}

export function gamcUrl(key: string, layer: TerritoryLayer, operation: "GetMap" | "GetFeatureInfo" | "GetLegendGraphic", view?: MapView, pixel?: { x: number; y: number }) {
  const url = new URL(endpoint);
  const params = new URLSearchParams({
    key,
    service_id: serviceIds[layer],
    REQUEST: operation,
    VERSION: operation === "GetLegendGraphic" ? "1.0.0" : "1.1.1",
    FORMAT: "image/png",
  });
  if (view && operation !== "GetLegendGraphic") {
    params.set("SERVICE", "WMS");
    params.set("LAYERS", "");
    params.set("TRANSPARENT", "true");
    params.set("SRS", "EPSG:3857");
    params.set("BBOX", view.bbox.join(","));
    params.set("WIDTH", String(view.width));
    params.set("HEIGHT", String(view.height));
  }
  if (pixel && operation === "GetFeatureInfo") {
    params.set("X", String(pixel.x));
    params.set("Y", String(pixel.y));
    params.set("INFO_FORMAT", "application/json");
    params.set("FEATURE_COUNT", "5");
  }
  url.search = params.toString();
  return url;
}

async function gamcKey() {
  if (process.env.GAMC_API_KEY?.trim()) return process.env.GAMC_API_KEY.trim();
  if (process.env.GAMC_API_KEY_FILE) {
    try {
      return (await readFile(process.env.GAMC_API_KEY_FILE, "utf8")).trim();
    } catch {
      return "";
    }
  }
  return "";
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

export function parseFeatureInfo(payload: unknown, layer: TerritoryLayer): LayerLookup {
  const data = asRecord(payload);
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) return unavailable();
  const matches: TerritoryMatch[] = [];
  for (const feature of data.features.slice(0, 5)) {
    const attributes = asRecord(asRecord(feature)?.properties);
    if (!attributes) return unavailable();
    const fields = new Map(Object.entries(attributes).flatMap(([field, value]) => {
      if (typeof value !== "string" && typeof value !== "number") return [];
      const normalized = field.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return [[normalized, String(value).trim().slice(0, 160)] as const];
    }));
    const district = fields.get("distrito") || fields.get("distritoid") || fields.get("nomdist") || null;
    const commune = fields.get("comuna") || fields.get("nomcomuna") || null;
    const label = layer === "district"
      ? [district, commune].filter(Boolean).join(" · ") || "Distrito sin identificación"
      : fields.get(layer === "periurban" ? "periurbano" : "drenajeeinfluencia") ||
        fields.get("nombre") || fields.get("clasificacion") || fields.get("detalle") || fields.get("tipo") || "Coincidencia cartográfica";
    matches.push({ district, commune, label });
  }
  return { status: matches.length === 0 ? "no-match" : matches.length === 1 ? "unique" : "ambiguous", matches };
}

async function gamcFetch(url: URL) {
  return fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(7000) });
}

export async function getTerritory(latitude: number, longitude: number, view?: MapView): Promise<Territory> {
  const key = await gamcKey();
  const selection = view && featurePixel(view, latitude, longitude) ? view : pointView(latitude, longitude);
  const pixel = featurePixel(selection, latitude, longitude);
  async function lookup(layer: TerritoryLayer) {
    if (!key || !pixel) return unavailable();
    try {
      const response = await gamcFetch(gamcUrl(key, layer, "GetFeatureInfo", selection, pixel));
      if (!response.ok || !response.headers.get("content-type")?.includes("json")) return unavailable();
      return parseFeatureInfo(await response.json(), layer);
    } catch {
      return unavailable();
    }
  }
  const [district, periurban, drainage] = await Promise.all([lookup("district"), lookup("periurban"), lookup("drainage")]);
  return { source, queriedAt: new Date().toISOString(), district, periurban, drainage };
}

export function isTerritoryLayer(value: string | null): value is TerritoryLayer {
  return value !== null && Object.hasOwn(serviceIds, value);
}

export async function territoryImage(layer: TerritoryLayer, operation: "GetMap" | "GetLegendGraphic", view?: MapView) {
  const key = await gamcKey();
  if (!key) return new Response(null, { status: 503 });
  try {
    const response = await gamcFetch(gamcUrl(key, layer, operation, view));
    if (response.ok && response.headers.get("content-type")?.startsWith("image/png")) {
      return new Response(response.body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
    }
  } catch {
    // Keep upstream URLs and credentials out of client responses and logs.
  }
  return new Response(null, { status: 502 });
}
