import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const origin = process.env.FIELD_SHIFT_TEST_URL ?? "http://localhost:3000";
const install = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;
const cityDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" });
const dateShift = (date, offset) => new Date(Date.parse(date + "T00:00:00Z") + 86400000 * offset).toISOString().slice(0, 10);

test("el invitado guarda su parcela, compara escenarios y reabre el MVP sin red", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(9000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const save = async () => {
      await page.getByRole("button", { name: "Guardar borrador" }).click();
      await page.getByText("Guardado en este dispositivo", { exact: true }).waitFor();
    };
    await page.goto(origin);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByRole("link", { name: "Continuar sin cuenta" }).click();
    await page.getByRole("link", { name: "Mi parcela", exact: true }).click();
    const map = page.getByRole("region", { name: "Mapa de La Maica" });
    await map.locator(".leaflet-overlay-pane path").first().waitFor({ state: "attached" });
    await page.getByLabel("Nombre de la parcela (opcional)").fill("Parcela de prueba");
    await page.getByLabel("Superficie (ha, opcional)").fill("1,5");
    await save();
    await page.getByRole("link", { name: "Ir a cultivo y agua" }).click();
    await page.locator('select[name="currentCrop"]').selectOption("Maíz forrajero");
    await page.getByLabel("Siembra del cultivo actual").fill("2026-10-01");
    await page.locator('select[name="harvestUse"]').selectOption("Forraje");
    await page.getByLabel("Caudal (L/s)").fill("5");
    await page.getByLabel("Duración (min)").fill("80");
    await save();
    await page.getByRole("link", { name: "Ir a la comparación" }).click();
    await page.getByRole("heading", { name: "Matriz de decisión" }).waitFor();
    const cards = page.getByRole("article", { name: /^Opción / });
    assert.equal(await cards.count(), 3);
    const plannedDate = await page.getByTestId("selected-turn").textContent();
    const volume = page.getByLabel("Volumen del turno (m³, supuesto)");
    const originalVolume = await volume.inputValue();
    await page.getByRole("button", { name: "5 días más tarde" }).click();
    const delayedDate = await page.getByTestId("selected-turn").textContent();
    assert.equal(delayedDate.split("/").reverse().join("-"), dateShift(plannedDate.split("/").reverse().join("-"), 5));
    assert.equal(await volume.inputValue(), originalVolume);
    await page.getByText("Primer día adicional de estrés", { exact: true }).first().waitFor();
    await page.getByText("¿Por qué?", { exact: true }).click();
    await page.getByRole("link", { name: "NASA POWER", exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    await context.setOffline(true);
    await page.reload();
    await page.getByRole("heading", { name: "Matriz de decisión" }).waitFor();
    await page.getByRole("link", { name: "Mi cultivo y mi agua", exact: true }).click();
    assert.equal(await page.getByLabel("Caudal (L/s)").inputValue(), "5");
    await page.getByRole("link", { name: "Mi parcela", exact: true }).click();
    assert.equal(await page.getByLabel("Superficie (ha, opcional)").inputValue(), "1.5");
    assert.equal(await page.getByRole("region", { name: "Mapa de La Maica" }).count(), 0);
    await page.getByRole("button", { name: "Tirani · D13 / Tunari" }).click();
    await page.getByText("Referencia del piloto:", { exact: false }).waitFor();
    await save();
    await page.getByRole("link", { name: "Comparar tres rotaciones" }).click();
    await page.getByRole("heading", { name: /Tirani.*datos insuficientes/ }).waitFor();
    assert.equal(await cards.count(), 0);
    await page.getByText("Incorpora suelo, clima histórico y alternativas agronómicas compatibles con esta ubicación.").waitFor();
    await page.getByRole("link", { name: "Mi cultivo y mi agua", exact: true }).click();
    assert.equal(await page.getByLabel("Caudal (L/s)").inputValue(), "");
    await page.getByLabel("Caudal (L/s)").fill("10");
    await save();
    await page.getByRole("link", { name: "Mi parcela", exact: true }).click();
    await page.getByRole("button", { name: "La Maica · D9 / Itocta" }).click();
    await save();
    await page.getByRole("link", { name: "Ir a cultivo y agua" }).click();
    assert.equal(await page.getByLabel("Caudal (L/s)").inputValue(), "5");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("la inspección se puede abrir y descargar con condiciones controladas", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    page.setDefaultTimeout(9000);
    const queriedAt = new Date().toISOString();
    const today = cityDay.format(new Date(queriedAt));
    const makeLookup = (label, district, commune) => ({ status: "unique", matches: [{ label, district, commune }] });
    await page.route("**/api/territory?*", (route) => route.fulfill({ json: {
      source: "GAMC · Proyecto 04", queriedAt, district: makeLookup("D4 · MOLLE", "D4", "MOLLE"),
      periurban: { status: "no-match", matches: [] }, drainage: makeLookup("Princ. Tributarios", null, null),
    } }));
    await page.route("**/api/weather?*", (route) => route.fulfill({ json: {
      today, queriedAt, recent: [], days: Array.from({ length: 14 }, (_, index) => ({
        date: dateShift(today, index), rain: index === 0 ? 40 : 0, et0: 3, minimum: 9,
      })),
    } }));
    await page.goto(origin + "/la-maica/mi-proximo-turno");
    await page.getByRole("heading", { name: "Próximos 14 días" }).waitFor();
    await page.getByText("Abrir ficha de inspección").click();
    const next = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar ficha" }).click();
    const file = await next;
    const text = await readFile(await file.path(), "utf8");
    assert.match(text, /D4 · MOLLE/);
    assert.match(text, /40 mm/);
    assert.match(text, /hidráulicos/);
    assert.match(text, /https:\/\/recursosgamc/);
  } finally {
    await browser.close();
  }
});
