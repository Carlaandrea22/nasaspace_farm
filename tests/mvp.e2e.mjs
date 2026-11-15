import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const origin = process.env.FIELD_SHIFT_TEST_URL ?? "http://localhost:3000";
const install = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;
const cityDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" });
const dateShift = (date, offset) => new Date(Date.parse(date + "T00:00:00Z") + 86400000 * offset).toISOString().slice(0, 10);

async function openReport(page, name = "Consultar ubicación") {
  const [report] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name, exact: true }).click()]);
  report.setDefaultTimeout(9000);
  return report;
}

test("el menú compacto se abre desde el borde sin desplazar la página", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(2000);
    await page.goto(origin);
    assert.equal(await page.title(), "Yaku");
    const brand = page.getByRole("link", { name: "Yaku, inicio" });
    await brand.getByText("Yaku", { exact: true }).waitFor();
    await brand.locator("img").evaluate((logo) => logo.decode());
    const menu = page.getByRole("button", { name: "Abrir menú" });
    const main = page.locator("main");
    await page.getByRole("region", { name: "Mapa de Cochabamba" }).waitFor();
    const closedLayout = await main.boundingBox();
    assert.equal(await menu.innerText(), "");
    assert.ok((await menu.boundingBox()).x <= 8);
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Menú" });
    await drawer.waitFor();
    assert.deepEqual(await main.boundingBox(), closedLayout);
    const navigation = await drawer.getByRole("navigation").boundingBox();
    assert.equal(navigation.x, 0);
    assert.ok(navigation.width <= 240 && navigation.height <= 225);
    assert.equal(await drawer.getByRole("link", { name: "Explorar" }).getAttribute("aria-current"), "page");
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.equal(await menu.evaluate((element) => element === document.activeElement), true);
    await menu.click();
    await page.mouse.click(600, 160);
    await drawer.waitFor({ state: "hidden" });
  } finally {
    await browser.close();
  }
});

