import { test, expect } from "@playwright/test"

// Valida la navegación por teclado en rutas públicas: skip-link,
// orden de tabulación y foco visible (más allá del contraste).
test.describe("accesibilidad navegación por teclado", () => {
  const pages: Array<[string, string]> = [
    ["home", "/"],
    ["marketplace", "/comer"],
  ]

  for (const [label, url] of pages) {
    test(`${label}: skip-link es el primer foco y lleva a main`, async ({ page }) => {
      await page.goto(url, { waitUntil: "domcontentloaded" })
      await page.waitForSelector("main#main-content")

      // Primer Tab del documento → skip-link
      await page.keyboard.press("Tab")
      await expect(page.locator("a.skip-to-main")).toBeFocused()

      // Skip-link visible al recibir foco
      const visible = await page
        .locator("a.skip-to-main")
        .evaluate((el) => {
          const top = getComputedStyle(el).top
          return top !== "-100%"
        })
      expect(visible, "el skip-link debe ser visible al enfocarse").toBe(true)

      // Enter salta al contenido principal
      await page.keyboard.press("Enter")
      await expect(page.locator("main#main-content")).toBeFocused()
    })

    test(`${label}: el foco avanza por elementos interactivos sin quedar atrapado`, async ({
      page,
    }) => {
      await page.goto(url, { waitUntil: "domcontentloaded" })

      // Presiona Tab repetidamente y verifica que el foco siempre está en
      // un elemento interactivo y avanza (no queda atrapado en un bucle).
      let lastTarget = ""
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Tab")
        const target = await page.evaluate(() => {
          const el = document.activeElement
          return el ? `${el.tagName.toLowerCase()}[${(el as HTMLElement).className}]` : "body"
        })
        expect(target, `Tab ${i} no debe caer fuera de un elemento interactivo`).not.toBe("body")
        if (target === lastTarget) {
          throw new Error(`foco atrapado en: ${target} (Tab ${i})`)
        }
        lastTarget = target
      }
    })
  }

  test("Escape cierra el selector de ciudad", async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const trigger = page
      .locator('button[aria-label="Cambiar ciudad"]:visible')
      .first()
    test.skip(
      (await trigger.count()) === 0,
      "no hay trigger de cambiar ciudad visible en este viewport",
    )
    const dialog = page.getByRole("dialog", { name: "Seleccionar ciudad" })
    // Reintenta el clic hasta que React hidrate y el onClick abra el diálogo
    await expect(async () => {
      if (!(await dialog.isVisible())) {
        await trigger.click({ timeout: 2_000 })
      }
      await expect(dialog).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })

  // El drawer del carrito es flujo móvil: en desktop el icono enlaza a /cart.
  test("Escape cierra el drawer del carrito", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "networkidle" })
    await page.waitForSelector("main#main-content")
    const opener = page
      .locator('button[aria-label*="Abrir carrito"]:visible')
      .first()
    test.skip(
      (await opener.count()) === 0,
      "el drawer del carrito solo se abre en viewport móvil",
    )
    await opener.click()
    const drawer = page.getByRole("dialog", { name: "Mi Carrito" })
    await expect(drawer).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()
  })

  test("Escape cierra el drawer de checkout", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "networkidle" })
    const addButton = page
      .locator('button[aria-label^="Agregar"][aria-label$="al carrito"]:visible')
      .first()
    test.skip(
      (await addButton.count()) === 0,
      "no hay productos con botón de agregar en /cdmx",
    )
    await addButton.click()
    const opener = page
      .locator('button[aria-label*="Abrir carrito"]:visible')
      .first()
    test.skip(
      (await opener.count()) === 0,
      "el flujo de drawers solo existe en viewport móvil",
    )
    await opener.click()
    await page.getByRole("button", { name: "Ir a Checkout" }).click()
    const drawer = page.getByRole("dialog", { name: "Checkout" })
    await expect(drawer).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()
  })

  test("los elementos interactivos muestran un anillo de foco visible", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page.keyboard.press("Tab")

    const hasVisibleOutline = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return false
      const s = getComputedStyle(el)
      // focus-visible global: outline 2px solid #0E7A0E
      return s.outlineStyle === "solid" && s.outlineWidth !== "0px" && s.outlineColor !== "rgb(0, 0, 0)"
    })
    expect(hasVisibleOutline, "el elemento enfocado debe mostrar outline visible").toBe(true)
  })
})
