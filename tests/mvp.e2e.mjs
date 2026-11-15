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

async function selectedCoordinates(page) {
  const href = await page.getByRole("link", { name: "Consultar ubicación", exact: true }).getAttribute("href");
  const { searchParams } = new URL(href, origin);
  return [Number(searchParams.get("lat")), Number(searchParams.get("lon"))];
}

async function selectReference(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Marcar centro" }).click();
}

test("la portada muestra la marca Yaku", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(2000);
    await page.goto(origin);
    assert.equal(await page.title(), "Yaku");
    const brand = page.getByRole("link", { name: "Yaku, inicio" });
    await brand.getByText("Yaku", { exact: true }).waitFor();
    await brand.locator("img").evaluate((logo) => logo.decode());
  } finally {
    await browser.close();
  }
});

test("la portada ubica los controles de parcela a la izquierda del mapa", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await page.goto(origin);
    const map = page.getByRole("region", { name: "Mapa de Cochabamba" });
    await map.waitFor();
    const controls = [
      page.getByRole("combobox", { name: "Selecciona tu distrito" }),
      page.getByRole("button", { name: "Usar mi ubicación" }),
      page.getByRole("button", { name: "Dibujar parcela" }),
    ];
    const frame = await map.boundingBox();
    const label = page.locator('label[for="district-selector"]');
    const labelBox = await label.boundingBox();
    assert.ok(labelBox.y >= frame.y && labelBox.y - frame.y <= 32, "El panel debe empezar a la altura del mapa");
    assert.ok(await label.evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 20);
    assert.ok((await controls[0].boundingBox()).height >= 52);
    let previous = null;
    for (const control of controls) {
      const box = await control.boundingBox();
      assert.ok(box && box.x + box.width <= frame.x, "El control debe quedar a la izquierda del mapa");
      assert.ok(!previous || box.y >= previous.y + previous.height);
      previous = box;
    }
    assert.equal(await page.getByLabel("Buscar dirección o lugar").count(), 0);
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
    const [latitude, longitude] = await selectedCoordinates(page);
    assert.ok(latitude >= -17.59 && latitude <= -17.23);
    assert.ok(longitude >= -66.31 && longitude <= -66.01);
  } finally {
    await browser.close();
  }
});

