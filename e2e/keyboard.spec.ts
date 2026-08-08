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
