import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const origin = process.env.FIELD_SHIFT_TEST_URL;
const channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;

test("la navegación cambia al entrar y salir de la cuenta", { skip: !origin }, async () => {
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(8000);
    await page.goto(origin + "/la-maica/mi-proximo-turno");
    const header = page.locator(".site-header");
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    const explore = nav.getByRole("link", { name: "Explorar" });
    const signIn = header.getByRole("button", { name: "Iniciar sesión", exact: true });
    const register = header.getByRole("button", { name: "Crear cuenta", exact: true });
    await signIn.waitFor();
    assert.equal(await nav.getByRole("link").count(), 1);
    assert.ok(await header.getByRole("link", { name: "Explorar" }).isVisible());
    await register.click();
    const registration = page.getByRole("dialog", { name: "Crear cuenta" });
    await registration.getByLabel("Tu nombre").waitFor();
    await registration.getByRole("button", { name: "Cerrar ventana" }).click();

    await signIn.click();
    const login = page.getByRole("dialog", { name: "Iniciar sesión" });
    await login.getByLabel("Correo o ID de usuario").fill("prueba");
    await login.getByLabel("Contraseña", { exact: true }).fill("prueba123");
    await login.getByRole("button", { name: "Entrar", exact: true }).click();
    const account = header.getByRole("button", { name: "Luis", exact: true });
    await account.waitFor();
    const links = nav.getByRole("link");
    assert.deepEqual((await links.allTextContents()).map((text) => text.trim()), ["Explorar", "Mis parcelas", "Agua", "Rotaciones"]);
    assert.equal(await nav.getByRole("link", { name: "Agua" }).getAttribute("aria-current"), "page");
    assert.equal(await nav.evaluate((element) => getComputedStyle(element).position), "sticky");
    assert.ok((await nav.boundingBox()).x < (await page.getByRole("main").boundingBox()).x);

    await page.setViewportSize({ width: 320, height: 720 });
    assert.equal(await nav.evaluate((element) => getComputedStyle(element).position), "fixed");
    const box = await nav.boundingBox();
    assert.equal(box.y + box.height, 720);
    await explore.click();
    await page.waitForURL(origin + "/");
    await account.click();
    await header.getByRole("button", { name: "Cerrar sesión" }).click();
    await signIn.waitFor();
    assert.equal(await links.count(), 1);
    assert.ok(await register.isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await header.evaluate((element) => element.contains(document.querySelector('nav[aria-label="Navegación principal"]'))));
  } finally {
    await browser.close();
  }
});
