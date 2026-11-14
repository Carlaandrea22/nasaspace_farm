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
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    await page.getByRole("heading", { name: "Explora Cochabamba" }).waitFor();
    assert.equal(await nav.getByRole("link", { name: "Explorar" }).getAttribute("aria-current"), "page");
    const map = page.getByRole("region", { name: "Mapa de Cochabamba" });
    await map.locator(".leaflet-districts-pane path").first().waitFor({ state: "attached" });
    await page.getByLabel("Distrito", { exact: true }).selectOption("9");
    await page.getByRole("button", { name: "Marcar centro" }).click();
    assert.match(await page.getByLabel("Latitud").inputValue(), /^-17\./);
    await page.getByRole("button", { name: "La Maica · D9 / Itocta" }).click();
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
    const priority = page.getByLabel("Mi prioridad en la demo");
    const originalVolume = await volume.inputValue();
    const originalPriority = await priority.inputValue();
    await page.getByRole("button", { name: "5 días más tarde" }).click();
    const delayedDate = await page.getByTestId("selected-turn").textContent();
    assert.equal(delayedDate.split("/").reverse().join("-"), dateShift(plannedDate.split("/").reverse().join("-"), 5));
    assert.equal(await volume.inputValue(), originalVolume);
    assert.equal(await priority.inputValue(), originalPriority);
    await page.getByText("Primer día adicional de estrés", { exact: true }).first().waitFor();
    await page.getByText("¿Por qué?", { exact: true }).click();
    await page.getByRole("link", { name: "NASA POWER", exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await priority.selectOption("Vender la cosecha");
    assert.equal(await page.getByTestId("selected-turn").textContent(), delayedDate);
    await cards.filter({ hasText: "Opción C · Preferida" }).waitFor();

    await context.setOffline(true);
    await page.reload();
    await page.getByRole("heading", { name: "Matriz de decisión" }).waitFor();
    await nav.getByRole("link", { name: "Explorar" }).click();
    await map.locator(".leaflet-districts-pane path").first().waitFor({ state: "attached" });
    await page.getByText("Imágenes satelitales no disponibles. El mapa local sigue activo.").waitFor();
    assert.ok(await page.getByRole("checkbox", { name: "Satélite" }).isDisabled());
    await nav.getByRole("link", { name: "Mis parcelas" }).click();
    assert.equal(await page.getByLabel("Nombre de la parcela (opcional)").inputValue(), "Parcela de prueba");
    assert.equal(await page.getByLabel("Superficie (ha, opcional)").inputValue(), "1.5");
    assert.equal(await page.getByRole("region", { name: "Mapa de La Maica" }).count(), 0);
    await page.getByRole("link", { name: "Ir a cultivo y agua" }).click();
    assert.equal(await page.getByLabel("Caudal (L/s)").inputValue(), "5");
    await nav.getByRole("link", { name: "Mis parcelas" }).click();
    await page.getByRole("button", { name: "Tirani · D13 / Tunari" }).click();
    await page.getByText("Referencia del piloto:", { exact: false }).waitFor();
    await save();
    await nav.getByRole("link", { name: "Rotaciones" }).click();
    await page.getByRole("heading", { name: /Tirani.*datos insuficientes/ }).waitFor();
    assert.equal(await cards.count(), 0);
    await page.getByText("Incorpora suelo, clima histórico y alternativas agronómicas compatibles con esta ubicación.").waitFor();
    await page.getByRole("link", { name: "Completar cultivo y agua" }).click();
    assert.equal(await page.getByLabel("Caudal (L/s)").inputValue(), "");
    await page.getByLabel("Caudal (L/s)").fill("10");
    await save();
    await nav.getByRole("link", { name: "Mis parcelas" }).click();
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true, permissions: ["notifications"] });
    page.setDefaultTimeout(9000);
    const queriedAt = new Date().toISOString();
    const today = cityDay.format(new Date(queriedAt));
    const month = today.slice(0, 7);
    await page.addInitScript(() => {
      window.deliveredNotices = [];
      ServiceWorkerRegistration.prototype.showNotification = async (title, options) => {
        window.deliveredNotices.push({ title, tag: options.tag });
      };
    });
    await page.route("**/api/enso", (route) => route.fulfill({ json: { issued: month, seasons: [
      { code: "DJF", center: month, nina: 82, neutral: 15, nino: 3 },
    ] } }));
    const makeLookup = (label, district, commune) => ({ status: "unique", matches: [{ label, district, commune }] });
    await page.route("**/api/territory?*", (route) => route.fulfill({ json: {
      source: "GAMC · Proyecto 04", queriedAt, district: makeLookup("D4 · MOLLE", "D4", "MOLLE"),
      periurban: { status: "no-match", matches: [] }, drainage: makeLookup("Princ. Tributarios", null, null),
    } }));
    await page.route("**/api/weather?*", (route) => route.fulfill({ json: {
      today, queriedAt, recent: [], days: Array.from({ length: 14 }, (_, index) => ({
        date: dateShift(today, index), rain: index === 0 ? 40 : index === 7 ? 7 : 0, et0: 3, minimum: 9,
        maximum: index === 0 ? 34 : 27, humidity: 37,
      })),
    } }));
    await page.goto(origin + "/la-maica/mi-proximo-turno");
    await page.getByRole("heading", { name: "Avisos climáticos" }).waitFor();
    await page.getByText(/Máxima de 34 °C · humedad media de 37%/).waitFor();
    await page.getByText(/La Niña: 82%/).waitFor();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    assert.equal(await page.evaluate(() => window.deliveredNotices.length), 0);
    await page.getByRole("button", { name: "Activar notificaciones" }).click();
    await page.waitForFunction(() => window.deliveredNotices.length === 2);
    const tags = await page.evaluate(() => window.deliveredNotices.map(({ tag }) => tag));
    assert.deepEqual(tags, [`field-shift:heat:-17.42442,-66.18272:${today}`, `field-shift:enso:${month}:La Niña`]);
    await page.getByRole("button", { name: "Actualizar pronóstico" }).click();
    await page.getByText(/Máxima de 34 °C · humedad media de 37%/).waitFor();
    assert.equal(await page.evaluate(() => window.deliveredNotices.length), 2);
    await page.getByRole("heading", { name: "Próximos 7 días" }).waitFor();
    const forecast = page.getByRole("region", { name: "Pronóstico" });
    await forecast.getByRole("definition").filter({ hasText: /^40 mm$/ }).waitFor();
    await forecast.getByRole("button", { name: "14 días" }).click();
    await page.getByRole("heading", { name: "Próximos 14 días" }).waitFor();
    await forecast.getByText("47 mm", { exact: true }).waitFor();
    await forecast.getByText(/La segunda semana tiene mayor incertidumbre/).waitFor();
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