test("el mapa de referencia abre con todo Cochabamba y conserva el punto de la parcela", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      try {
        await page.goto(origin + "/la-maica/mi-parcela");
        const map = page.locator("#parcel-map .parcel-viewport");
        const districts = page.getByRole("combobox", { name: "Selecciona tu distrito" });
        await districts.getByRole("option", { name: "Todo Cochabamba" }).waitFor({ state: "attached" });
        assert.equal(await districts.inputValue(), "");
        assert.equal(await map.getByRole("button", { name: "Alejar mapa" }).getAttribute("aria-disabled"), "true");
        assert.equal(await page.getByRole("checkbox", { name: "Satélite" }).isChecked(), true);
        await map.locator(".leaflet-parcel-point-pane path[fill-opacity='1']").waitFor();
        const labels = await map.locator(".priority-district").evaluateAll((elements) => elements.map((label) => {
          const bounds = label.getBoundingClientRect();
          const frame = label.closest(".parcel-viewport").getBoundingClientRect();
          return bounds.width > 0 && bounds.left >= frame.left && bounds.right <= frame.right &&
            bounds.top >= frame.top && bounds.bottom <= frame.bottom;
        }));
        assert.deepEqual(labels, [true, true, true]);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test("las capas GAMC conservan su posición mientras carga la imagen del nuevo encuadre", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  let pending;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
    page.setDefaultTimeout(6000);
    const isMapImage = (url) => url.pathname === "/api/territory" && url.searchParams.get("operation") === "map";
    await page.route(isMapImage, async (route) => {
      if (pending) await pending.promise;
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#405837"/></svg>',
      });
    });
    await page.goto(origin + "/la-maica/mi-parcela");
    const map = page.locator("#parcel-map .parcel-viewport");
    const selector = page.getByRole("combobox", { name: "Capa GAMC" });
    const image = map.locator('.leaflet-territory-pane img:not([style*="opacity: 0;"])');
    const waitForSource = (source) => page.waitForFunction((url) => {
      const images = [...document.querySelectorAll(".leaflet-territory-pane img")].filter((image) => image.style.opacity !== "0");
      return images.length === 1 && images[0].src === url && images[0].complete && images[0].naturalWidth > 0;
    }, source);
    const relativeRect = (locator) => locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const frame = element.closest(".parcel-viewport").getBoundingClientRect();
      return { left: box.left - frame.left, top: box.top - frame.top, width: box.width, height: box.height };
    });
    const marker = map.locator(".leaflet-parcel-point-pane path[fill-opacity='1']");

    for (const layer of ["district", "periurban", "drainage"]) {
      await page.getByRole("button", { name: "Ver todos los distritos" }).click();
      const initialRequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get("layer") === layer);
      await selector.selectOption(layer);
      const initialUrl = (await initialRequest).url();
      await waitForSource(initialUrl);
      await map.scrollIntoViewIfNeeded();
      const original = await relativeRect(image);

      pending = Promise.withResolvers();
      const zoomRequest = page.waitForRequest((request) => isMapImage(new URL(request.url())));
      await map.getByRole("button", { name: "Acercar mapa" }).click();
      const zoomUrl = (await zoomRequest).url();
      assert.notEqual(zoomUrl, initialUrl);
      assert.equal(await image.evaluate((element) => element.src), initialUrl);
      assert.ok((await relativeRect(image)).width > 1.5 * original.width);
      pending.resolve();
      pending = undefined;
      await waitForSource(zoomUrl);

      const zoomed = await relativeRect(image);
      const markerBeforePan = await relativeRect(marker);
      const frame = await map.boundingBox();
      pending = Promise.withResolvers();
      const panRequest = page.waitForRequest((request) => isMapImage(new URL(request.url())));
      await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
      await page.mouse.down();
      await page.mouse.move(frame.x + frame.width / 2 + 65, frame.y + frame.height / 2 + 35, { steps: 10 });
      await page.mouse.up();
      const panUrl = (await panRequest).url();
      assert.notEqual(panUrl, zoomUrl);
      assert.equal(await image.evaluate((element) => element.src), zoomUrl);
      const panned = await relativeRect(image);
      const markerAfterPan = await relativeRect(marker);
      assert.ok(panned.top > zoomed.top + 20);
      assert.ok(Math.abs((panned.left - zoomed.left) - (markerAfterPan.left - markerBeforePan.left)) <= 1);
      assert.ok(Math.abs((panned.top - zoomed.top) - (markerAfterPan.top - markerBeforePan.top)) <= 1);
      pending.resolve();
      pending = undefined;
      await waitForSource(panUrl);
      await selector.selectOption("");
      await image.waitFor({ state: "detached" });
    }
  } finally {
    pending?.resolve();
    await browser.close();
  }
});

test("el mapa mantiene imagen satelital al arrastrar y alejar con teselas lentas", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  let holdTiles = false;
  const pendingTiles = Promise.withResolvers();
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(6000);
    await page.route("https://server.arcgisonline.com/**/tile/**", async (route) => {
      if (holdTiles) await pendingTiles.promise;
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#846545"/></svg>',
      }).catch(() => {});
    });
    await page.goto(origin);
    const map = page.getByRole("region", { name: "Mapa de Cochabamba" });
    await map.locator(".leaflet-tile-loaded").first().waitFor();
    await page.getByRole("button", { name: "La Maica", exact: true }).click();
    await map.locator('img.leaflet-tile-loaded[src*="/tile/17/"]').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll(".leaflet-tile-loaded")].every(tile => getComputedStyle(tile).opacity === "1"));
    await map.scrollIntoViewIfNeeded();

    const countCoveredPoints = () => map.evaluate((element) => {
      const frame = element.getBoundingClientRect();
      const tiles = [...element.querySelectorAll("img.leaflet-tile-loaded, img.satellite-preview")]
        .filter(tile => tile.complete && tile.naturalWidth > 0 && getComputedStyle(tile).opacity === "1")
        .map(tile => tile.getBoundingClientRect());
      const points = [0.1, 0.3, 0.5, 0.7, 0.9].flatMap(x => [0.2, 0.5, 0.8].map(y => [frame.left + x * frame.width, frame.top + y * frame.height]));
      return points.filter(([x, y]) => tiles.some(tile => tile.left <= x && x <= tile.right && tile.top <= y && y <= tile.bottom)).length;
    });

    assert.equal(await countCoveredPoints(), 15);
    holdTiles = true;
    const frame = await map.boundingBox();
    await page.mouse.move(frame.x + frame.width * 0.8, frame.y + frame.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(frame.x + frame.width * 0.2, frame.y + frame.height * 0.5, { steps: 9 });
    await page.mouse.up();
    assert.equal(await countCoveredPoints(), 15, "Cobertura durante el desplazamiento");
    const request = page.waitForRequest(/server\.arcgisonline\.com.*\/tile\/16\//);
    await map.getByRole("button", { name: "Alejar mapa" }).click();
    await request;
    assert.equal(await countCoveredPoints(), 15, "Cobertura durante el alejamiento");
  } finally {
    pendingTiles.resolve();
    await browser.close();
  }
});

