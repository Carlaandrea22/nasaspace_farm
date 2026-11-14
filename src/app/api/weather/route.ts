import { coordinates } from "../../../features/pilot/draft";
import { readWeather } from "../../../server/weather";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const point = coordinates(searchParams.get("lat") ?? "", searchParams.get("lon") ?? "");
  if (!point) return Response.json({ error: "Coordenadas inválidas." }, { status: 400, headers });
  try {
    return Response.json(await readWeather(point), { headers });
  } catch {
    return Response.json({ error: "Pronóstico no disponible. Intenta actualizar más tarde." }, { status: 502, headers });
  }
}
