import { applyDraftPatch, type PilotDraft } from "../../../features/pilot/draft";
import { getAuth, pool, trustedOrigins } from "../../../server/auth";
import { draftPatchSchema, fullDraftSchema } from "../../../server/draft-validation";

const headers = { "Cache-Control": "no-store" };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
const unavailable = () => json({ error: "No se pudo abrir el borrador de la cuenta." }, 503);

async function getUserId(request: Request) {
  const auth = await getAuth();
  return (await auth?.api.getSession({ headers: request.headers }))?.user.id;
}

function selectedParcel(request: Request) {
  const id = new URL(request.url).searchParams.get("parcel") ?? "default";
  return id === "default" || /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id) ? id : null;
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!userId) return json({ error: "Inicia sesión para abrir tu borrador." }, 401);
    if (new URL(request.url).searchParams.has("list")) {
      const { rows } = await pool.query(
        `SELECT parcel_id AS id, COALESCE(draft #>> '{parcel,name}', '') AS name
         FROM field_shift_drafts WHERE user_id = $1 ORDER BY updated_at DESC, parcel_id`,
        [userId],
      );
      return json(rows);
    }
    const parcelId = selectedParcel(request);
    if (!parcelId) return json({ error: "Parcela inválida." }, 400);
    const { rows } = await pool.query<{ draft: PilotDraft }>(
      "SELECT draft FROM field_shift_drafts WHERE user_id = $1 AND parcel_id = $2", [userId, parcelId],
    );
    return json(rows[0]?.draft ?? null);
  } catch {
    return unavailable();
  }
}

async function write(request: Request) {
  if (!trustedOrigins.includes(request.headers.get("origin") ?? "")) return json({ error: "Origen inválido." }, 403);
  try {
    const userId = await getUserId(request);
    if (!userId) return json({ error: "Inicia sesión para guardar en la cuenta." }, 401);
    const parcelId = selectedParcel(request);
    if (!parcelId) return json({ error: "Parcela inválida." }, 400);
    const body = await request.text();
    if (body.length > 256_000) return json({ error: "Borrador demasiado grande." }, 413);
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return json({ error: "Borrador inválido." }, 400);
    }

    if (request.method === "PUT") {
      const parsed = fullDraftSchema.safeParse(data);
      if (!parsed.success) return json({ error: "Borrador inválido." }, 400);
      const copied = await pool.query(
        "INSERT INTO field_shift_drafts (user_id, parcel_id, draft) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [userId, parcelId, JSON.stringify(parsed.data)],
      );
      return copied.rowCount ? json(parsed.data) : json({ error: "La cuenta ya tiene un borrador." }, 409);
    }

    const parsed = draftPatchSchema.safeParse(data);
    if (!parsed.success || !(parsed.data.parcel || parsed.data.cropWater)) return json({ error: "Borrador inválido." }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const initial: PilotDraft = { id: crypto.randomUUID(), version: 1 };
      await client.query(
        "INSERT INTO field_shift_drafts (user_id, parcel_id, draft) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [userId, parcelId, JSON.stringify(initial)],
      );
      const { rows } = await client.query<{ draft: PilotDraft }>(
        "SELECT draft FROM field_shift_drafts WHERE user_id = $1 AND parcel_id = $2 FOR UPDATE", [userId, parcelId],
      );
      const draft = applyDraftPatch(rows[0].draft, parsed.data);
      await client.query(
        "UPDATE field_shift_drafts SET draft = $3, updated_at = now() WHERE user_id = $1 AND parcel_id = $2",
        [userId, parcelId, JSON.stringify(draft)],
      );
      await client.query("COMMIT");
      return json(draft);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return unavailable();
  }
}

export { write as PATCH, write as PUT };