test("el mapa conserva la ubicación y los accesos a Tirani y La Maica", async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
      permissions: ["geolocation"],
      geolocation: { latitude: -17.39, longitude: -66.16, accuracy: 25 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.goto(origin);
    const district = page.getByRole("combobox", { name: "Selecciona tu distrito" });
    await district.locator('option[value="13"]').waitFor({ state: "attached" });
    assert.equal(await page.getByRole("combobox", { name: "Buscar dirección o lugar" }).count(), 0);
    await page.getByRole("button", { name: "Tirani", exact: true }).click();
    assert.equal(await district.inputValue(), "13");
    await page.getByRole("button", { name: "La Maica", exact: true }).click();
    assert.equal(await district.inputValue(), "9");
    await page.getByRole("button", { name: "Usar mi ubicación" }).click();
    await page.getByText(/El punto azul indica tu ubicación aproximada/).waitFor();
    assert.equal(await page.getByRole("link", { name: "Consultar ubicación" }).count(), 0);
    await page.getByRole("button", { name: "Marcar centro" }).click();
    const [latitude, longitude] = await selectedCoordinates(page);
    assert.ok(Math.abs(latitude + 17.39) < 0.001);
    assert.ok(Math.abs(longitude + 66.16) < 0.001);
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
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    await page.getByRole("heading", { name: "Tu parcela, a la vista." }).waitFor();
    await page.getByRole("heading", { name: "Encuentra tu parcela" }).waitFor();
    const carousel = page.getByRole("region", { name: "Escenas de Yaku" });
    assert.equal(await carousel.getByRole("button", { name: "Pausar carrusel" }).count(), 0);
    await carousel.getByRole("button", { name: "Siguiente escena" }).click();
    assert.equal(await carousel.getByRole("button", { name: "Planifica tu riego" }).getAttribute("aria-current"), "true");
    await carousel.getByRole("button", { name: "Consulta el historial climático" }).click();
    await carousel.getByRole("button", { name: "Siguiente escena" }).press("ArrowRight");
    assert.equal(await carousel.getByRole("button", { name: "Encuentra tu parcela" }).getAttribute("aria-current"), "true");
    assert.equal(await nav.getByRole("link").count(), 1);
    assert.equal(await nav.getByRole("link", { name: "Explorar" }).getAttribute("aria-current"), "page");
    const map = page.getByRole("region", { name: "Mapa de Cochabamba" });
    await map.locator(".leaflet-districts-pane path").first().waitFor({ state: "attached" });
    assert.equal(await page.getByRole("combobox", { name: "Buscar dirección o lugar" }).count(), 0);
    assert.ok(await page.getByRole("button", { name: "Usar mi ubicación" }).isVisible());
    const district = page.getByRole("combobox", { name: "Selecciona tu distrito" });
    await district.selectOption("9");
    assert.equal(await map.getByRole("button", { name: "Alejar mapa" }).getAttribute("aria-disabled"), "false");
    await map.click({ position: { x: 74, y: 96 } });
    await page.getByText("Punto seleccionado", { exact: true }).waitFor();
    const clickedCoordinates = await selectedCoordinates(page);
    await page.getByRole("button", { name: "Marcar centro" }).click();
    assert.notDeepEqual(await selectedCoordinates(page), clickedCoordinates);
    await page.goto(origin + "/la-maica/mi-parcela");
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
    await page.getByRole("button", { name: "Demo La Maica" }).click();
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
    await page.goto(origin + "/la-maica/comparar#demo");
    await page.getByRole("heading", { name: "Matriz de decisión" }).waitFor();
    await nav.getByRole("link", { name: "Explorar" }).click();
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
    await page.goto(origin + "/la-maica/mi-parcela");
    assert.equal(await page.getByLabel("Nombre de la parcela (opcional)").inputValue(), "Parcela de prueba");
    assert.equal(await page.getByLabel("Superficie (ha, opcional)").inputValue(), "1.5");
    assert.equal(await page.getByRole("region", { name: "Mapa de La Maica" }).count(), 0);
    await page.getByRole("link", { name: "Ir a cultivo y agua" }).click();
    assert.equal(await page.getByLabel("Caudal (L/s)").inputValue(), "5");
    await page.goto(origin + "/la-maica/mi-parcela");
    await page.getByLabel("Latitud").fill("-17.34161");
    await page.getByLabel("Longitud").fill("-66.15458");
    const offlineReport = await openReport(page);
    await offlineReport.getByRole("heading", { name: "Clima de la parcela" }).waitFor();
    await offlineReport.getByText(/Historial no disponible para este punto/).waitFor();
    await offlineReport.close();
    await save();
    await page.goto(origin + "/la-maica/comparar");
    await page.getByRole("heading", { name: /Tirani.*datos insuficientes/ }).waitFor();
    assert.equal(await cards.count(), 0);
    await page.getByText("Confirma los datos de esta ubicación para comparar rotaciones compatibles.").waitFor();
    await page.getByRole("link", { name: "Completar cultivo y agua" }).click();
    assert.equal(await page.getByLabel("Caudal (L/s)").inputValue(), "");
    await page.getByLabel("Caudal (L/s)").fill("10");
    await save();
    await page.goto(origin + "/la-maica/comparar#demo");
    await page.getByRole("heading", { name: "Matriz de decisión" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Demo La Maica" }).getAttribute("aria-pressed"), "true");
    await page.goto(origin + "/la-maica/mi-parcela");
    await page.getByLabel("Latitud").fill("-17.42442");
    await page.getByLabel("Longitud").fill("-66.18272");
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
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(9000);
    const queriedAt = "2026-11-28T16:00:00.000Z";
    await page.clock.setFixedTime(new Date(queriedAt));
    const consultations = [];
    await context.route("**/api/climate?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      const latitude = Number(params.get("lat"));
      const rain = latitude === -17.42442 ? 480 : 515;
      consultations.push(latitude);
      return route.fulfill({ json: {
        queriedAt, from: "2016-01-01", to: "2025-12-31", annualRain: rain, rainYears: 10,
        months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, rain: 45, temperature: 18, minimum: 8, maximum: 27, humidity: 52 })),
      } });
    });
    await page.goto(origin);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await selectReference(page, "La Maica");
    assert.deepEqual(consultations, []);
    const panel = await openReport(page);
    await panel.getByRole("heading", { name: "¿Qué puedes cultivar aquí?" }).waitFor();
    const climate = panel.locator("header.consulta-portada + #clima-parcela");
    await climate.getByText("480 mm", { exact: true }).waitFor();
    assert.equal(await panel.getByText("Ver clima y cultivos de este lugar", { exact: true }).count(), 0);
    assert.equal(await panel.locator("#cultivos-parcela").count(), 0);
    assert.equal(await panel.getByText("Contexto territorial", { exact: true }).count(), 0);
    assert.ok(await panel.getByRole("button", { name: "Quiero planificar qué sembrar después" }).isVisible());
    await panel.evaluate(() => { window.print = () => { document.body.dataset.printed = "true"; }; });
    await panel.getByRole("button", { name: "Imprimir o guardar PDF" }).click();
    assert.equal(await panel.locator("body").getAttribute("data-printed"), "true");
    await panel.close();
    await selectReference(page, "Tirani");
    const tirani = await openReport(page);
    await tirani.getByText("515 mm", { exact: true }).waitFor();
    assert.equal(await tirani.getByText("480 mm", { exact: true }).count(), 0);
    const tiraniUrl = tirani.url();
    await tirani.close();
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
    const cached = await context.newPage();
    await cached.goto(tiraniUrl);
    await cached.getByText("515 mm", { exact: true }).waitFor();
    await cached.getByText(/NASA POWER.*Copia guardada/i).waitFor();
  } finally {
    await browser.close();
  }
});