test("el historial cambia con el punto y recupera la última consulta sin red", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(9000);
    const queriedAt = new Date().toISOString();
    const today = cityDay.format(new Date(queriedAt));
    const month = today.slice(0, 7);
    await context.route("**/api/enso", (route) => route.fulfill({ json: { issued: month, seasons: [
      { code: "DJF", center: month, nina: 5, neutral: 10, nino: 85 },
    ] } }));
    await context.route("**/api/climate?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      const latitude = Number(params.get("lat"));
      const rain = latitude === -17.42442 ? 480 : 515;
      return route.fulfill({ json: {
        queriedAt, from: "2016-01-01", to: "2025-12-31", annualRain: rain, rainYears: 10,
        months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, rain: 45, temperature: 18, minimum: 8, maximum: 27, humidity: 52 })),
        crops: Array.from({ length: 12 }, (_, index) => [
          { code: "1232", name: "Cebada", species: "Hordeum vulgare", use: "forraje", days: 90, assessment: { category: "recommended", optimal: 80 + index, outside: 0, observations: 100 }, optimalRain: true, optimalPh: [6.5, 7.5], samples: 4 },
          { code: "2146", name: "Haba", species: "Vicia faba", use: "consumo", days: 100, assessment: { category: "recommended", optimal: 95, outside: 0, observations: 100 }, optimalRain: false, optimalPh: [6, 7], samples: 4 },
        ]),
      } });
    });
    await page.goto(origin);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByRole("button", { name: "La Maica · D9 / Itocta" }).click();
    await page.getByRole("link", { name: "Ver clima y cultivos" }).click();
    const panel = page.getByRole("region", { name: "Clima y cultivos para este punto" });
    await panel.getByText("480 mm", { exact: true }).waitFor();
    await panel.getByText(/El Niño · 85%/).first().waitFor();
    const monthControl = panel.getByLabel("Mes previsto de siembra");
    const nextMonth = await monthControl.locator("option").nth(1).getAttribute("value");
    await monthControl.selectOption(nextMonth);
    await panel.getByText(new RegExp(String(80 + Number(nextMonth.slice(5)) - 1) + " de 100 días")).waitFor();
    await panel.getByLabel("Destino de la cosecha").selectOption("forraje");
    await panel.getByRole("listitem").first().getByRole("heading", { name: "Cebada" }).waitFor();
    await panel.getByLabel("pH medido (opcional)").fill("6,9");
    await panel.getByRole("listitem").first().getByText(/pH medido en el rango óptimo/).waitFor();
    await page.getByRole("button", { name: "Tirani · D13 / Tunari" }).click();
    await panel.getByText("515 mm", { exact: true }).waitFor();
    assert.equal(await panel.getByText("480 mm", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.getByText("Guardado en este dispositivo").waitFor();
    await context.unrouteAll();
    await context.setOffline(true);
    await page.reload();
    await panel.getByText("515 mm", { exact: true }).waitFor();
    await panel.getByText(/NASA POWER.*Copia guardada/i).waitFor();
  } finally {
    await browser.close();
  }
});
