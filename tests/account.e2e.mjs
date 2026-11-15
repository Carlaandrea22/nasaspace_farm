import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const origin = process.env.FIELD_SHIFT_TEST_URL;
const install = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;

test("cuenta de prueba guarda y recupera un borrador sin mezclar el modo invitado", { skip: !origin }, async () => {
  const browser = await chromium.launch(install ? { channel: install } : {});
  try {
    const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await first.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(origin);
    assert.equal(await page.getByRole("link", { name: "Ir al mapa", exact: true }).count(), 0);
    const carousel = page.getByRole("region", { name: "Escenas de Yaku" });
    assert.equal(await carousel.getByRole("button", { name: /Pausar|Reproducir/i }).count(), 0);
    await carousel.getByRole("button", { name: "Planifica tu riego" }).waitFor();
    await page.waitForFunction(() => document.querySelector(".field-carousel").dataset.playing === "true");
    await carousel.getByText("Planifica tu riego", { exact: true }).waitFor({ timeout: 12000 });

    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    const dialog = page.getByRole("dialog", { name: "Iniciar sesión" });
    await dialog.waitFor();
    assert.match(await dialog.evaluate((element) => getComputedStyle(element, "::backdrop").backdropFilter), /blur/);
    await dialog.getByRole("button", { name: "Continuar como invitado" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.goto(origin + "/la-maica/mi-parcela");
    const name = (target) => target.getByLabel("Nombre de la parcela (opcional)");
    await name(page).fill("Parcela invitada");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.getByText("Guardado en este dispositivo").waitFor();

    async function signIn(target, testWrongPassword = false) {
      await target.getByRole("button", { name: "Iniciar sesión" }).click();
      const form = target.getByRole("dialog", { name: "Iniciar sesión" });
      await form.getByLabel("ID de usuario").fill("prueba");
      if (testWrongPassword) {
        await form.getByLabel("Contraseña", { exact: true }).fill("incorrecta");
        await form.getByRole("button", { name: "Entrar", exact: true }).click();
        await form.getByRole("alert").getByText("Revisa el ID y la contraseña.").waitFor();
      }
      await form.getByLabel("Contraseña", { exact: true }).fill("prueba123");
      await form.getByRole("button", { name: "Entrar", exact: true }).click();
      await target.getByRole("button", { name: "Luis", exact: true }).waitFor();
    }

    await signIn(page, true);
    await page.getByRole("button", { name: "Copiar borrador a mi cuenta" }).click();
    await page.getByText("Guardado en tu cuenta").waitFor();
    assert.equal(await name(page).inputValue(), "Parcela invitada");
    await page.getByRole("button", { name: "Abrir mapa" }).click();
    const map = page.getByRole("region", { name: /Mapa de La Maica|Mapa de la parcela/ });
    await map.locator(".leaflet-districts-pane path").first().waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Dibujar parcela" }).click();
    const corners = [{ x: 90, y: 85 }, { x: 145, y: 85 }, { x: 145, y: 142 }, { x: 90, y: 142 }];
    for (const [index, position] of corners.entries()) {
      await map.click({ position });
      await page.getByText(index === 3 ? "4 de 4 puntos · Contorno cerrado" : `${index + 1} de 4 puntos marcados`, { exact: true }).waitFor();
    }
    assert.match(await page.getByRole("link", { name: "Consultar esta parcela" }).getAttribute("href"), /tipo=parcela/);
    await name(page).fill("Parcela guardada en la cuenta");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.getByText("Guardado en tu cuenta").waitFor();
    await page.getByRole("link", { name: "Ir a cultivo y agua" }).click();
    await page.getByLabel("Caudal (L/s)").fill("7");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.getByText("Guardado en tu cuenta").waitFor();

    const second = await browser.newContext();
    const other = await second.newPage();
    await other.goto(origin + "/la-maica/mi-parcela");
    assert.equal((await other.request.get(origin + "/api/account-draft")).status(), 401);
    await signIn(other);
    assert.equal(await name(other).inputValue(), "Parcela guardada en la cuenta");
    const saved = await (await other.request.get(origin + "/api/account-draft")).json();
    assert.equal(saved.parcel.outline.length, 4);
    await other.getByRole("link", { name: "Ir a cultivo y agua" }).click();
    assert.equal(await other.getByLabel("Caudal (L/s)").inputValue(), "7");

    const account = page.getByRole("button", { name: "Luis", exact: true });
    await account.click();
    assert.equal(await account.getAttribute("aria-expanded"), "true");
    await page.getByText("@prueba", { exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    const triggerBox = await account.boundingBox();
    const menuBox = await page.locator(".account-menu").boundingBox();
    assert.ok(menuBox.y >= triggerBox.y + triggerBox.height);
    await page.keyboard.press("Escape");
    assert.equal(await account.getAttribute("aria-expanded"), "false");
    assert.equal(await account.evaluate((element) => element === document.activeElement), true);
    await account.click();
    await page.mouse.click(4, 110);
    assert.equal(await account.getAttribute("aria-expanded"), "false");
    await account.click();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
    await page.goto(origin + "/la-maica/mi-parcela");
    assert.equal(await name(page).inputValue(), "Parcela invitada");
  } finally {
    await browser.close();
  }
});
