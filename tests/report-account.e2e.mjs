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
      await page.getByRole("button", { name: "Ya tengo un cultivo y quiero revisar el agua" }).click();
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
    const recovered = await openWater(phone, url);
    assert.equal(await recovered.locator("select[name=crop]").inputValue(), "Papa");
    assert.equal(await recovered.locator("input[name=planting]").inputValue(), date(-20));
    assert.equal(await recovered.locator("input[name=harvest]").inputValue(), date(70));
    await recovered.getByText("¿Vas a regar? Agrega la fecha y la cantidad", { exact: true }).click();
    assert.equal(await recovered.locator("input[name=turn]").inputValue(), date(2));
    assert.equal(await recovered.locator("input[name=depth]").inputValue(), "24.5");
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await recovered.locator("input[name=turn]").fill(date(4));
    await recovered.locator("input[name=depth]").fill("29");
    await recovered.getByRole("button", { name: "Guardar cultivo y turno" }).tap();
    await recovered.getByText("Cultivo y turno guardados en tu cuenta", { exact: true }).waitFor();

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
  } finally {
    await browser.close();
  }
});
