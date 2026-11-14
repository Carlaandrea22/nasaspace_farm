import { getTerritory, isTerritoryLayer, readMapView, territoryImage } from "../../../server/gamc";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const operation = query.get("operation");
  const view = readMapView(query);

  if (operation === "map" || operation === "legend") {
    const layer = query.get("layer");
    if (!isTerritoryLayer(layer) || (operation === "map" && !view)) {
      return Response.json({ error: "Capa o vista inválida" }, { status: 400 });
    }
    return territoryImage(layer, operation === "map" ? "GetMap" : "GetLegendGraphic", view ?? undefined);
  }

  const lat = query.get("lat");
  const lon = query.get("lon");
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (operation || !lat?.trim() || !lon?.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (query.has("bbox") && !view)) {
    return Response.json({ error: "Coordenadas o vista inválidas" }, { status: 400 });
  }
  return Response.json(await getTerritory(latitude, longitude, view ?? undefined), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
