import { buildInspection } from "../../../features/operations/model";
import type { PilotDraft } from "../../../features/pilot/draft";
import { getAuth, pool, trustedOrigins } from "../../../server/auth";
import { getTerritory } from "../../../server/gamc";
import { inspectionChannels, inspectionRecipients, noticeId, postInspection, type InspectionDelivery } from "../../../server/inspection-notifier";
import { readWeather } from "../../../server/weather";

const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});

async function userIdFor(request: Request) {
  const auth = await getAuth();
  return (await auth?.api.getSession({ headers: request.headers }))?.user.id;
}

export async function GET(request: Request) {
  if (!inspectionChannels()) return json({ available: false });
  try {
    return json({ available: Boolean(await userIdFor(request)) });
  } catch {
    return json({ available: false });
  }
}

export async function POST(request: Request) {
  if (!trustedOrigins.includes(request.headers.get("origin") ?? "")) return json({ error: "Origen inválido." }, 403);
  const channels = inspectionChannels();
  if (!channels) return json({ error: "Los canales institucionales aún no están configurados." }, 503);
  const parcelId = new URL(request.url).searchParams.get("parcel") ?? "";
  if (parcelId !== "default" && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(parcelId)) {
    return json({ error: "Parcela inválida." }, 400);
  }
  try {
    const userId = await userIdFor(request);
    if (!userId) return json({ error: "Inicia sesión para enviar un aviso." }, 401);
    const { rows } = await pool.query<{ draft: PilotDraft }>(
      "SELECT draft FROM field_shift_drafts WHERE user_id = $1 AND parcel_id = $2", [userId, parcelId],
    );
    const parcel = rows[0]?.draft.parcel;
    if (!parcel) return json({ error: "La parcela no está guardada en tu cuenta." }, 404);
    const [weather, territory] = await Promise.all([readWeather(parcel), getTerritory(parcel.latitude, parcel.longitude)]);
    const sheet = buildInspection(weather, territory);
    if (!sheet) return json({ error: "La lluvia y el drenaje disponibles no permiten emitir una ficha ahora." }, 409);

    const deliveries = await Promise.all(inspectionRecipients.map(async (recipient) => {
      const key = [userId, parcelId, sheet.date, recipient] as const;
      const attempt = crypto.randomUUID();
      const claimed = await pool.query(
        `INSERT INTO field_shift_inspection_deliveries (user_id, parcel_id, local_day, recipient, status, attempt_id)
         VALUES ($1, $2, $3, $4, 'sending', $5)
         ON CONFLICT (user_id, parcel_id, local_day, recipient) DO UPDATE
         SET status = 'sending', attempt_id = EXCLUDED.attempt_id, attempted_at = now()
         WHERE field_shift_inspection_deliveries.status = 'failed'
            OR (field_shift_inspection_deliveries.status = 'sending'
                AND field_shift_inspection_deliveries.attempted_at < now() - interval '30 seconds')`,
        [...key, attempt],
      );
      if (!claimed.rowCount) {
        const existing = await pool.query<{ status: InspectionDelivery }>(
          "SELECT status FROM field_shift_inspection_deliveries WHERE user_id = $1 AND parcel_id = $2 AND local_day = $3 AND recipient = $4",
          [...key],
        );
        return [recipient, existing.rows[0]?.status ?? "failed"] as const;
      }
      const accepted = await postInspection(
        channels[recipient], recipient, noticeId(...key), sheet, process.env.INSPECTION_WEBHOOK_TOKEN?.trim() ?? "",
      );
      const status: InspectionDelivery = accepted ? "accepted" : "failed";
      await pool.query(
        `UPDATE field_shift_inspection_deliveries SET status = $6
         WHERE user_id = $1 AND parcel_id = $2 AND local_day = $3 AND recipient = $4 AND attempt_id = $5`,
        [...key, attempt, status],
      );
      return [recipient, status] as const;
    }));
    return json({ deliveries: Object.fromEntries(deliveries) });
  } catch {
    return json({ error: "No pudimos verificar o enviar la ficha. Intenta de nuevo con conexión." }, 503);
  }
}