test("el mapa acerca con la rueda y vuelve a la vista límite de Cochabamba", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(4000);
    await page.goto(origin);
    const map = page.getByRole("region", { name: "Mapa de Cochabamba" });
    const zoomIn = map.getByRole("button", { name: "Acercar mapa" });
    const zoomOut = map.getByRole("button", { name: "Alejar mapa" });
    await zoomOut.waitFor();
    assert.equal(await zoomOut.getAttribute("aria-disabled"), "true");
    await map.scrollIntoViewIfNeeded();
    await map.hover();
    await page.mouse.wheel(0, -240);
    await map.locator('.leaflet-control-zoom-out[aria-disabled="false"]').waitFor();
    await page.mouse.wheel(0, 1200);
    await map.locator('.leaflet-control-zoom-out[aria-disabled="true"]').waitFor();

    await page.getByRole("checkbox", { name: "Distritos" }).uncheck();
    await map.locator(".leaflet-districts-pane path").first().waitFor({ state: "detached" });
    await zoomIn.click();
    await zoomIn.click();
    const frame = await map.boundingBox();
    const position = { x: Math.round(frame.width / 2 - 45), y: Math.round(frame.height / 2 - 25) };
    await map.click({ position });
    await page.getByText("Punto seleccionado", { exact: true }).waitFor();
    const marker = map.locator(".leaflet-parcel-point-pane path");
    const before = await marker.boundingBox();
    const scale = map.locator(".leaflet-control-scale-line");
    const reading = await scale.evaluate((element) => [element.textContent, element.style.width]);
    await map.hover({ position });
    await page.mouse.wheel(0, -360);
    await page.waitForFunction(([label, width]) => {
      const scale = document.querySelector(".leaflet-control-scale-line");
      return scale.textContent !== label || scale.style.width !== width;
    }, reading);
    const after = await marker.boundingBox();
    assert.ok(Math.abs(after.x - before.x) < 3 && Math.abs(after.y - before.y) < 3);

    const viewport = await map.boundingBox();
    for (let drag = 0; drag < 6; drag++) {
      await page.mouse.move(viewport.x + viewport.width * 0.8, viewport.y + viewport.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(viewport.x + viewport.width * 0.2, viewport.y + viewport.height * 0.8, { steps: 8 });
      await page.mouse.up();
    }
    await page.getByRole("button", { name: "Marcar centro" }).click();
    const latitude = Number(await page.getByLabel("Latitud").inputValue());
    const longitude = Number(await page.getByLabel("Longitud").inputValue());
    assert.ok(latitude >= -17.59 && latitude <= -17.23);
    assert.ok(longitude >= -66.31 && longitude <= -66.01);
  } finally {
    await browser.close();
  }
});

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
    const openMenu = page.getByRole("button", { name: "Abrir menú" });
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    const navigate = async (label) => {
      await openMenu.click();
      await nav.getByRole("link", { name: label }).click();
    };
    await page.getByRole("heading", { name: "Tu parcela, a la vista." }).waitFor();
    await page.getByRole("heading", { name: "Encuentra tu parcela" }).waitFor();
    const carousel = page.getByRole("region", { name: "Escenas de Yaku" });
    assert.equal(await carousel.getByRole("button", { name: "Pausar carrusel" }).count(), 0);
    await carousel.getByRole("button", { name: "Siguiente escena" }).click();
    assert.equal(await carousel.getByRole("button", { name: "Planifica tu riego" }).getAttribute("aria-current"), "true");
    await carousel.getByRole("button", { name: "Consulta el historial climático" }).click();
    await carousel.getByRole("button", { name: "Siguiente escena" }).press("ArrowRight");
    assert.equal(await carousel.getByRole("button", { name: "Encuentra tu parcela" }).getAttribute("aria-current"), "true");
    await openMenu.click();
    assert.equal(await nav.getByRole("link", { name: "Explorar" }).getAttribute("aria-current"), "page");
    await page.getByRole("button", { name: "Cerrar menú" }).click();
    const map = page.getByRole("region", { name: "Mapa de Cochabamba" });
    await map.locator(".leaflet-districts-pane path").first().waitFor({ state: "attached" });
    assert.equal(await page.getByRole("combobox", { name: "Buscar dirección o lugar" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Usar mi ubicación" }).count(), 0);
    const district = page.getByRole("combobox", { name: "Selecciona tu distrito" });
    await district.selectOption("9");
    assert.equal(await map.getByRole("button", { name: "Alejar mapa" }).getAttribute("aria-disabled"), "false");
    await map.click({ position: { x: 74, y: 96 } });
    await page.getByText("Punto seleccionado", { exact: true }).waitFor();
    const clickedLatitude = await page.getByLabel("Latitud").inputValue();
    await page.getByRole("button", { name: "Marcar centro" }).click();
    assert.notEqual(await page.getByLabel("Latitud").inputValue(), clickedLatitude);
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
    await page.getByRole("link", { name: "IMERG Final V07B", exact: true }).waitFor();
    await page.getByText(/aporta [1-9]\d* días y POWER aporta 0 días/).waitFor();
    await page.getByText("Cambio al retrasar el turno del 26/05/2025 al 31/05/2025.", { exact: true }).waitFor();
    const evidence = page.getByRole("list", { name: "Efecto del retraso por cultivo" });
    assert.equal(await evidence.getByRole("listitem").count(), 3);
    await evidence.getByText(/Riego suplementario \(mm\) · .* → .*/).first().waitFor();
    await page.getByText(/Fecha requerida 11\/11\/2024 UTC/).waitFor();
    await page.getByText(/62[,.]9 % del agua disponible inicial/).waitFor();
    assert.equal(await evidence.getByText(/referencia con POWER y 72 % inicial/).count(), 3);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await priority.selectOption("Vender la cosecha");
    assert.equal(await page.getByTestId("selected-turn").textContent(), delayedDate);
    await cards.filter({ hasText: "Opción C · Preferida" }).waitFor();

    await context.setOffline(true);
    await page.reload();
    await page.getByRole("heading", { name: "Matriz de decisión" }).waitFor();
    await navigate("Explorar");
    await carousel.getByRole("button", { name: "Anticipa el clima" }).click();
    await carousel.locator('[data-active="true"] img').evaluate((image) => image.decode());
    await map.locator(".leaflet-districts-pane path").first().waitFor({ state: "attached" });
    await page.getByText("Imágenes satelitales no disponibles. El mapa local sigue activo.").waitFor();
    assert.ok(await page.getByRole("checkbox", { name: "Satélite" }).isDisabled());
    await page.getByRole("checkbox", { name: "Distritos" }).uncheck();
    await map.locator(".leaflet-districts-pane path").first().waitFor({ state: "detached" });
    assert.ok(await district.isEnabled());
    await district.selectOption("13");
    assert.equal(await map.getByRole("button", { name: "Alejar mapa" }).getAttribute("aria-disabled"), "false");
    await page.locator("img.brand-mark").evaluate((image) => image.decode());
    assert.equal(await page.evaluate(async () => Boolean(await caches.match("/images/carla-valle.webp"))), true);
    assert.equal(await page.evaluate(async () => Boolean(await caches.match("/images/parcela-tractor.webp"))), true);
    await navigate("Mis parcelas");
    assert.equal(await page.getByLabel("Nombre de la parcela (opcional)").inputValue(), "Parcela de prueba");
    assert.equal(await page.getByLabel("Superficie (ha, opcional)").inputValue(), "1.5");
    assert.equal(await page.getByRole("region", { name: "Mapa de La Maica" }).count(), 0);
    await page.getByRole("link", { name: "Ir a cultivo y agua" }).click();
    assert.equal(await page.getByLabel("Caudal (L/s)").inputValue(), "5");
    await navigate("Mis parcelas");
    await page.getByRole("button", { name: "Tirani · D13 / Tunari" }).click();
    const offlineReport = await openReport(page);
    await offlineReport.locator("summary").filter({ hasText: "Contexto territorial" }).click();
    await offlineReport.getByText("Referencia del piloto:", { exact: false }).waitFor();
    await offlineReport.getByText("Las capas municipales no están disponibles en este momento.").waitFor();
    await offlineReport.close();
    await save();
    await navigate("Rotaciones");
    await page.getByRole("heading", { name: /Tirani.*datos insuficientes/ }).waitFor();
    assert.equal(await cards.count(), 0);
    await page.getByText("Incorpora suelo, clima histórico y alternativas agronómicas compatibles con esta ubicación.").waitFor();
    await page.getByRole("link", { name: "Completar cultivo y agua" }).click();
    assert.equal(await page.getByLabel("Caudal (L/s)").inputValue(), "");
    await page.getByLabel("Caudal (L/s)").fill("10");
    await save();
    await navigate("Explorar");
    await page.getByRole("link", { name: "Abrir simulación de riego" }).click();
    await page.getByRole("heading", { name: "Matriz de decisión" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Demo La Maica" }).getAttribute("aria-pressed"), "true");
    await navigate("Mis parcelas");
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
    const queriedAt = "2026-11-28T16:00:00.000Z";
    await page.clock.setFixedTime(new Date(queriedAt));
    const today = cityDay.format(new Date(queriedAt));
    const month = today.slice(0, 7);
    const startMonth = Number(month.slice(5)) - 1;
    const consultations = [];
    await context.route("**/api/weather?*", (route) => route.fulfill({ json: {
      today, queriedAt, recent: [], days: Array.from({ length: 14 }, (_, index) => ({
        date: dateShift(today, index), rain: 1, et0: 3, minimum: index === 3 ? 1 : 8, maximum: 25,
      })),
    } }));
    await context.route("**/api/enso", (route) => route.fulfill({ json: { issued: month, seasons: [
      { code: "DJF", center: month, nina: 5, neutral: 10, nino: 85 },
    ] } }));
    await context.route("**/api/climate?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      const latitude = Number(params.get("lat"));
      const rain = latitude === -17.42442 ? 480 : 515;
      consultations.push(latitude);
      return route.fulfill({ json: {
        queriedAt, from: "2016-01-01", to: "2025-12-31", annualRain: rain, rainYears: 10,
        months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, rain: 45, temperature: 18, minimum: 8, maximum: 27, humidity: 52 })),
        crops: Array.from({ length: 12 }, (_, index) => [
          { code: "1232", name: "Cebada", species: "Hordeum vulgare", use: "forraje", days: 165, cycleRange: [90, 240], temperature: [2, 15, 20, 40], assessment: { category: index === startMonth ? "recommended" : "conditional", optimal: 300 + index, outside: index === startMonth ? 0 : 4, observations: 660 }, optimalRain: true, optimalPh: [6.5, 7.5], samples: 4, favorableCycles: index === startMonth ? 3 : 1, conditionalCycles: index === startMonth ? 1 : 2 },
          { code: "2146", name: "Haba", species: "Vicia faba", use: "consumo", days: 125, cycleRange: [100, 150], temperature: [5, 18, 28, 32], assessment: { category: "recommended", optimal: 475, outside: 0, observations: 500 }, optimalRain: false, optimalPh: [6, 7], samples: 4, favorableCycles: 4, conditionalCycles: 0 },
        ]),
      } });
    });
    await context.route("**/api/territory?*", (route) => {
      const laMaica = new URL(route.request().url()).searchParams.get("lat") === "-17.42442";
      const district = laMaica ? "9" : "13";
      const commune = laMaica ? "Itocta" : "Tunari";
      const emptyLayer = { status: "no-match", matches: [] };
      return route.fulfill({ json: {
        source: "GAMC · Proyecto 04", queriedAt,
        district: { status: "unique", matches: [{ district, commune, label: `D${district} · ${commune}` }] },
        periurban: emptyLayer, drainage: emptyLayer,
      } });
    });
    await page.goto(origin);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByRole("button", { name: "La Maica · D9 / Itocta" }).click();
    assert.deepEqual(consultations, []);
    const panel = await openReport(page);
    await panel.getByRole("heading", { name: "¿Qué puedes cultivar aquí?" }).waitFor();
    await panel.getByText("480 mm", { exact: true }).waitFor();
    await panel.locator("summary").filter({ hasText: "Contexto territorial" }).click();
    await panel.getByRole("region", { name: "Contexto territorial" }).getByText("D9 · Itocta", { exact: true }).waitFor();
    await panel.locator("summary").filter({ hasText: "Panorama estacional" }).click();
    await panel.getByText(/El Niño · 85%/).waitFor();
    assert.equal(await panel.getByText(/El Niño · 85%/).count(), 1);
    await panel.getByText("90–240 días estimados entre siembra y cosecha", { exact: false }).waitFor();
    const barley = panel.getByRole("listitem").filter({ has: panel.getByRole("heading", { name: "Cebada", exact: true }) });
    await barley.locator("summary").click();
    await barley.getByText(/3 de 4 ciclos históricos favorables/).waitFor();
    const dateControl = panel.getByLabel("¿Cuándo quieres sembrar?");
    assert.equal(await dateControl.getAttribute("min"), today);
    assert.equal(await dateControl.getAttribute("max"), dateShift(today, 13));
    await panel.getByText(/Temperatura compatible del 28 nov.* al 30 nov/).first().waitFor();
    await dateControl.fill(dateShift(today, -1));
    await panel.getByText(/Elige una fecha entre/).waitFor();
    assert.equal(await panel.getByRole("heading", { name: "Cebada" }).count(), 0);
    await dateControl.fill(dateShift(today, 14));
    await panel.getByText(/Elige una fecha entre/).waitFor();
    await dateControl.fill("2026-12-01");
    await panel.getByLabel("Destino de la cosecha").selectOption("forraje");
    await panel.getByText(/Ninguna opción para el destino elegido/).waitFor();
    await panel.getByLabel("pH medido (opcional)").fill("6,9");
    if (!await barley.locator("details").evaluate((element) => element.open)) await barley.locator("summary").click();
    await barley.getByText(/1 de 4 ciclos históricos favorables/).waitFor();
    await barley.getByText(/pH medido en el rango óptimo/).waitFor();
    await panel.evaluate(() => { window.print = () => { document.body.dataset.printed = "true"; }; });
    await panel.getByRole("button", { name: "Imprimir o guardar PDF" }).click();
    assert.equal(await panel.locator("body").getAttribute("data-printed"), "true");
    await panel.close();
    await page.getByRole("button", { name: "Tirani · D13 / Tunari" }).click();
    const tirani = await openReport(page);
    await tirani.getByText("515 mm", { exact: true }).waitFor();
    await tirani.locator("summary").filter({ hasText: "Contexto territorial" }).click();
    await tirani.getByRole("region", { name: "Contexto territorial" }).getByText("D13 · Tunari", { exact: true }).waitFor();
    assert.equal(await tirani.getByText("480 mm", { exact: true }).count(), 0);
    await tirani.close();
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.getByText("Guardado en este dispositivo").waitFor();
    await context.unrouteAll();
    await context.setOffline(true);
    await page.reload();
    const map = page.getByRole("region", { name: "Mapa de Cochabamba" });
    await map.locator(".leaflet-districts-pane path").first().waitFor({ state: "attached" });
    const districtLabels = map.locator(".district-label:visible");
    assert.equal(await districtLabels.count(), 3);
    assert.deepEqual((await districtLabels.allTextContents()).sort(), ["D13", "D15", "D9"]);
    assert.equal(await map.locator(".leaflet-districts-pane path").count(), 15);
    assert.equal(await page.getByRole("combobox", { name: "Selecciona tu distrito" }).locator("option").count(), 16);
    assert.ok(await districtLabels.evaluateAll((labels) => labels.every((label) => {
      const frame = label.closest(".parcel-viewport").getBoundingClientRect();
      const box = label.getBoundingClientRect();
      return box.width > 0 && box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom;
    })));
    const zoomOut = map.getByRole("button", { name: "Alejar mapa" });
    assert.equal(await zoomOut.getAttribute("aria-disabled"), "true");
    await map.getByRole("button", { name: "Acercar mapa" }).click();
    assert.equal(await zoomOut.getAttribute("aria-disabled"), "false");
    await page.getByRole("button", { name: "Ver todos los distritos" }).click();
    assert.equal(await zoomOut.getAttribute("aria-disabled"), "true");
    assert.equal(await page.getByRole("link", { name: "Consultar ubicación", exact: true }).count(), 0);
    const cached = await openReport(page, "Abrir parcela guardada");
    await cached.getByText("515 mm", { exact: true }).waitFor();
    await cached.getByText(/NASA POWER.*Copia guardada/i).waitFor();
  } finally {
    await browser.close();
  }
});
