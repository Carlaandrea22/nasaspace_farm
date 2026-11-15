import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const origin = process.env.FIELD_SHIFT_TEST_URL;
const channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;

test("una cuenta nueva guarda y vuelve a abrir dos parcelas independientes", { skip: !origin }, async () => {
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const email = `agricultora-${randomUUID()}@example.test`;
    const password = "Sembrar123";
    await page.goto(origin + "/la-maica/mi-parcela");
    await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Crear cuenta" });
    await dialog.getByLabel("Tu nombre").fill("Rosa");
    await dialog.getByLabel("Correo electrónico").fill(email);
    await dialog.getByLabel("Contraseña", { exact: true }).fill(password);
    await dialog.getByRole("button", { name: "Crear cuenta", exact: true }).click();
    await page.getByRole("button", { name: "Rosa", exact: true }).waitFor();

    const name = page.getByLabel("Nombre de la parcela (opcional)");
    await name.fill("Huerta");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.getByText("Guardado en tu cuenta").waitFor();
    await page.getByRole("link", { name: "Ir a cultivo y agua" }).click();
    await page.getByLabel("Caudal (L/s)").fill("9");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.getByText("Guardado en tu cuenta").waitFor();
    await page.getByRole("link", { name: "Mis parcelas" }).click();
    await page.getByRole("button", { name: "Nueva parcela" }).click();
    await name.fill("Chacra");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.getByText("Guardado en tu cuenta").waitFor();
    await page.getByLabel("Parcelas guardadas").selectOption({ label: "Huerta" });
    await page.getByRole("link", { name: "Consultar ubicación" }).waitFor();
    assert.equal(await name.inputValue(), "Huerta");
    const [report] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("link", { name: "Consultar ubicación" }).click(),
    ]);
    await report.getByRole("heading", { name: "¿Qué puedes cultivar aquí?" }).waitFor();

    const visitor = await browser.newPage();
    await visitor.goto(origin + "/la-maica/mi-parcela");
    assert.equal((await visitor.request.get(origin + "/api/account-draft?list=1")).status(), 401);
    await visitor.getByRole("button", { name: "Iniciar sesión" }).click();
    await visitor.getByLabel("Correo o ID de usuario").fill(email);
    await visitor.getByLabel("Contraseña", { exact: true }).fill(password);
    await visitor.getByRole("button", { name: "Entrar", exact: true }).click();
    await visitor.getByLabel("Parcelas guardadas").selectOption({ label: "Chacra" });
    await visitor.getByRole("link", { name: "Consultar ubicación" }).waitFor();
    assert.equal(await visitor.getByLabel("Nombre de la parcela (opcional)").inputValue(), "Chacra");
    await visitor.getByRole("link", { name: "Ir a cultivo y agua" }).click();
    assert.equal(await visitor.getByLabel("Caudal (L/s)").inputValue(), "");
    await visitor.getByRole("button", { name: "Abrir menú" }).click();
    await visitor.getByRole("dialog", { name: "Menú" }).getByRole("link", { name: "Mis parcelas" }).click();
    await visitor.getByLabel("Parcelas guardadas").selectOption({ label: "Huerta" });
    await visitor.getByRole("link", { name: "Ir a cultivo y agua" }).click();
    assert.equal(await visitor.getByLabel("Caudal (L/s)").inputValue(), "9");

    const saved = await (await visitor.request.get(origin + "/api/account-draft?list=1")).json();
    const other = await browser.newPage();
    await other.goto(origin + "/la-maica/mi-parcela");
    await other.getByRole("button", { name: "Crear cuenta", exact: true }).click();
    const otherDialog = other.getByRole("dialog", { name: "Crear cuenta" });
    await otherDialog.getByLabel("Tu nombre").fill("Julia");
    await otherDialog.getByLabel("Correo electrónico").fill(`regante-${randomUUID()}@example.test`);
    await otherDialog.getByLabel("Contraseña", { exact: true }).fill(password);
    await otherDialog.getByRole("button", { name: "Crear cuenta", exact: true }).click();
    await other.getByRole("button", { name: "Julia", exact: true }).waitFor();
    const privateId = saved.find(({ name }) => name === "Chacra").id;
    const response = await other.request.get(origin + "/api/account-draft?parcel=" + privateId);
    assert.equal(response.status(), 200);
    assert.equal(await response.json(), null);
  } finally {
    await browser.close();
  }
});
