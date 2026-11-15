import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { submitDemoSignIn } from "./helpers/demo-sign-in.mjs";

const origin = process.env.FIELD_SHIFT_TEST_URL;
const channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;
const date = (offset = 0) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(Date.now() + offset * 86400000));

test("el cultivo y turno guardados desde el informe vuelven en móvil y escritorio", { skip: !origin, timeout: 60000 }, async () => {
  const browser = await chromium.launch(channel ? { channel } : {});
  const headers = { Origin: origin };
  try {
    async function login(page) {
      await page.goto(origin + "/la-maica/mi-parcela");
      await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Iniciar sesión" });
      await dialog.getByLabel("Correo o ID de usuario").fill("prueba");
      await dialog.getByLabel("Contraseña", { exact: true }).fill("prueba123");
      assert.equal((await submitDemoSignIn(page, dialog)).status(), 200);
      await page.getByRole("button", { name: "Luis", exact: true }).waitFor();
    }

    async function openWater(page, url) {
      await page.goto(origin + url);
      await page.getByRole("list", { name: "Pasos de la consulta" }).waitFor();
      const choice = page.getByRole("button", { name: "Ya tengo un cultivo y quiero revisar el agua" });
      if (await choice.getAttribute("aria-expanded") !== "true") await choice.click();
      return page.locator("#parcel-water");
    }

    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktop.setDefaultTimeout(7000);
    await login(desktop);
    const parcelId = randomUUID();
    const endpoint = origin + "/api/account-draft?parcel=" + parcelId;
    const parcel = { name: "QA cultivo desde el informe", latitude: -17.3417, longitude: -66.15458, areaHa: 0.85 };
    const campaign = {
      firstCrop: "Maíz forrajero", firstPlanting: "", firstHarvest: "",
      secondCrop: "Haba", secondPlanting: "", secondHarvest: "",
      priority: "Diversificar la producción", waterSource: "Canal o acequia",
      turnDate: "", intervalDays: 10, volumeM3: null, parcelKey: "-17.34170,-66.15458",
    };
    const seeded = await desktop.request.patch(endpoint, { headers, data: { parcel, cropWater: campaign } });
    assert.equal(seeded.status(), 200);
    const url = "/consulta?" + new URLSearchParams({ lat: String(parcel.latitude), lon: String(parcel.longitude), area: "0.85", guardada: parcelId });
    const water = await openWater(desktop, url);
    await water.locator("select[name=crop]").selectOption("Papa");
    await water.locator("input[name=planting]").fill(date(-20));
    await water.locator("input[name=harvest]").fill(date(70));
    await water.getByText("¿Vas a regar? Agrega la fecha y la cantidad", { exact: true }).click();
    await water.locator("input[name=turn]").fill(date(2));
    await water.locator("input[name=depth]").fill("24.5");
    await water.getByRole("button", { name: "Guardar cultivo y turno" }).click();
    await water.getByText("Cultivo y turno guardados en tu cuenta", { exact: true }).waitFor();
    const saved = await (await desktop.request.get(endpoint)).json();
    assert.equal(saved.cropWater.currentCrop, "Papa");
    assert.equal(saved.cropWater.currentHarvest, date(70));
    assert.equal(saved.cropWater.turnDate, date(2));
    assert.equal(saved.cropWater.turnDepthMm, 24.5);
    assert.equal(saved.cropWater.volumeM3, 208.25);
    assert.equal(saved.cropWater.priority, campaign.priority);
    assert.equal(saved.cropWater.secondCrop, "Haba");
    assert.equal(saved.cropWater.intervalDays, 10);

    const mismatched = await desktop.request.patch(endpoint, { headers, data: {
      reportWater: { location: { latitude: -17.42, longitude: -66.18 }, crop: "Papa", planting: date(-20), harvest: date(70), turn: date(2), depthMm: 24.5 },
    } });
    assert.equal(mismatched.status(), 409);
    const missing = await desktop.request.patch(origin + "/api/account-draft?parcel=" + randomUUID(), { headers, data: {
      reportWater: { location: parcel, crop: "Papa", planting: date(-20), harvest: date(70), turn: date(2), depthMm: 24.5 },
    } });
    assert.equal(missing.status(), 404);

    await desktop.getByRole("button", { name: "Luis", exact: true }).click();
    await desktop.getByRole("button", { name: "Cerrar sesión" }).click();
    await desktop.getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor();
    assert.equal((await desktop.request.get(endpoint)).status(), 401);
    const phone = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    await login(phone);
    await phone.goto(origin + url);
    const recovered = phone.locator("#parcel-water");
    await recovered.locator("select[name=crop]").waitFor({ timeout: 4500 });
    assert.equal(await recovered.locator("select[name=crop]").inputValue(), "Papa");
    assert.equal(await recovered.locator("input[name=planting]").inputValue(), date(-20));
    assert.equal(await recovered.locator("input[name=harvest]").inputValue(), date(70));
    await recovered.getByText("¿Vas a regar? Agrega la fecha y la cantidad", { exact: true }).click();
    assert.equal(await recovered.locator("input[name=turn]").inputValue(), date(2));
    assert.equal(await recovered.locator("input[name=depth]").inputValue(), "24.5");
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await recovered.locator("input[name=turn]").fill(date(4));
    await recovered.locator("input[name=depth]").fill("29");
    const saveAndReturn = phone.getByRole("button", { name: "Guardar y volver a Mis parcelas", exact: true });
    await phone.getByRole("button", { name: "Imprimir o guardar PDF", exact: true }).waitFor();
    await saveAndReturn.tap();
    await phone.waitForURL("**/la-maica/mi-parcela");
    await phone.getByRole("heading", { name: "Mis parcelas", exact: true }).waitFor();
    assert.equal((await (await phone.request.get(endpoint)).json()).cropWater.turnDepthMm, 29);

    const newLocation = await openWater(phone, "/consulta?lat=-17.34161&lon=-66.15458&area=1");
    await newLocation.locator("select[name=crop]").selectOption("Cebada forrajera");
    await newLocation.locator("input[name=planting]").fill(date(-20));
    await newLocation.getByRole("button", { name: "Guardar parcela, cultivo y turno" }).tap();
    await newLocation.getByText("Cultivo y turno guardados en tu cuenta", { exact: true }).waitFor();
    await phone.waitForURL(url => Boolean(url.searchParams.get("guardada")));
    const createdId = new URL(phone.url()).searchParams.get("guardada");
    assert.notEqual(createdId, parcelId);
    const created = await (await phone.request.get(origin + "/api/account-draft?parcel=" + createdId)).json();
    assert.equal(created.parcel.areaHa, 1);
    assert.equal(created.cropWater.currentCrop, "Cebada forrajera");
    assert.equal(created.cropWater.turnDate, "");
    const reopened = await openWater(phone, new URL(phone.url()).pathname + new URL(phone.url()).search);
    assert.equal(await reopened.locator("select[name=crop]").inputValue(), "Cebada forrajera");

    await login(desktop);
    const recoveredOnDesktop = await openWater(desktop, url);
    assert.equal(await recoveredOnDesktop.locator("select[name=crop]").inputValue(), "Papa");
    await recoveredOnDesktop.getByText("¿Vas a regar? Agrega la fecha y la cantidad", { exact: true }).click();
    assert.equal(await recoveredOnDesktop.locator("input[name=turn]").inputValue(), date(4));
    assert.equal(await recoveredOnDesktop.locator("input[name=depth]").inputValue(), "29");
    await recoveredOnDesktop.getByRole("button", { name: "Ver cómo estará el agua" }).click();
    await recoveredOnDesktop.getByText("Cultivo y turno guardados en tu cuenta", { exact: true }).waitFor();
    await recoveredOnDesktop.getByRole("button", { name: "14 días", exact: true }).click();
    const desktopSave = desktop.getByRole("button", { name: "Guardar y volver a Mis parcelas", exact: true });
    await desktop.route(endpoint, (request) => request.fulfill({ status: 503, json: { error: "Prueba de conexión" } }), { times: 1 });
    await desktopSave.click();
    await desktop.getByText("No se pudo guardar. Intenta de nuevo.", { exact: true }).waitFor();
    assert.equal(new URL(desktop.url()).pathname, "/consulta");
    await desktopSave.click();
    await desktop.waitForURL("**/la-maica/mi-parcela");
    await desktop.goto(origin + url);
    const resumed = desktop.locator("#parcel-water");
    await resumed.getByRole("button", { name: "Cambiar cultivo o riego" }).waitFor();
    assert.equal(await resumed.getByRole("button", { name: "14 días", exact: true }).getAttribute("aria-pressed"), "true");
    await desktop.getByRole("list", { name: "Pasos de la consulta" }).locator("li:last-child[data-state=complete]").waitFor();

    await desktop.getByRole("button", { name: "Quiero planificar qué sembrar después" }).click();
    const rotation = desktop.locator("#parcel-rotations");
    await rotation.locator("select[name=crop]").selectOption("Maíz forrajero");
    await rotation.locator("select[name=habitual]").selectOption("Avena forrajera");
    await rotation.locator("input[name=harvest]").fill(new Date().getUTCFullYear() + 1 + "-01-31");
    await rotation.getByRole("button", { name: "Ver qué puedo sembrar" }).click();
    await rotation.getByText("Rotación guardada en tu cuenta", { exact: true }).waitFor();
    const seed = rotation.getByText("Comparar costos de semilla (opcional)", { exact: true });
    await seed.click();
    await rotation.getByLabel("Avena forrajera (Bs/ha)", { exact: true }).fill("120");
    await desktopSave.click();
    await desktop.waitForURL("**/la-maica/mi-parcela");
    await phone.goto(origin + url);
    const phonePlan = phone.locator("#parcel-rotations");
    await phonePlan.getByRole("heading", { name: /Para revisar primero:/ }).waitFor();
    await phone.getByRole("list", { name: "Pasos de la consulta" }).locator("li:last-child[data-state=complete]").waitFor();
    await phonePlan.getByText("Comparar costos de semilla (opcional)", { exact: true }).click();
    assert.equal(await phonePlan.getByLabel("Avena forrajera (Bs/ha)", { exact: true }).inputValue(), "120");
    const finalResponse = await phone.request.get(endpoint, { maxRetries: 1 });
    assert.equal(finalResponse.status(), 200);
    const final = await finalResponse.json();
    assert.equal(final.consultation.mode, "rotations");
    assert.equal(final.consultation.water.inputs.depthMm, 29);
    assert.equal(final.consultation.water.options.period, 14);
  } finally {
    await browser.close();
  }
});
