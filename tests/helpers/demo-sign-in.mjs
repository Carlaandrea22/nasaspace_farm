import { setTimeout as delay } from "node:timers/promises";

export async function submitDemoSignIn(page, dialog) {
  async function submit() {
    const [response] = await Promise.all([
      page.waitForResponse(result => result.url().endsWith("/api/auth/sign-in/username")),
      dialog.getByRole("button", { name: "Entrar", exact: true }).click(),
    ]);
    return response;
  }

  const response = await submit();
  if (response.status() !== 429) return response;
  // Specs share the server's per-IP login limit. Respect its cooldown and retry once.
  const seconds = Number(response.headers()["x-retry-after"] ?? "10");
  await delay((Number.isFinite(seconds) ? Math.min(10, Math.max(1, seconds)) : 10) * 1000 + 150);
  return submit();
}
