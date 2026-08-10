import { test, expect, type Page } from "@playwright/test"

// Solo se ejecuta en el project "mobile-chromium" (Pixel 7: 412×915, touch).
test.describe("móvil: render, touch-target y sin overflow", () => {
  // 1) Las páginas públicas renderizan en viewport móvil sin scroll horizontal.
  const pages: Array<[string, string]> = [
    ["home", "/"],
    ["marketplace", "/comer"],
    ["ciudad", "/cdmx"],
    ["carrito", "/cdmx/carrito"],
    ["busqueda", "/cdmx/buscar"],
    ["recompensas", "/recompensas"],
    ["panel", "/panel"],
  ]

  for (const [label, url] of pages) {
    test(`sin overflow horizontal en ${label}`, async ({ page }) => {
      await page.goto(url, { waitUntil: "domcontentloaded" })
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement
        const body = document.body
        return {
          docScroll: doc.scrollWidth - doc.clientWidth,
          bodyScroll: body.scrollWidth - body.clientWidth,
        }
      })
      // Tolerancia de 1px por scrollbar/redondeo.
      expect(overflow.docScroll, `overflow horizontal en ${label}`).toBeLessThanOrEqual(1)
      expect(overflow.bodyScroll, `overflow horizontal en ${label}`).toBeLessThanOrEqual(1)
    })
  }

  // 2) Los elementos con .touch-target (visible) miden >= 44px. Solo aplica en
  //    móvil: la regla CSS .touch-target:not(.hidden) es @media (max-width: 640px).
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")
  test("touch-targets visibles miden al menos 44px", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const bad = await page.locator(".touch-target:not(.hidden)").evaluateAll((els) => {
      const failures: string[] = []
      for (const el of els) {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
          failures.push(
            `${(el.className as string).split(" ").filter((c) => c.startsWith("touch")).join(" ")} ` +
              `${Math.round(r.width)}x${Math.round(r.height)}`,
          )
        }
      }
      return failures
    })
    expect(bad, `touch-targets menores a 44px:\n${bad.join("\n")}`).toEqual([])
  })

  // 3) En un viewport <=360px el header no desborda (fijación de P1#5).
  test("header móvil no desborda en 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    const headerOverflow = await page.evaluate(() => {
      const header = document.querySelector("header")
      if (!header) return -1
      return header.scrollWidth - header.clientWidth
    })
    expect(headerOverflow).toBeLessThanOrEqual(1)
  })
})

// Descubre un enlace de producto real desde la ciudad. Sin datos en el entorno
// local (Supabase vacío) devuelve null y el test se salta — mismo patrón que a11y.spec.ts.
async function discoverProductHref(page: Page): Promise<string | null> {
  await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
  const links = await page.getByRole("link").evaluateAll((els) =>
    els.map((a) => (a as HTMLAnchorElement).href),
  )
  return links.find((h) => h.includes("/producto/")) ?? null
}

test.describe("móvil: producto — barra sticky add-to-cart", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")
  test("la barra sticky aparece en producto y el stepper funciona", async ({ page }) => {
    const productHref = await discoverProductHref(page)
    test.skip(!productHref, "no hay enlace de producto en /cdmx (sin datos locales)")

    await page.goto(productHref!, { waitUntil: "domcontentloaded" })
    const bar = page.locator(".sticky-atc-bar")
    await expect(bar).toBeVisible()

    // Stepper operativo: aumentar cantidad cambia el total.
    const totalBefore = await bar.locator("text=/\\$/").first().textContent()
    await bar.getByRole("button", { name: "Aumentar cantidad" }).tap()
    await expect(bar.locator("text=/\\$/").first()).not.toHaveText(totalBefore ?? "n/a")
  })

  test("la barra sticky add-to-cart se oculta cuando hay items (cart-bar-active)", async ({ page }) => {
    const productHref = await discoverProductHref(page)
    test.skip(!productHref, "no hay enlace de producto en /cdmx (sin datos locales)")

    await page.goto(productHref!, { waitUntil: "domcontentloaded" })

    const bar = page.locator(".sticky-atc-bar")
    await expect(bar).toBeVisible()
    await bar.getByRole("button", { name: "Agregar" }).tap()

    // Con items, MobileCartBar domina y la sticky ATC se oculta.
    await expect(bar).toBeHidden()
    await expect(page.getByText("Ver carrito", { exact: false }).first()).toBeVisible()
  })
})

// Abre el bottom sheet del panel de forma robusta: el onClick se adjunta al
// hidratar React, así que reintenta el tap hasta que el dialog aparezca.
async function openPanelSheet(page: Page): Promise<ReturnType<Page["getByRole"]>> {
  await page.goto("/panel", { waitUntil: "domcontentloaded" })
  const hamburger = page.getByRole("button", { name: "Abrir menú de herramientas" })
  const sheet = page.getByRole("dialog", { name: "Panel de Herramientas" })
  await expect(hamburger).toBeVisible()
  for (let attempt = 0; attempt < 5; attempt++) {
    await hamburger.tap()
    try {
      await expect(sheet).toBeVisible({ timeout: 1500 })
      return sheet
    } catch {
      // El tap no encontró onClick todavía: espera hidratación y reintenta.
      await page.waitForTimeout(500)
    }
  }
  throw new Error("no se pudo abrir el sheet del panel tras 5 intentos")
}

test.describe("móvil: panel — menú hamburguesa", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")
  test("el botón de menú abre el bottom sheet con los módulos", async ({ page }) => {
    const sheet = await openPanelSheet(page)

    // Los módulos del panel están listados (hub + al menos un tool).
    await expect(sheet.getByText("Inicio del panel")).toBeVisible()
    await expect(sheet.getByRole("link").first()).toBeVisible()
    expect(await sheet.getByRole("link").count()).toBeGreaterThan(3)
  })

  test("el sheet se cierra y navega al pulsar un módulo", async ({ page }) => {
    const sheet = await openPanelSheet(page)

    // El primer enlace de herramienta habilitado (no bloqueado) debería navegar y cerrar el sheet.
    const enabledTool = sheet.getByRole("link", { disabled: false })
    expect(await enabledTool.count()).toBeGreaterThan(0)
    await enabledTool.first().tap()
    await expect(sheet).toBeHidden()
  })
})
