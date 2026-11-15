import type { DraftPatch, PilotDraft, ReportSave } from "../../features/pilot/draft";

export async function accountDraft<T>(query: string, method = "GET", data?: DraftPatch | PilotDraft | ReportSave): Promise<T> {
  const response = await fetch(`/api/account-draft?${query}`, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}),
  });
  if (!response.ok) throw new Error(response.status === 409 ? "existing-draft" : "account-draft");
  return (await response.json()) ?? undefined;
}
