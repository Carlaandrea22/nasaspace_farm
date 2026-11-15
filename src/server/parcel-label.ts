import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { parcelCustomName, type Coordinates, type Parcel } from "../features/pilot/draft";

type DistrictMap = FeatureCollection<Polygon | MultiPolygon, { nombre: string }>;
let districtMap: Promise<DistrictMap | undefined> | undefined;

function contains(ring: Position[], { latitude, longitude }: Coordinates) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    if ((y1 > latitude) !== (y2 > latitude) &&
      longitude < x1 + (x2 - x1) * (latitude - y1) / (y2 - y1)) {
      inside = !inside;
    }
  }
  return inside;
}

export async function parcelLabel(parcel: Parcel | undefined) {
  const name = parcelCustomName(parcel);
  if (!parcel) return "Parcela guardada";

  const official = parcel.territory?.district;
  const code = official?.status === "unique" && official.matches.length === 1
    ? official.matches[0].district?.match(/^(?:d(?:istrito)?\s*)?(\d{1,2})$/i)?.[1]
    : undefined;
  if (code) return `${name || "Parcela"} · Distrito ${Number(code)}`;

  districtMap ??= readFile(join(process.cwd(), "public/maps/cochabamba-distritos.geojson"), "utf8")
    .then((data) => JSON.parse(data) as DistrictMap)
    .catch(() => undefined);
  const map = await districtMap;
  const matches = map?.features.filter(({ geometry }) => {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    return polygons.some(([outline, ...holes]) =>
      contains(outline, parcel) && !holes.some((ring) => contains(ring, parcel)));
  });
  return matches?.length === 1
    ? `${name || "Parcela"} · ${matches[0].properties.nombre}`
    : name || "Parcela · ubicación guardada";
}
