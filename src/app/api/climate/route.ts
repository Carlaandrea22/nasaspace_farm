import { coordinates } from "../../../features/pilot/draft";
import { readClimate } from "../../../server/power";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const point = coordinates(searchParams.get("lat") ?? "", searchParams.get("lon") ?? "");
  if (!point) return Response.json({ error: "Coordenadas inválidas." }, { status: 400, headers });
  try {
    return Response.json(await readClimate(point), { headers });
  } catch {
    return Response.json({ error: "Historial de NASA POWER no disponible." }, { status: 502, headers });
  }
}
