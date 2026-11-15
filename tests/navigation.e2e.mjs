import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { submitDemoSignIn } from "./helpers/demo-sign-in.mjs";

const origin = process.env.FIELD_SHIFT_TEST_URL;
const channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;

test("la navegación se adapta a la sesión y al ancho de pantalla", { skip: !origin }, async () => {
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(8000);
    await page.goto(origin + "/la-maica/mi-proximo-turno");
    const header = page.locator(".site-header");
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    const explore = nav.getByRole("link", { name: "Explorar" });
    const menu = header.getByRole("button", { name: "Abrir menú" });
    const signIn = header.getByRole("button", { name: "Iniciar sesión", exact: true });
    const register = header.getByRole("button", { name: "Crear cuenta", exact: true });
    await signIn.waitFor();
    assert.equal(await nav.getByRole("link").count(), 1);
    assert.ok(await header.getByRole("link", { name: "Explorar" }).isVisible());
    assert.equal(await menu.count(), 0);

    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 720 });
      const headerBox = await header.boundingBox();
      const brand = await header.getByRole("link", { name: "Yaku, inicio" }).boundingBox();
      assert.ok(Math.abs(brand.x + brand.width / 2 - (headerBox.x + headerBox.width / 2)) < 2, `Marca centrada a ${width}px`);
      const [first, second, third] = await Promise.all([explore.boundingBox(), signIn.boundingBox(), register.boundingBox()]);
      assert.equal(first.y, third.y);
      assert.equal(second.y, third.y);
      assert.ok(first.y >= brand.y + brand.height);
      assert.ok(Math.abs(first.width - third.width) < 1 && Math.abs(second.width - third.width) < 1);
      assert.ok(third.height >= 44 && headerBox.x + headerBox.width - (third.x + third.width) < 20);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await menu.count(), 0);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await register.click();
    const registration = page.getByRole("dialog", { name: "Crear cuenta" });
    await registration.getByLabel("Tu nombre").waitFor();
    await registration.getByRole("button", { name: "Cerrar ventana" }).click();

    await signIn.click();
    const login = page.getByRole("dialog", { name: "Iniciar sesión" });
    await login.getByLabel("Correo o ID de usuario").fill("prueba");
    await login.getByLabel("Contraseña", { exact: true }).fill("prueba123");
    assert.equal((await submitDemoSignIn(page, login)).status(), 200);
    const account = header.getByRole("button", { name: "Luis", exact: true });
    await account.waitFor();

    const main = page.getByRole("main");
    const closed = await main.boundingBox();
    assert.equal(await nav.count(), 0);
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Menú" });
    await drawer.waitFor();
    const open = await main.boundingBox();
    assert.deepEqual([open.x, open.y, open.width], [closed.x, closed.y, closed.width]);
    const links = nav.getByRole("link");
    assert.deepEqual((await links.allTextContents()).map((text) => text.trim()), ["Explorar", "Mis parcelas", "Agua", "Rotaciones"]);
    assert.equal(await nav.getByRole("link", { name: "Agua" }).getAttribute("aria-current"), "page");
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.ok(await menu.evaluate((element) => document.activeElement === element));
    await menu.click();
    await page.mouse.click(700, 120);
    await drawer.waitFor({ state: "hidden" });

    await page.setViewportSize({ width: 880, height: 720 });
    await menu.click();
    await drawer.waitFor();
    await page.setViewportSize({ width: 879, height: 720 });
    await drawer.waitFor({ state: "hidden" });
    await page.waitForFunction(() => !document.querySelector("dialog:modal"));
    assert.equal(await menu.count(), 0);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY), "hidden");
    await page.setViewportSize({ width: 320, height: 720 });
    assert.equal(await nav.evaluate((element) => getComputedStyle(element).position), "fixed");
    const box = await nav.boundingBox();
    assert.equal(box.y + box.height, 720);
    assert.ok(await main.evaluate((element) => parseFloat(getComputedStyle(element).paddingBottom)) >= box.height);
    assert.equal(await nav.getByRole("link", { name: "Agua" }).getAttribute("aria-current"), "page");
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
