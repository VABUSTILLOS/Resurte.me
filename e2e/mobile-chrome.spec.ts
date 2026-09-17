import { test, expect } from "@playwright/test"

// UX móvil: header con auto-hide y navegación del panel vía FAB + bottom sheet.
// Corre en todos los projects; los asserts de FAB/panel aplican en viewport móvil.
test.describe("móvil: chrome de navegación", { tag: "@ci" }, () => {
  test("header global se oculta al bajar y reaparece al subir", async ({ page, isMobile }) => {
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

  test("panel en móvil: sin barras fijas apiladas y FAB abre el sheet", async ({ page, isMobile }) => {
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

  test("header móvil: botón 'Ver todos los productos' navega al catálogo", async ({ page, isMobile }) => {
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

  test("producto en móvil: breadcrumb con Atrás y ruta visible", async ({ page, isMobile }) => {
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

// Regresión: el header aloja logo + selector de ciudad + buscador + acciones.
// `html`/`body` llevan `overflow-x: clip`, así que un desborde interno NO
// genera scroll del documento: los controles se recortan y quedan invisibles
// sin que ningún assert sobre `documentElement.scrollWidth` lo note. Por eso
// aquí se mide el propio header y, además, se comprueba que ningún control
// visible sobresalga de sus bordes.
//
// Anchos cubiertos: móviles chicos (320–412), el borde exacto del breakpoint
// `sm` (640/641 — donde la regla unlayered `.touch-target` pisaba `sm:hidden`
// y el header renderizaba a la vez los accesos móviles y los de escritorio),
// la franja tablet (768/820) y desktop (900–1280).
test.describe("header: no desborda ni recorta controles", { tag: "@ci" }, () => {
  test.skip(({ isMobile }) => isMobile, "el test fija sus propios viewports")

  for (const width of [320, 360, 375, 412, 640, 641, 768, 820, 900, 1024, 1280]) {
    test(`sin desborde ni recorte a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/", { waitUntil: "domcontentloaded" })

      const result = await page.evaluate(() => {
        const header = document.querySelector("header")
        if (!header) return { missing: true, overflow: 0, clipped: [] as string[] }
        const hr = header.getBoundingClientRect()
        const clipped: string[] = []
        header.querySelectorAll("a, button, input").forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return
          if (r.right > hr.right + 1 || r.left < hr.left - 1) {
            const name = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 24)
            clipped.push(
              `${el.tagName.toLowerCase()} "${name}" en ${Math.round(r.left)}..${Math.round(r.right)}, ` +
                `header ${Math.round(hr.left)}..${Math.round(hr.right)}`,
            )
          }
        })
        return { missing: false, overflow: header.scrollWidth - header.clientWidth, clipped }
      })

      expect(result.missing, "no se encontró el header").toBe(false)
      expect(result.overflow, `el header desborda a ${width}px`).toBeLessThanOrEqual(1)
      expect(
        result.clipped,
        `controles recortados a ${width}px:\n${result.clipped.join("\n")}`,
      ).toEqual([])
    })
  }
})
