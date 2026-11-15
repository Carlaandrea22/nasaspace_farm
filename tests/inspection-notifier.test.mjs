import assert from "node:assert/strict";
import test from "node:test";
import { inspectionChannels, noticeId, postInspection } from "../src/server/inspection-notifier.ts";

test("requiere dos canales HTTPS y envía el aviso con una clave de reintento estable", async () => {
  assert.equal(inspectionChannels({ GAMC_INSPECTION_WEBHOOK: "https://gamc.example.invalid" }), null);
  assert.equal(inspectionChannels({
    GAMC_INSPECTION_WEBHOOK: "http://gamc.example.invalid", REGANTES_INSPECTION_WEBHOOK: "https://regantes.example.invalid",
  }), null);
  const channels = inspectionChannels({
    GAMC_INSPECTION_WEBHOOK: "https://gamc.example.invalid/avisos",
    REGANTES_INSPECTION_WEBHOOK: "https://regantes.example.invalid/avisos",
  });
  assert.equal(channels.gamc.href, "https://gamc.example.invalid/avisos");
  const gamcId = noticeId("usuario", "parcela", "2026-11-15", "gamc");
  assert.notEqual(gamcId, noticeId("usuario", "parcela", "2026-11-15", "regantes"));
  const fixture = { date: "2026-11-15", title: "Inspección D9", zone: "D9", sector: "Canal", text: "Revisar antes del turno" };
  const received = [];
  const accepted = await postInspection(channels.gamc, "gamc", gamcId, fixture, "", async (url, options) => {
    received.push({ url, options });
    return new Response(null, { status: 202 });
  });
  assert.equal(accepted, true);
  assert.equal(received[0].options.redirect, "error");
  assert.equal(received[0].options.headers["Idempotency-Key"], gamcId);
  assert.equal(JSON.parse(received[0].options.body).recipient, "gamc");
  assert.equal(await postInspection(channels.regantes, "regantes", "fixture", fixture, "", async () =>
    new Response(null, { status: 503 })), false);
});
