import { test, expect } from "@playwright/test"

// UX móvil: header con auto-hide y navegación del panel vía FAB + bottom sheet.
// Corre en todos los projects; los asserts de FAB/panel aplican en viewport móvil.
test.describe("móvil: chrome de navegación", () => {
  test("header global se oculta al bajar y reaparece al subir @ci", async ({ page, isMobile }) => {
    test.skip(!isMobile, "auto-hide validado en viewport móvil")
    await page.goto("/", { waitUntil: "domcontentloaded" })
    const header = page.locator("header").first()
    await expect(header).toBeVisible()
    // Espera a que React hidrate y enganche el listener de scroll.
    await page.waitForTimeout(1500)

    await page.evaluate(() => window.scrollTo({ top: 400 }))
    await page.evaluate(() => window.scrollTo({ top: 1200 }))
    await page.waitForFunction(() => {
      const h = document.querySelector("header")
      return h && h.style.transform === "translateY(-100%)"
    })

    await page.evaluate(() => window.scrollTo({ top: 300 }))
    await page.waitForFunction(() => {
      const h = document.querySelector("header")
      return h && h.style.transform !== "translateY(-100%)"
    })
  })

  test("panel en móvil: sin barras fijas apiladas y FAB abre el sheet @ci", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo viewport móvil")
    // Pre-selecciona una colección para activar el chrome completo del panel.
    await page.addInitScript(() => {
      localStorage.setItem(
        "resurte-restaurant-type",
        JSON.stringify({
          id: "test",
          slug: "taquerias-antojitos",
          name: "Taquerías y antojitos",
          is_active: true,
          display_order: 1,
        }),
      )
    })
    await page.goto("/panel", { waitUntil: "domcontentloaded" })
    // Cierra la guía si se abrió automáticamente (su panel cubre todo).
    const closeGuide = page.getByRole("button", { name: "Cerrar guía" })
    if (await closeGuide.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeGuide.tap()
      await page.waitForTimeout(400)
    }
    // Acepta el banner de cookies (cubre la esquina del FAB en contexto limpio).
    const acceptCookies = page.getByRole("button", { name: "Aceptar todas" })
    await expect(acceptCookies).toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(700) // deja terminar la animación de entrada
    await acceptCookies.tap()
    await expect(acceptCookies).not.toBeVisible()

    // La top bar del panel no debe ser sticky en móvil.
    const topBarPosition = await page.evaluate(() => {
      const el = document.querySelector(".lg\\:sticky")
      return el ? getComputedStyle(el).position : null
    })
    expect(topBarPosition).not.toBe("sticky")

    const fab = page.getByRole("button", { name: "Abrir herramientas" })
    // Desplaza el contenido para que el FAB no quede sobre botones del hub.
    // Pausas entre saltos: el hook de dirección agrupa eventos con rAF.
    await page.evaluate(() => window.scrollTo({ top: 600 }))
    await page.waitForTimeout(400)
    await page.evaluate(() => window.scrollTo({ top: 100 }))
    await page.waitForTimeout(400)
    await expect(fab).toBeVisible()
    await fab.tap()
    const sheet = page.getByRole("dialog", { name: /mi restaurante/i })
    await expect(sheet).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(sheet).not.toBeVisible()
  })

  test("header móvil: botón 'Ver todos los productos' navega al catálogo @ci", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo viewport móvil")
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })

    const todosBtn = page.locator("header").getByRole("link", { name: "Ver todos los productos" })
    await expect(todosBtn).toBeVisible({ timeout: 8000 })
    await expect(todosBtn).toHaveAttribute("href", /\/cdmx\/buscar$/)
    await todosBtn.tap()
    await page.waitForURL(/\/cdmx\/buscar$/, { timeout: 8000 })

    // Estado activo en /buscar (aria-current) y título del catálogo visible.
    await expect(todosBtn).toHaveAttribute("aria-current", "page")
    await expect(page.getByRole("heading", { name: "Todos los productos" })).toBeVisible({ timeout: 8000 })
  })

  test("producto en móvil: breadcrumb con Atrás y ruta visible @ci", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo viewport móvil")
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })

    // Navega al primer producto disponible; sin datos locales se omite.
    const productLink = page.locator('a[href*="/producto/"]').first()
    if ((await productLink.count()) === 0) {
      test.skip(true, "sin productos en el entorno local")
      return
    }
    await productLink.tap()
    await page.waitForURL(/\/producto\//, { timeout: 8000 })

    const nav = page.getByRole("navigation", { name: "Ruta de navegación" })
    await expect(nav).toBeVisible({ timeout: 8000 })
    await expect(nav.getByRole("button", { name: "Atrás" })).toBeVisible()
    // La ubicación actual (nombre del producto) se anuncia como página actual.
    await expect(nav.locator('[aria-current="page"]')).toBeVisible()

    // Atrás regresa a la página anterior del historial.
    await nav.getByRole("button", { name: "Atrás" }).tap()
    await page.waitForURL(/\/cdmx$/, { timeout: 8000 })
  })
})
