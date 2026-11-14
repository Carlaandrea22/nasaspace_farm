import { readEnso } from "../../../server/enso";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return Response.json(await readEnso(), { headers });
  } catch {
    return Response.json({ error: "Boletín estacional no disponible." }, { status: 502, headers });
  }
}
