import { createHash } from "node:crypto";

export const inspectionRecipients = ["regantes", "gamc"] as const;
export type InspectionRecipient = typeof inspectionRecipients[number];
export type InspectionDelivery = "accepted" | "failed" | "sending";

export function inspectionChannels(env = process.env) {
  try {
    const gamc = new URL(env.GAMC_INSPECTION_WEBHOOK ?? "");
    const regantes = new URL(env.REGANTES_INSPECTION_WEBHOOK ?? "");
    if ([gamc, regantes].some((url) => url.protocol !== "https:" || url.username || url.password || url.hash)) return null;
    return { gamc, regantes };
  } catch {
    return null;
  }
}

export function noticeId(userId: string, parcelId: string, date: string, recipient: InspectionRecipient) {
  return createHash("sha256").update(JSON.stringify([userId, parcelId, date, recipient])).digest("hex");
}

export async function postInspection(
  url: URL, recipient: InspectionRecipient, id: string,
  sheet: { date: string; title: string; zone: string; sector: string; text: string },
  token: string, request = fetch,
) {
  try {
    const response = await request(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(7000),
      headers: {
        "Content-Type": "application/json", "Idempotency-Key": id,
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ event: "yaku.inspection", id, recipient, ...sheet }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
