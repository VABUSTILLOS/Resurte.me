import { test, expect, type Locator, type Page } from "@playwright/test"

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
  // Los product links viven bajo ScrollReveal con content-visibility:auto — pueden
  // tardar en entrar en el árbol de accesibilidad. Reintenta hasta 5s.
  const productLink = page.locator('a[href*="/producto/"]').first()
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await productLink.isVisible().catch(() => false)) {
      return await productLink.evaluate((a) => (a as HTMLAnchorElement).href)
    }
    await page.waitForTimeout(500)
  }
  return null
}

test.describe("móvil: producto — barra sticky add-to-cart", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  // El banner de cookies (fixed bottom, z-60) cubre la sticky ATC (z-40) en
  // contextos nuevos y bloquea los taps. Se acepta para liberar el fondo.
  async function dismissCookieBanner(page: Page): Promise<void> {
    const accept = page.getByRole("button", { name: "Aceptar todas" })
    try {
      await accept.waitFor({ state: "visible", timeout: 4000 })
      await accept.tap().catch(() => {})
    } catch {
      // Sin banner (consent ya almacenado) — OK.
    }
  }

  test("la barra sticky aparece en producto y el stepper funciona", async ({ page }) => {
    const productHref = await discoverProductHref(page)
    test.skip(!productHref, "no hay enlace de producto en /cdmx (sin datos locales)")

    await page.goto(productHref!, { waitUntil: "domcontentloaded" })
    await dismissCookieBanner(page)
    const bar = page.locator(".sticky-atc-bar").first()
    // Durante la hidratación Next/React puede montar la barra dos veces de forma
    // transitoria (ambas copias idénticas que colapsan a 1); .first() evita el
    // strict-mode y no cambia la semántica del test.
    await expect(bar).toBeVisible()

    // Stepper operativo: aumentar cantidad cambia el total.
    // Retry anti-hidratación (mismo patrón que tapQuickAdd): el tap puede llegar
    // antes de que React adjunte el onClick; reintentar hasta que el total cambie.
    for (let attempt = 0; attempt < 5; attempt++) {
      const totalBefore = await bar.locator("text=/\\$/").first().textContent()
      await bar.getByRole("button", { name: "Aumentar cantidad" }).tap().catch(() => {})
      try {
        await expect(bar.locator("text=/\\$/").first()).not.toHaveText(totalBefore ?? "n/a", {
          timeout: 3000,
        })
        return
      } catch {
        await page.waitForTimeout(500)
      }
    }
    throw new Error("el stepper de la barra sticky no cambió el total tras 5 intentos")
  })

  test("la barra sticky add-to-cart se oculta cuando hay items (cart-bar-active)", async ({ page }) => {
    const productHref = await discoverProductHref(page)
    test.skip(!productHref, "no hay enlace de producto en /cdmx (sin datos locales)")

    await page.goto(productHref!, { waitUntil: "domcontentloaded" })
    await dismissCookieBanner(page)

    const bar = page.locator(".sticky-atc-bar").first()
    // Igual que arriba: la doble hidratación colapsa a 1 barra; .first() evita strict-mode.
    await expect(bar).toBeVisible()
    await bar.getByRole("button", { name: "Agregar" }).tap()

    // Con items, MobileCartBar domina y la sticky ATC se oculta.
    await expect(bar).toBeHidden()
    await expect(page.getByText("Ver carrito", { exact: false }).filter({ visible: true }).first()).toBeVisible()
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

// --- Fase 2: página de producto (accordions), carrito (drawer/trash/toast) y
//     grid (altura uniforme de quick-add) ---

test.describe("móvil: producto — accordion defaults Fase 2", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")
  test("en móvil Descripción va cerrado y Calidad y Origen abierto", async ({ page }) => {
    const productHref = await discoverProductHref(page)
    test.skip(!productHref, "no hay enlace de producto en /cdmx (sin datos locales)")

    await page.goto(productHref!, { waitUntil: "domcontentloaded" })

    const descBtn = page.getByRole("button", { name: "Descripción" })
    const qualityBtn = page.getByRole("button", { name: "Calidad y Origen" })
    await expect(descBtn).toBeVisible()
    await expect(qualityBtn).toBeVisible()

    // La confianza (Calidad y Origen) queda arriba del pliegue; la descripción larga, colapsada.
    await expect(descBtn).toHaveAttribute("aria-expanded", "false")
    await expect(qualityBtn).toHaveAttribute("aria-expanded", "true")
  })
})

test.describe("móvil: carrito — drawer, trash y toast Fase 2", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  // Agrega el primer producto con quick-add y abre el drawer desde la barra flotante.
  // Devuelve false si no hay quick-adds (sin datos en el entorno local).
  async function addFirstAndOpenCart(page: Page): Promise<boolean> {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const quickAdd = page.locator(".quick-add-btn").first()
    if ((await quickAdd.count()) === 0) return false
    await expect(quickAdd).toBeVisible()
    if (!(await tapQuickAdd(page, quickAdd))) return false

    // La barra flotante "Ver carrito" aparece tras agregar.
    // (la barra tiene un span desktop hidden md:inline y otro móvil md:hidden;
    //  en móvil el visible es el segundo, así que filtramos por visibilidad)
    const cartBar = page.getByText(/Ver carrito ·/).filter({ visible: true }).first()
    await expect(cartBar).toBeVisible()
    await cartBar.tap()
    await expect(page.getByRole("heading", { name: "Mi Carrito" })).toBeVisible()
    return true
  }

  test("el trash del drawer es visible (sin group-hover) en móvil", async ({ page }) => {
    const hasData = await addFirstAndOpenCart(page)
    test.skip(!hasData, "no hay productos en /cdmx (sin datos locales)")
    const trash = page.getByRole("button", { name: /Eliminar .* del carrito/ }).first()
    await expect(trash).toBeVisible()
    // El botón debe ser tocable (>= 44px) aunque el dedo esté encima — sin opacity 0.
    const box = await trash.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test("agregar desde quick-add muestra toast 'agregado al carrito'", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const quickAdd = page.locator(".quick-add-btn").first()
    if ((await quickAdd.count()) === 0) {
      test.skip(true, "no hay productos en /cdmx (sin datos locales)")
      return
    }
    await expect(quickAdd).toBeVisible()

    // Toast global visible por encima de las barras flotantes.
    // (race de hidratación: un tap antes de que React adjunte el handler se
    //  pierde sin efecto; reintenta una vez si el toast no aparece)
    const toast = page.getByText(/agregado al carrito/).first()
    await quickAdd.tap()
    try {
      await expect(toast).toBeVisible({ timeout: 2500 })
    } catch {
      await quickAdd.tap()
      await expect(toast).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe("móvil: grid — altura uniforme del quick-add Fase 2", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")
  test("las cards de una misma fila tienen la misma altura (agotadas y en stock)", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })

    // Espera reveal + hidratación: las cards del grid principal aparecen.
    const card = page.locator(".product-card").first()
    if ((await card.count()) === 0) {
      test.skip(true, "no hay productos en /cdmx (sin datos locales)")
      return
    }
    await expect(card).toBeVisible()
    await page.waitForTimeout(1200)

    // Agrupa por fila (mismo top) y compara alturas dentro de cada fila.
    const rows = await page.locator(".product-card").evaluateAll((els) => {
      const cards = els.map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        return { top: Math.round(r.top), h: Math.round(r.height) }
      })
      // Fila = mismo top (grid 2-col en móvil).
      const grouped = new Map<number, number[]>()
      for (const c of cards) {
        if (c.h > 0) {
          const list = grouped.get(c.top) ?? []
          list.push(c.h)
          grouped.set(c.top, list)
        }
      }
      return Array.from(grouped.entries())
        .filter(([, hs]) => hs.length > 1)
        .map(([top, hs]) => ({ top, min: Math.min(...hs), max: Math.max(...hs) }))
    })

    const misaligned = rows.filter((r) => r.max - r.min > 2)
    expect(misaligned, `filas con cards de distinta altura:\n${JSON.stringify(misaligned, null, 2)}`).toEqual([])
  })
})

// --- Fase 3: carrito táctil, checkout consistente y búsqueda en contexto ---

// Pulsa un botón quick-add y verifica que el ítem se registró de verdad en
// localStorage. La hidratación de React puede tardar tras el primer byte en un
// preview frío: reintenta hasta que el carrito se actualice (o agota intentos).
async function tapQuickAdd(page: Page, quickAdd: Locator): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await quickAdd.tap().catch(() => {})
    const registered = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("resurte_cart")
        if (!raw) return false
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed?.cart?.items) && parsed.cart.items.length > 0
      } catch {
        return false
      }
    })
    if (registered) return true
    await page.waitForTimeout(500)
  }
  return false
}

// Agrega el primer producto con quick-add para poblar el carrito persistido.
// (compartido por varios describe de Fase 3)
async function seedCart(page: Page): Promise<boolean> {
  await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
  const quickAdd = page.locator(".quick-add-btn").first()
  if ((await quickAdd.count()) === 0) return false
  await expect(quickAdd).toBeVisible()
  return tapQuickAdd(page, quickAdd)
}

// Los previews fríos re-renderizan durante la hidratación (el main pasa por un
// estado "Cargando productos..." que quita temporalmente los nodos). boundingBox
// puede volver null justo en esa ventana: reintenta hasta ~3s antes de fallar.
async function boundingBoxSettled(locator: Locator): Promise<{ x: number; y: number; width: number; height: number } | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const box = await locator.boundingBox()
    if (box) return box
    await locator.page().waitForTimeout(500)
  }
  return null
}

test.describe("móvil: carrito — touch-targets de conversión Fase 3", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  test("steppers y trash de /cart miden al menos 44px", async ({ page }) => {
    const hasData = await seedCart(page)
    test.skip(!hasData, "no hay productos en /cdmx (sin datos locales)")

    await page.goto("/cart", { waitUntil: "domcontentloaded" })
    // El trash del ítem.
    const trash = page.getByRole("button", { name: /^Eliminar / }).first()
    // Los steppers pueden no usar aria-label; validamos todos los .touch-target
    // del bloque de ítem y el trash por bounding box.
    const targets = await page.locator(".touch-target:not(.hidden)").evaluateAll((els) => {
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
    expect(targets, `touch-targets de /cart menores a 44px:\n${targets.join("\n")}`).toEqual([])

    // El trash tiene que existir (página con ítems).
    await expect(trash).toBeVisible()
  })

  test("el CTA de WhatsApp del checkout mide al menos 44px", async ({ page }) => {
    const hasData = await seedCart(page)
    test.skip(!hasData, "no hay productos en /cdmx (sin datos locales)")

    await page.goto("/cdmx/checkout", { waitUntil: "domcontentloaded" })

    // Paso 1: dirección — rellena el formulario guest y continúa.
    const street = page.getByPlaceholder("Av. Insurgentes Sur")
    await expect(street).toBeVisible()
    await street.fill("Av. Reforma")
    await page.getByPlaceholder("1234", { exact: true }).fill("100")
    await page.getByPlaceholder("Roma Norte").fill("Centro")
    await page.getByPlaceholder("06700").fill("06000")
    await page.getByPlaceholder("55 1234 5678").fill("5512345678")
    await page.getByRole("button", { name: "Continuar" }).tap()

    // Paso 2: schedule — elegir primer día y horario.
    const dateBtn = page.locator("button[aria-pressed]").first()
    await expect(dateBtn).toBeVisible()
    await dateBtn.tap()
    const timeBtn = page.getByRole("button", { name: /10:00 AM — 12:00 PM/ })
    await expect(timeBtn).toBeVisible()
    await timeBtn.tap()
    await page.getByRole("button", { name: "Continuar" }).tap()

    // Paso 3: review — CTA por WhatsApp.
    const whatsapp = page.getByRole("link", { name: /WhatsApp/i }).first()
    await expect(whatsapp).toBeVisible({ timeout: 3000 })
    const box = await whatsapp.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })
})

test.describe("móvil: checkout drawer — ancho consistente Fase 3", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  test("el checkout drawer alcanza un ancho generoso en tablets (sm:max-w-2xl)", async ({ page }) => {
    // Seed del carrito en viewport móvil, luego ampliamos a tablet.
    await page.setViewportSize({ width: 412, height: 915 })
    const hasData = await seedCart(page)
    test.skip(!hasData, "no hay productos en /cdmx (sin datos locales)")

    // Abrimos el checkout drawer desde la barra móvil en tablet.
    await page.setViewportSize({ width: 800, height: 900 })
    const cartBar = page.getByText(/Ver carrito ·/).filter({ visible: true }).first()
    await expect(cartBar).toBeVisible()
    await cartBar.tap()
    const checkoutBtn = page.getByRole("button", { name: /Ir a Checkout|Hacer Checkout/ }).first()
    await expect(checkoutBtn).toBeVisible()
    await checkoutBtn.tap()

    const drawer = page.getByRole("dialog", { name: /Checkout|Pago/ }).first()
    await expect(drawer).toBeVisible()
    const box = await drawer.boundingBox()
    expect(box).not.toBeNull()
    // sm:max-w-2xl = 672px; margen para el viewport y el padding del backdrop.
    expect(box!.width).toBeGreaterThanOrEqual(600)
  })
})

test.describe("móvil: búsqueda en contexto — overlay Fase 3", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  async function openSearchOverlay(page: Page): Promise<boolean> {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const searchBtn = page
      .getByRole("banner")
      .getByRole("button", { name: "Buscar productos" })
    if ((await searchBtn.count()) === 0) return false
    await expect(searchBtn).toBeVisible()
    const dialog = page.getByRole("dialog", { name: "Buscar productos" })
    // La hidratación de React puede no haber adjuntado el onClick aún (preview
    // frío); reintenta el tap hasta que el overlay se abra.
    for (let attempt = 0; attempt < 5; attempt++) {
      await searchBtn.tap().catch(() => {})
      if (await dialog.isVisible().catch(() => false)) return true
      await page.waitForTimeout(500)
    }
    return false
  }

  test("resultados del overlay permiten quick-add sin salir", async ({ page }) => {
    const opened = await openSearchOverlay(page)
    test.skip(!opened, "no hay botón de búsqueda en el header móvil")

    const dialog = page.getByRole("dialog", { name: "Buscar productos" })
    const input = dialog.getByPlaceholder("Buscar productos...")
    await input.fill("aguacate")
    const addBtn = dialog.getByRole("button", { name: /Agregar .* al carrito/ }).first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })

    const addBox = await addBtn.boundingBox()
    expect(addBox).not.toBeNull()
    expect(addBox!.width).toBeGreaterThanOrEqual(44)
    expect(addBox!.height).toBeGreaterThanOrEqual(44)

    await addBtn.tap()
    // El overlay sigue abierto y se muestra el toast.
    await expect(input).toBeVisible()
    await expect(page.getByText(/agregado al carrito/).first()).toBeVisible()
  })

  test("en móvil el cart bar ya no tiene 'Ver más productos' y la búsqueda abre desde el header", async ({ page }) => {
    const hasData = await seedCart(page)
    test.skip(!hasData, "no hay productos en /cdmx (sin datos locales)")

    // Fase 9: el botón del cart bar desapareció en móvil (redundante con el
    // StickyCatalogButton "Ver todos" y los links "Ver todo" por categoría).
    const verMas = page.getByRole("button", { name: "Ver más productos" })
    await expect(verMas).toHaveCount(0)

    // La búsqueda en contexto sigue disponible vía el icono de lupa del header:
    // abre el overlay en vivo sin navegar fuera.
    const opened = await openSearchOverlay(page)
    test.skip(!opened, "no se pudo abrir el overlay desde el header")
    const dialog = page.getByRole("dialog", { name: "Buscar productos" })
    await expect(dialog).toBeVisible({ timeout: 2000 })
    expect(page.url()).not.toContain("/buscar")
  })
})

// --- Fase 4: touch targets de micro-conversión y modales de pago ---

test.describe("móvil: micro-conversión — touch targets Fase 4", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  test("el stepper principal del producto mide al menos 44px", async ({ page }) => {
    // Descubre todos los enlaces de producto; el primer en stock (con stepper
    // in-page además del de la sticky bar) es el que se valida.
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const links = await page.getByRole("link").evaluateAll((els) =>
      els
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h) => h.includes("/producto/"))
    )
    test.skip(links.length === 0, "no hay enlace de producto en /cdmx (sin datos locales)")

    let stepperFound = false
    for (const href of links.slice(0, 6)) {
      await page.goto(href, { waitUntil: "domcontentloaded" })
      const increase = page.getByRole("button", { name: "Aumentar cantidad" })
      await expect(increase.first()).toBeVisible()
      // En stock => existen DOS steppers (in-page + sticky bar). El in-page
      // viene primero en el DOM; con un solo stepper el producto está agotado.
      if ((await increase.count()) < 2) continue

      const inPage = increase.first()
      const decrease = page.getByRole("button", { name: "Disminuir cantidad" }).first()
      for (const btn of [decrease, inPage]) {
        const box = await btn.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.width).toBeGreaterThanOrEqual(44)
        expect(box!.height).toBeGreaterThanOrEqual(44)
      }
      stepperFound = true
      break
    }
    test.skip(!stepperFound, "sin producto en stock en /cdmx")
  })

  test("el botón cerrar del checkout drawer mide al menos 44px", async ({ page }) => {
    const hasData = await seedCart(page)
    test.skip(!hasData, "no hay productos en /cdmx (sin datos locales)")

    const cartBar = page.getByText(/Ver carrito ·/).filter({ visible: true }).first()
    await expect(cartBar).toBeVisible()
    await cartBar.tap()
    const checkoutBtn = page.getByRole("button", { name: /Ir a Checkout|Hacer Checkout/ }).first()
    await expect(checkoutBtn).toBeVisible()
    await checkoutBtn.tap()

    const dialog = page.getByRole("dialog", { name: /Checkout|Pago/ }).first()
    await expect(dialog).toBeVisible()
    const close = dialog.getByRole("button", { name: "Cerrar checkout" })
    await expect(close).toBeVisible()
    const box = await close.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test("chips de categoría y select de orden de /buscar miden al menos 44px", async ({ page }) => {
    await page.goto("/cdmx/buscar", { waitUntil: "domcontentloaded" })
    const todoChip = page.getByRole("button", { name: /Todo/ }).first()
    await expect(todoChip).toBeVisible()

    const selectWrap = page.locator(".touch-target", {
      has: page.getByRole("combobox", { name: "Ordenar resultados" }),
    })
    await expect(selectWrap).toBeVisible()

    // Todos los .touch-target visibles de la página de búsqueda >= 44px
    // (chips de categoría, filtro activo y contenedor del select).
    // Nota: se excluyen los que aún no están revelados (el wrapper ScrollReveal
    // direction="scale" de cada card bajo el pliegue conserva opacity 0 + scale
    // 0.94 → bounding box 154x41, falso positivo). El filtro mira opacity del
    // propio elemento y de TODOS sus ancestros: solo cuenta los plenamente visibles.
    const targets = await page.locator(".touch-target:not(.hidden)").evaluateAll((els) => {
      const fullyVisible = (node: Element): boolean => {
        let el: Element | null = node
        while (el) {
          if (getComputedStyle(el).opacity !== "1") return false
          el = el.parentElement
        }
        return true
      }
      const failures: string[] = []
      for (const el of els) {
        if (!fullyVisible(el)) continue
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
          failures.push(`${Math.round(r.width)}x${Math.round(r.height)} — ${(el.className as string).slice(0, 60)}`)
        }
      }
      return failures
    })
    expect(targets, `touch-targets de /buscar menores a 44px:\n${targets.join("\n")}`).toEqual([])

    const todoBox = await boundingBoxSettled(todoChip)
    const selectBox = await boundingBoxSettled(selectWrap)
    expect(todoBox).not.toBeNull()
    expect(selectBox).not.toBeNull()
    expect(todoBox!.height).toBeGreaterThanOrEqual(44)
    expect(selectBox!.height).toBeGreaterThanOrEqual(44)
  })

  test("inputs y botones del formulario de auth miden al menos 44px", async ({ page }) => {
    await page.goto("/auth/login", { waitUntil: "domcontentloaded" })
    const email = page.getByPlaceholder("tu@correo.com")
    const password = page.getByPlaceholder("••••••")
    const submit = page.getByRole("button", { name: "Iniciar Sesión" })
    const google = page.getByRole("button", { name: /Continuar con Google/ })
    await expect(email).toBeVisible()
    await expect(password).toBeVisible()
    await expect(submit).toBeVisible()
    await expect(google).toBeVisible()

    for (const el of [email, password, submit, google]) {
      const box = await boundingBoxSettled(el)
      expect(box, `boundingBox null para: ${await el.getAttribute("type") || await el.getAttribute("name") || (await el.textContent())?.slice(0, 20)}`).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })

  // ===== Fase 5: back arrows de cuenta, chips de ciudad y onboarding de recompensas =====

  // El back arrow de mis-pedidos (único alcanzable sin sesión) mide >= 44px.
  test("el back arrow de mis-pedidos mide al menos 44px", async ({ page }) => {
    await page.goto("/cdmx/mis-pedidos", { waitUntil: "domcontentloaded" })
    const back = page.getByRole("link", { name: "Volver a inicio" })
    await expect(back).toBeVisible({ timeout: 5000 })
    const box = await boundingBoxSettled(back)
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  // Los chips de categoría del catálogo de ciudad (con touch-target) miden >= 44px.
  test("los chips de categoría de la ciudad miden al menos 44px", async ({ page }) => {
    await page.goto("/catalogo/cdmx", { waitUntil: "domcontentloaded" })
    const todoChip = page.getByRole("button", { name: "Todos", exact: true }).first()
    await expect(todoChip).toBeVisible()
    const todoBox = await todoChip.boundingBox()
    expect(todoBox).not.toBeNull()
    expect(todoBox!.height).toBeGreaterThanOrEqual(44)

    // Al menos un chip de categoría con touch-target visible mide >= 44px.
    const catChips = await page.locator(".touch-target:not(.hidden)", { hasText: /^[A-ZÁÉÍÓÚÑ]/ }).evaluateAll((els) => {
      const fullyVisible = (node: Element): boolean => {
        let el: Element | null = node
        while (el) {
          if (getComputedStyle(el).opacity !== "1") return false
          el = el.parentElement
        }
        return true
      }
      return els
        .filter(fullyVisible)
        .map((el) => (el as HTMLElement).getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
    })
    expect(catChips.length).toBeGreaterThan(0)
    for (const r of catChips) {
      expect(r.height).toBeGreaterThanOrEqual(44)
    }
  })

  // El onboarding de recompensas (visible para no autenticados) expone botones
  // con touch-target >= 44px. Se avanza por los 4 pasos para llegar al último
  // (donde aparecen "Crear cuenta gratis" / "Iniciar sesión").
  test("el onboarding de recompensas tiene touch-targets de al menos 44px", async ({ page }) => {
    await page.goto("/recompensas", { waitUntil: "domcontentloaded" })

    // El onboarding aparece para usuarios sin sesión. "Continuar" existe en los
    // pasos 0-2; se avanza hasta el paso final (step 3).
    const continuar = page.getByRole("button", { name: /Continuar/ })
    await expect(continuar).toBeVisible({ timeout: 10000 })
    for (let i = 0; i < 3; i++) {
      await continuar.tap()
      await page.waitForTimeout(600) // transición AnimatePresence (mode="wait")
      await expect(page.getByRole("button", { name: /Continuar/ }).or(page.getByRole("button", { name: /Crear cuenta gratis/ }))).toBeVisible()
    }

    // Paso final (no autenticado): "Crear cuenta gratis" (py-4) + "Iniciar sesión"
    // (touch-target py-2). Ambos deben medir >= 44px de alto.
    const login = page.getByRole("button", { name: /Iniciar sesión/ })
    await expect(login).toBeVisible()
    const createAccount = page.getByRole("button", { name: /Crear cuenta gratis/ })
    await expect(createAccount).toBeVisible()
    for (const btn of [login, createAccount]) {
      const box = await btn.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })
})

// --- Fase 6: storefront /r/[slug] y SearchBar de colecciones ---

test.describe("móvil: storefront — touch targets Fase 6", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  // Descubre el primer storefront `/r/[slug]` disponible desde el directorio
  // `/comer`. Si no hay restaurantes registrados, el test se salta. Reintenta
  // porque en preview frío los links pueden tardar en hidratarse.
  async function discoverStorefront(page: Page): Promise<string | null> {
    await page.goto("/comer", { waitUntil: "domcontentloaded" })
    for (let attempt = 0; attempt < 5; attempt++) {
      const href = await page
        .getByRole("link")
        .evaluateAll((els) => {
          const a = els.find((el) =>
            (el as HTMLAnchorElement).href.includes("/r/")
          )
          return a ? (a as HTMLAnchorElement).href : null
        })
      if (href) return href
      await page.waitForTimeout(500)
    }
    return null
  }

  // El banner de cookies (fixed bottom, z-60) cubre el cart bar del storefront
  // en contextos nuevos. Se acepta para liberar la parte inferior de la vista.
  // Aparece con un delay de 800ms tras cargar, así que espera hasta 4s.
  async function dismissCookieBanner(page: Page): Promise<void> {
    const accept = page.getByRole("button", { name: "Aceptar todas" })
    try {
      await accept.waitFor({ state: "visible", timeout: 4000 })
      await accept.tap().catch(() => {})
    } catch {
      // Sin banner (consent ya almacenado) — OK.
    }
  }

  // Agrega un ítem del menú real reintentando hasta que el cart bar "Ver pedido
  // (N)" aparezca (la hidratación de React en preview frío puede ignorar el tap).
  async function tapStorefrontAdd(page: Page, addBtn: Locator): Promise<boolean> {
    const verPedido = page.getByRole("button", { name: /Ver pedido \(\d+\)/ })
    for (let attempt = 0; attempt < 5; attempt++) {
      await addBtn.tap().catch(() => {})
      if (await verPedido.isVisible().catch(() => false)) return true
      await page.waitForTimeout(500)
    }
    return false
  }

  test("el add button del menú real mide al menos 44px", async ({ page }) => {
    const href = await discoverStorefront(page)
    test.skip(!href, "no hay storefronts registrados en /comer")
    const storefrontUrl = href!

    await page.goto(storefrontUrl, { waitUntil: "domcontentloaded" })
    await dismissCookieBanner(page)
    const addBtn = page.getByRole("button", { name: /^Agregar / }).first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    // Retry anti-race: tras hidratación el nodo puede re-renderizarse entre
    // toBeVisible y boundingBox (devolvía null en preview frío).
    let box: { width: number; height: number } | null = null
    for (let attempt = 0; attempt < 5 && !box; attempt++) {
      box = await addBtn.boundingBox()
      if (!box) await page.waitForTimeout(500)
    }
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test("los steppers del checkout del storefront miden al menos 44px", async ({ page }) => {
    const href = await discoverStorefront(page)
    test.skip(!href, "no hay storefronts registrados en /comer")
    const storefrontUrl = href!

    await page.goto(storefrontUrl, { waitUntil: "domcontentloaded" })
    await dismissCookieBanner(page)
    const addBtn = page.getByRole("button", { name: /^Agregar / }).first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    const added = await tapStorefrontAdd(page, addBtn)
    test.skip(!added, "no se pudo agregar ítem del storefront")

    // El banner de cookies aparece con delay; re-dismiss antes del tap inferior.
    await dismissCookieBanner(page)

    // El cart bar "Ver pedido (N)" aparece al agregar; lleva al checkout.
    const verPedido = page.getByRole("button", { name: /Ver pedido \(\d+\)/ })
    await expect(verPedido).toBeVisible({ timeout: 5000 })
    await verPedido.tap()

    const menos = page.getByRole("button", { name: "Menos" }).first()
    const mas = page.getByRole("button", { name: "Más" }).first()
    await expect(menos).toBeVisible({ timeout: 5000 })
    for (const btn of [menos, mas]) {
      const box = await btn.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })

  test("el cart bar del storefront es fijo y visible al agregar", async ({ page }) => {
    const href = await discoverStorefront(page)
    test.skip(!href, "no hay storefronts registrados en /comer")
    const storefrontUrl = href!

    await page.goto(storefrontUrl, { waitUntil: "domcontentloaded" })
    await dismissCookieBanner(page)
    const addBtn = page.getByRole("button", { name: /^Agregar / }).first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    const added = await tapStorefrontAdd(page, addBtn)
    test.skip(!added, "no se pudo agregar ítem del storefront")

    const verPedido = page.getByRole("button", { name: /Ver pedido \(\d+\)/ })
    await expect(verPedido).toBeVisible({ timeout: 5000 })
    // La barra inferior (con safe-area) es fixed bottom-0.
    const position = await verPedido.evaluate((el) => {
      const bar = el.closest(".fixed.bottom-0")
      if (!bar) return null
      const style = getComputedStyle(bar)
      const rect = bar.getBoundingClientRect()
      return {
        position: style.position,
        bottom: style.bottom,
        insetFromViewportBottom: window.innerHeight - rect.bottom,
      }
    })
    expect(position).not.toBeNull()
    expect(position!.position).toBe("fixed")
    expect(position!.bottom).toBe("0px")
    expect(position!.insetFromViewportBottom).toBeLessThanOrEqual(1)
  })
})

test.describe("móvil: colecciones — SearchBar abre overlay Fase 6", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  // La búsqueda de una colección en móvil debe abrir el overlay en vivo (patrón
  // categorías), no navegar a /{city}/buscar.
  test("la SearchBar de una colección abre el overlay en móvil", async ({ page }) => {
    // Descubre el primer enlace de colección desde la landing de la ciudad.
    // Reintenta por hidratación lenta en preview frío.
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    let href: string | null = null
    for (let attempt = 0; attempt < 5 && !href; attempt++) {
      href = await page
        .getByRole("link")
        .evaluateAll((els) => {
          const a = els.find((el) =>
            (el as HTMLAnchorElement).href.includes("/coleccion/")
          )
          return a ? (a as HTMLAnchorElement).href : null
        })
      if (!href) await page.waitForTimeout(500)
    }
    test.skip(!href, "no hay colecciones en /cdmx")
    const collectionUrl = href!

    await page.goto(collectionUrl, { waitUntil: "domcontentloaded" })
    // El header desktop (hidden md:block) comparte placeholder; scope al <main>.
    const input = page.locator("main").getByPlaceholder("Buscar productos...").first()
    await expect(input).toBeVisible({ timeout: 5000 })

    // Tap en el input → overlay de búsqueda en vivo (dialog), sin navegación.
    const dialog = page.getByRole("dialog", { name: "Buscar productos" })
    for (let attempt = 0; attempt < 5; attempt++) {
      await input.tap().catch(() => {})
      if (await dialog.isVisible().catch(() => false)) break
      await page.waitForTimeout(500)
    }
    await expect(dialog).toBeVisible({ timeout: 2000 })
    expect(page.url()).not.toContain("/buscar")
  })
})

// --- Fase 7: quick-add a la misma altura + cero solapes en sticky bottom ---

test.describe("móvil: Fase 7 — quick-add uniforme y sin solapes", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  // El banner de cookies (fixed bottom, z-60) cubre el cart bar del storefront
  // en contextos nuevos. Se acepta para liberar la parte inferior de la vista.
  async function dismissCookieBanner(page: Page): Promise<void> {
    const accept = page.getByRole("button", { name: "Aceptar todas" })
    try {
      await accept.waitFor({ state: "visible", timeout: 4000 })
      await accept.tap().catch(() => {})
    } catch {
      // Sin banner (consent ya almacenado) — OK.
    }
  }

  // Agrega un ítem del menú real reintentando hasta que el cart bar "Ver pedido
  // (N)" aparezca (la hidratación de React en preview frío puede ignorar el tap).
  async function tapStorefrontAdd(page: Page, addBtn: Locator): Promise<boolean> {
    const verPedido = page.getByRole("button", { name: /Ver pedido \(\d+\)/ })
    for (let attempt = 0; attempt < 5; attempt++) {
      await addBtn.tap().catch(() => {})
      if (await verPedido.isVisible().catch(() => false)) return true
      await page.waitForTimeout(500)
    }
    return false
  }

  // Los botones quick-add de una misma fila del grid (mismo top) deben quedar
  // a la misma altura vertical (mismo boundingBox.y ± 2px). Esto valida que el
  // card sea flex-col con el botón anclado al fondo (7A).
  test("los quick-add de una misma fila están a la misma altura", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const quickAdd = page.locator(".quick-add-btn").first()
    if ((await quickAdd.count()) === 0) {
      test.skip(true, "no hay productos en /cdmx (sin datos locales)")
      return
    }
    await expect(quickAdd).toBeVisible()
    await page.waitForTimeout(1200) // reveal + hidratación

    const rows = await page.locator(".product-card").evaluateAll((els) => {
      const buttons = els
        .map((card) => card.querySelector(".quick-add-btn"))
        .filter(Boolean) as HTMLElement[]
      const rowsMap = new Map<number, number[]>()
      for (const btn of buttons) {
        const r = btn.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          const top = Math.round(r.top)
          const list = rowsMap.get(top) ?? []
          list.push(r.top)
          rowsMap.set(top, list)
        }
      }
      return Array.from(rowsMap.entries())
        .filter(([, tops]) => tops.length > 1)
        .map(([top, tops]) => ({ top, min: Math.min(...tops), max: Math.max(...tops) }))
    })

    const misaligned = rows.filter((r) => r.max - r.min > 2)
    expect(misaligned, `filas con quick-add a distinta altura:\n${JSON.stringify(misaligned, null, 2)}`).toEqual([])
  })

  // Al agregar un ítem en el storefront, body.cart-bar-active se activa y los
  // flotantes (WhatsApp) quedan por encima de la barra "Ver pedido (N)" (7B).
  test("el storefront sube los flotantes por encima de su cart bar (cart-bar-active)", async ({ page }) => {
    await page.goto("/comer", { waitUntil: "domcontentloaded" })
    let href: string | null = null
    for (let attempt = 0; attempt < 5 && !href; attempt++) {
      href = await page
        .getByRole("link")
        .evaluateAll((els) => {
          const a = els.find((el) => (el as HTMLAnchorElement).href.includes("/r/"))
          return a ? (a as HTMLAnchorElement).href : null
        })
      if (!href) await page.waitForTimeout(500)
    }
    test.skip(!href, "no hay storefronts registrados en /comer")
    const storefrontUrl = href!

    await page.goto(storefrontUrl, { waitUntil: "domcontentloaded" })
    await dismissCookieBanner(page)
    const addBtn = page.getByRole("button", { name: /^Agregar / }).first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    const added = await tapStorefrontAdd(page, addBtn)
    test.skip(!added, "no se pudo agregar ítem del storefront")

    // La barra aparece y body.cart-bar-active debe estar activo.
    const verPedido = page.getByRole("button", { name: /Ver pedido \(\d+\)/ })
    await expect(verPedido).toBeVisible({ timeout: 5000 })
    await expect
      .poll(async () => page.evaluate(() => document.body.classList.contains("cart-bar-active")), { timeout: 5000 })
      .toBe(true)

    // El WhatsApp flotante queda por encima de la barra (no se solapan).
    const whatsapp = page.locator(".whatsapp-floating")
    if ((await whatsapp.count()) > 0 && (await whatsapp.isVisible().catch(() => false))) {
      const barBox = await verPedido.boundingBox()
      const waBox = await whatsapp.boundingBox()
      expect(barBox).not.toBeNull()
      expect(waBox).not.toBeNull()
      expect(waBox!.y + waBox!.height).toBeLessThanOrEqual(barBox!.y + 2)
    }
  })

  // Mientras el banner de cookies está visible, los flotantes del fondo se
  // ocultan para que la franja ancha no intercepte taps (7B).
  test("el cookie banner oculta los flotantes mientras está visible", async ({ page }) => {
    // localStorage limpio en este contexto → el banner aparece tras 800ms.
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const accept = page.getByRole("button", { name: "Aceptar todas" })
    await expect(accept).toBeVisible({ timeout: 5000 })

    const state = await page.evaluate(() => {
      const displayOf = (sel: string): boolean | "no-element" => {
        const el = document.querySelector(sel) as HTMLElement | null
        if (!el) return "no-element"
        return getComputedStyle(el).display === "none"
      }
      return {
        cookieVisible: document.body.classList.contains("cookie-consent-visible"),
        whatsappHidden: displayOf(".whatsapp-floating"),
        catalogHidden: displayOf(".sticky-catalog-button"),
      }
    })
    expect(state.cookieVisible).toBe(true)
    if (state.whatsappHidden !== "no-element") expect(state.whatsappHidden).toBe(true)
    if (state.catalogHidden !== "no-element") expect(state.catalogHidden).toBe(true)

    // Al aceptar, el banner desaparece y la clase se quita.
    await accept.tap()
    await expect(accept).toBeHidden()
    const after = await page.evaluate(() => document.body.classList.contains("cookie-consent-visible"))
    expect(after).toBe(false)
  })

  // En la app Recompensas el BottomTabBar es el elemento inferior; el FAB de
  // WhatsApp global se oculta en móvil (7B). Solo aplica con sesión autenticada
  // (sin sesión la app muestra onboarding sin tab bar).
  test("en recompensas el FAB de WhatsApp se oculta (bottom tab bar)", async ({ page }) => {
    await page.goto("/recompensas", { waitUntil: "domcontentloaded" })
    const tabBar = page.locator("nav.fixed")
    if ((await tabBar.count()) === 0) {
      test.skip(true, "sin sesión: onboarding de recompensas sin tab bar")
      return
    }
    await expect(tabBar.first()).toBeVisible({ timeout: 5000 })

    const hidden = await page.evaluate(() => {
      const el = document.querySelector(".whatsapp-floating") as HTMLElement | null
      if (!el) return "no-element"
      return getComputedStyle(el).display === "none"
    })
    if (hidden !== "no-element") expect(hidden).toBe(true)
  })

  // Los botones del cookie banner y su close deben medir >= 44px (7C).
  test("los botones del cookie banner miden al menos 44px", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const accept = page.getByRole("button", { name: "Aceptar todas" })
    await expect(accept).toBeVisible({ timeout: 5000 })
    const essential = page.getByRole("button", { name: "Solo necesarias" })
    const close = page.getByRole("button", { name: "Cerrar" })
    for (const btn of [accept, essential, close]) {
      const box = await btn.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })
})

// --- Fase 8: homepage móvil — h2 en una línea, cart bar apilada y jerarquía ---

test.describe("móvil: Fase 8 — h2 sin saltos de línea y cart bar sin empalmes", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  // El banner de cookies (fixed bottom) cubre el cart bar en contextos nuevos;
  // se acepta para liberar la parte inferior de la vista antes de medir.
  async function dismissCookieBanner(page: Page): Promise<void> {
    const accept = page.getByRole("button", { name: "Aceptar todas" })
    try {
      await accept.waitFor({ state: "visible", timeout: 4000 })
      await accept.tap().catch(() => {})
    } catch {
      // Sin banner (consent ya almacenado) — OK.
    }
  }

  // En móvil (<640px) el MobileCartBar apila dos filas: "Ver más productos"
  // arriba en su propia fila, y "Ver carrito · $total" + "Hacer Checkout"
  // debajo — sin solapes ni empalmes (8B).
  test("en móvil el cart bar es una fila sin 'Ver más productos' ni solapes", async ({ page }) => {
    const hasData = await seedCart(page)
    test.skip(!hasData, "no hay productos en /cdmx")
    await dismissCookieBanner(page)

    // Fase 9: "Ver más productos" ya NO aparece en móvil (redundante con el
    // StickyCatalogButton "Ver todos" y los links "Ver todo"). La barra es
    // una sola fila: "Ver carrito · $total" + "Hacer Checkout".
    const verMas = page.getByRole("button", { name: "Ver más productos" })
    await expect(verMas).toHaveCount(0)

    const checkout = page.getByRole("button", { name: "Hacer Checkout" })
    const verCarrito = page.getByRole("button", { name: /Ver carrito/ })
    await expect(checkout).toBeVisible({ timeout: 5000 })
    await expect(verCarrito).toBeVisible({ timeout: 5000 })

    const checkoutBox = await checkout.boundingBox()
    const carritoBox = await verCarrito.boundingBox()
    expect(checkoutBox).not.toBeNull()
    expect(carritoBox).not.toBeNull()

    // Misma fila (misma línea base) y sin solape horizontal.
    expect(Math.abs(carritoBox!.y - checkoutBox!.y)).toBeLessThanOrEqual(4)
    expect(carritoBox!.x + carritoBox!.width).toBeLessThanOrEqual(checkoutBox!.x + 1)

    // Targets táctiles >= 44px.
    expect(checkoutBox!.height).toBeGreaterThanOrEqual(44)
    expect(carritoBox!.height).toBeGreaterThanOrEqual(44)
  })

  // A 320px con ítems en el carrito, la página no desborda horizontalmente (8B).
  test("sin overflow horizontal a 320px con carrito lleno", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    const hasData = await seedCart(page)
    test.skip(!hasData, "no hay productos en /cdmx")
    await dismissCookieBanner(page)
    await expect(page.getByRole("button", { name: "Hacer Checkout" })).toBeVisible({ timeout: 5000 })

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      const body = document.body
      return {
        doc: doc.scrollWidth - doc.clientWidth,
        body: body.scrollWidth - body.clientWidth,
      }
    })
    expect(overflow.doc, "overflow horizontal del document a 320px").toBeLessThanOrEqual(1)
    expect(overflow.body, "overflow horizontal del body a 320px").toBeLessThanOrEqual(1)
  })

  // El H2 "Todo lo que tu cocina necesita" (categorías y catálogo) mide una
  // sola línea en el viewport móvil tras la escala text-2xl + text-balance (8A).
  test("el H2 'Todo lo que tu cocina necesita' queda en una sola línea en móvil", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200) // reveal + hidratación
    const lines = await page
      .getByRole("heading", { name: "Todo lo que tu cocina necesita" })
      .evaluateAll((els) =>
        els.map((el) => {
          const range = document.createRange()
          range.selectNodeContents(el)
          return range.getClientRects().length
        })
      )
    expect(lines.length, "no se encontró el H2").toBeGreaterThan(0)
    expect(lines, "el H2 rompe en más de una línea").toEqual(lines.map(() => 1))
  })
})

// ===== Fase 9 — placeholder de búsqueda animado (marquee) =====
// El hint "Buscar frutas, verduras, carnes, abarrotes..." se anima en móvil
// para alcanzar a leerse completo. Solo visible con input vacío y sin foco.
test.describe("Fase 9: placeholder animado de búsqueda", () => {
  test("el marquee del catálogo está visible y animado con input vacío", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200) // reveal + hidratación

    const input = page.locator("#catalog-search")
    await expect(input).toBeVisible({ timeout: 5000 })
    const marquee = input.locator("+ .marquee-placeholder")
    await expect(marquee).toBeVisible()

    const anim = await marquee.evaluate((el) => getComputedStyle(el).animationName)
    expect(anim, "el marquee debería animar en móvil").not.toBe("none")
  })

  test("el marquee desaparece al enfocar o escribir", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200)

    const input = page.locator("#catalog-search")
    const marquee = input.locator("+ .marquee-placeholder")

    // Al enfocar (sin escribir) el placeholder se oculta.
    await input.focus()
    await expect(marquee).toBeHidden()

    // Al escribir se oculta también.
    await input.fill("aguacate")
    await expect(marquee).toBeHidden()

    // Al vaciar y quitar el foco vuelve.
    await input.fill("")
    await input.blur()
    await expect(marquee).toBeVisible()
  })
})

// ===== Fase 10 — quick-add despegado/compacto, cards a misma altura y
// "Hecho para ti" en 2 columnas =====
test.describe("Fase 10 móvil: botones Agregar y grid de catálogo", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  test("en /buscar las cards y los botones Agregar quedan a la misma altura por fila", async ({ page }) => {
    await page.goto("/cdmx/buscar", { waitUntil: "domcontentloaded" })
    const card = page.locator(".product-card").first()
    if ((await card.count()) === 0) {
      test.skip(true, "no hay productos en /cdmx/buscar (sin datos locales)")
      return
    }
    await expect(card).toBeVisible()
    await page.waitForTimeout(1500) // reveal + hidratación

    // Agrupa quick-adds por fila (mismo top) y compara su bottom dentro de la fila.
    const rows = await page.locator(".quick-add-btn").evaluateAll((els) => {
      const btns = els.map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
      })
      const grouped = new Map<number, number[]>()
      for (const b of btns) {
        if (b.bottom - b.top > 0) {
          const list = grouped.get(b.top) ?? []
          list.push(b.bottom)
          grouped.set(b.top, list)
        }
      }
      return Array.from(grouped.entries())
        .filter(([, bs]) => bs.length > 1)
        .map(([top, bs]) => ({ top, min: Math.min(...bs), max: Math.max(...bs) }))
    })

    const misaligned = rows.filter((r) => r.max - r.min > 2)
    expect(
      misaligned,
      `filas con quick-adds a distinta altura en /buscar:\n${JSON.stringify(misaligned, null, 2)}`,
    ).toEqual([])
  })

  test("el botón Agregar queda despegado del box y mide al menos 44px", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const quickAdd = page.locator(".quick-add-btn").first()
    if ((await quickAdd.count()) === 0) {
      test.skip(true, "no hay quick-adds en /cdmx (sin datos locales)")
      return
    }
    await expect(quickAdd).toBeVisible()
    await page.waitForTimeout(1500) // reveal + hidratación

    const box = await boundingBoxSettled(quickAdd)
    expect(box, "quick-add sin bounding box").not.toBeNull()
    expect(box!.height, "touch-target 44px").toBeGreaterThanOrEqual(44)

    // El box del producto es el Link (ancestro inmediato).
    const card = quickAdd.locator("xpath=..")
    const link = card.locator("a").first()
    const linkBox = await boundingBoxSettled(link)
    expect(linkBox, "box del producto sin bounding box").not.toBeNull()

    // El botón arranca al menos 6px debajo del borde inferior del box.
    const gap = Math.round((box!.y - (linkBox!.y + linkBox!.height)) * 10) / 10
    expect(gap, `gap entre box y botón Agregar (${gap}px)`).toBeGreaterThanOrEqual(6)
  })

  test("la sección 'Hecho para ti' se muestra en 2 columnas en móvil", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const heading = page.getByRole("heading", { name: "¿Para quién es?" })
    await expect(heading).toBeVisible({ timeout: 8000 })

    const section = page.locator("section").filter({ has: heading })
    const cards = section.locator("div.grid > div")
    await expect(cards).toHaveCount(4)

    const tops = await cards.evaluateAll((els) =>
      els.map((el) => Math.round((el as HTMLElement).getBoundingClientRect().top)),
    )
    const firstRowCount = tops.filter((t) => t === tops[0]).length
    expect(firstRowCount, `primera fila debería tener 2 cards (tops: ${tops.join(", ")})`).toBe(2)
    expect(tops[2] ?? 0, "el 3er card debe ir en la segunda fila").toBeGreaterThan(tops[0] ?? 0)
  })
})

// ===== Fase 11 — footer en 2 columnas (como tablet) y lectura móvil =====
test.describe("Fase 11 móvil: footer 2 columnas y tamaños de texto", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  test("el footer muestra el bloque de marca arriba y los links en 2 filas de 2", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200) // reveal + hidratación

    const footer = page.locator("footer.site-footer")
    await expect(footer).toBeVisible({ timeout: 5000 })
    const grid = footer.locator("div.grid").first()
    const h2s = grid.locator("h2")
    await expect(h2s).toHaveCount(4)

    const tops = await h2s.evaluateAll((els) =>
      els.map((el) => Math.round((el as HTMLElement).getBoundingClientRect().top)),
    )

    // Primera fila: dos h2 comparten top; segunda fila: los otros dos empiezan más abajo.
    const firstRowTop = tops[0]
    const firstRow = tops.filter((t) => t === firstRowTop)
    expect(firstRow.length, `fila 1 debería tener 2 h2 (tops: ${tops.join(", ")})`).toBe(2)

    const row2Top = tops.find((t) => t > (firstRowTop ?? -1))
    expect(row2Top, "debería existir una segunda fila").toBeDefined()
    const secondRow = tops.filter((t) => row2Top !== undefined && t === row2Top)
    expect(secondRow.length, `fila 2 debería tener 2 h2 (tops: ${tops.join(", ")})`).toBe(2)
    expect(
      tops.filter((t) => t !== firstRowTop && row2Top !== undefined && t !== row2Top),
      "no deberían sobrar h2 sueltos",
    ).toEqual([])

    // El bloque de marca está arriba, a ancho completo (ocupa 2 columnas).
    const brand = grid.locator("> div").first()
    const brandBox = await brand.boundingBox()
    const firstNavBox = await grid.locator("> nav").first().boundingBox()
    expect(brandBox, "marca sin bounding box").not.toBeNull()
    expect(firstNavBox, "nav sin bounding box").not.toBeNull()
    expect(brandBox!.y + brandBox!.height, "la marca debe quedar arriba de los links").toBeLessThanOrEqual(
      firstNavBox!.y + 1,
    )
    expect(
      brandBox!.width / firstNavBox!.width,
      "la marca debe ocupar ~2 columnas (no una)",
    ).toBeGreaterThan(1.8)
  })

  test("el hero kicker mide al menos 12px y el tagline de card al menos 11px", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200) // reveal + hidratación

    // Hero kicker — el label uppercase del hero.
    const kicker = page.getByText("Proveeduría inteligente para tu cocina")
    await expect(kicker).toBeVisible({ timeout: 5000 })
    const kickerPx = await kicker.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(kickerPx, `kicker del hero debería ser ≥12px (es ${kickerPx}px)`).toBeGreaterThanOrEqual(12)

    // Tagline de card — p italic line-clamp-1 dentro de .product-card.
    const tagline = page.locator(".product-card .line-clamp-1.italic").first()
    if ((await tagline.count()) === 0) {
      test.skip(true, "no hay product-cards en /cdmx (sin datos locales)")
      return
    }
    await expect(tagline).toBeVisible()
    const taglinePx = await tagline.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(taglinePx, `tagline de card debería ser ≥11px (es ${taglinePx}px)`).toBeGreaterThanOrEqual(11)
  })
})

test.describe("Fase 12 móvil: tamaños de texto de lectura (13px)", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  // Helper: comprueba que el computed font-size de un locator visible es ≥13px.
  async function expectFontGe13(page: Page, locator: Locator, label: string): Promise<void> {
    if ((await locator.count()) === 0) {
      test.skip(true, `sin elemento para: ${label}`)
      return
    }
    await expect(locator.first()).toBeVisible({ timeout: 5000 })
    const px = await locator.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(px, `${label} debería ser ≥13px (es ${px}px)`).toBeGreaterThanOrEqual(13)
  }

  test("homepage: labels de stats, contador, Ver todo, subtexto CTA y fine print ≥13px", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200) // reveal + hidratación

    await expectFontGe13(page, page.getByText("Negocios abastecidos").first(), "stat label")
    await expectFontGe13(page, page.getByText(/\d+ productos$/).first(), "contador de productos")
    await expectFontGe13(page, page.getByText("Ver todo", { exact: true }).first(), "link Ver todo")
    await expectFontGe13(
      page,
      page.getByText(/Más de 500 restaurantes/).first(),
      "subtexto CTA recompensas",
    )
    await expectFontGe13(
      page,
      page.getByText(/Sin spam. Solo actualizaciones de precios/).first(),
      "fine print newsletter",
    )
  })

  test("carrito: brand del ítem, cross-sell y Seguir comprando ≥13px", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const quickAdd = page.locator(".quick-add-btn").first()
    if ((await quickAdd.count()) === 0) {
      test.skip(true, "no hay productos en /cdmx (sin datos locales)")
      return
    }
    await expect(quickAdd).toBeVisible()
    if (!(await tapQuickAdd(page, quickAdd))) {
      test.skip(true, "no se pudo agregar al carrito")
      return
    }
    const cartBar = page.getByText(/Ver carrito ·/).filter({ visible: true }).first()
    await expect(cartBar).toBeVisible()
    await cartBar.tap()
    await expect(page.getByRole("heading", { name: "Mi Carrito" })).toBeVisible()

    // Brand del ítem — primer p secundario bajo el nombre del producto.
    const brand = page.locator('p[class*="text-[13px]"][class*="--text-secondary"]').first()
    if ((await brand.count()) > 0) {
      await expectFontGe13(page, brand, "brand del ítem")
    }

    // Cross-sell: descripción bajo "Restaurantes también compran".
    const crossSell = page.getByText(/Complementa tu pedido con/).first()
    await expectFontGe13(page, crossSell, "desc cross-sell")

    await expectFontGe13(page, page.getByText("← Seguir comprando").first(), "Seguir comprando")
  })

  test("búsqueda: contadores de categoría ≥13px", async ({ page }) => {
    await page.goto("/cdmx/buscar", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200)

    const chips = page.locator("button").filter({ hasText: /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ ]+ \d+$/ }).first()
    if ((await chips.count()) > 0) {
      const countSpan = chips.locator("span")
      if ((await countSpan.count()) > 0) {
        await expectFontGe13(page, countSpan.first(), "contador de categoría")
      }
    }
  })

  test("producto: nota de stock, info de envío y Total ≥13px", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    const firstCard = page.locator(".product-card a[href*='/producto/']").first()
    if ((await firstCard.count()) === 0) {
      test.skip(true, "no hay product-cards en /cdmx (sin datos locales)")
      return
    }
    const href = await firstCard.getAttribute("href")
    await page.goto(href!, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200)

    // El banner de cookies (z-60) oculta el sticky ATC mientras es visible.
    const accept = page.getByRole("button", { name: "Aceptar todas" })
    try {
      await accept.waitFor({ state: "visible", timeout: 4000 })
      await accept.tap().catch(() => {})
      await page.waitForTimeout(300)
    } catch {
      // Sin banner (consent ya almacenado) — OK.
    }

    // Total del sticky bar.
    const total = page.getByText("Total", { exact: true }).first()
    await expectFontGe13(page, total, "label Total")

    // Info de envío.
    const delivery = page.getByText(/Envío gratis desde \$2,500/).first()
    await expectFontGe13(page, delivery, "info de envío")
  })

  test("cookie banner: texto de aviso ≥13px", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200) // delay del banner ~800ms

    const body = page.getByText(/Usamos cookies para analizar tráfico/).first()
    await expectFontGe13(page, body, "texto del cookie banner")
  })
})

// ===== Fase 13 — tipografía unificada, swipe en testimonios y sección "3 pasos" =====
test.describe("móvil: Fase 13 — testimonios (tamaño + swipe) y sección de 3 pasos", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  // El banner de cookies (fixed bottom) puede cubrir la parte baja de la sección;
  // se acepta para liberar el viewport antes de medir.
  async function dismissCookieBanner(page: Page): Promise<void> {
    const accept = page.getByRole("button", { name: "Aceptar todas" })
    try {
      await accept.waitFor({ state: "visible", timeout: 4000 })
      await accept.tap().catch(() => {})
      await page.waitForTimeout(300)
    } catch {
      // Sin banner (consent ya almacenado) — OK.
    }
  }

  // La sección de testimonios del homepage (h2 "Cocineros que confían en nosotros").
  async function testimonialSection(page: Page): Promise<Locator> {
    const heading = page.getByRole("heading", { name: "Cocineros que confían en nosotros" })
    return page.locator("section").filter({ has: heading })
  }

  // 13A: el quote del testimonio usa text-base (16px) en móvil, no text-lg (18px).
  test("el quote del testimonio usa ≤16px en móvil", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500) // reveal + hidratación

    const section = await testimonialSection(page)
    const quote = section.locator("blockquote p")
    const sizes = await quote.evaluateAll((els) =>
      els.map((el) => parseFloat(getComputedStyle(el).fontSize))
    )
    expect(sizes.length, "no se encontró el quote del testimonio").toBeGreaterThan(0)
    expect(Math.max(...sizes), "quote del testimonio demasiado grande en móvil").toBeLessThanOrEqual(16)
  })

  // 13B: swipe horizontal (CDP Input.dispatchTouchEvent) cambia de testimonio.
  test("swipe horizontal en testimonios cambia de autor", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)

    const section = await testimonialSection(page)
    const carousel = section.locator("div.relative.max-w-3xl").first()
    await expect(carousel).toBeVisible({ timeout: 5000 })
    await carousel.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)

    const author = () => carousel.locator("p.text-sm.font-bold").first().textContent()
    const before = (await author()) ?? ""

    const box = await carousel.boundingBox()
    expect(box, "carrusel sin boundingBox").not.toBeNull()
    const startX = box!.x + box!.width * 0.85
    const y = box!.y + box!.height * 0.5

    const client = await page.context().newCDPSession(page)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y }],
    })
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: startX - 90, y }],
    })
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await client.detach()

    // El autor cambia tras el swipe (ventana < 5s del autoplay para no depender de él).
    await expect
      .poll(async () => (await author()) ?? "", { timeout: 4000, intervals: [100, 250, 400] })
      .not.toBe(before)
  })

  // 13C: la sección "Abastece tu negocio en 3 pasos" cabe en una sola pantalla.
  test("la sección 'Abastece tu negocio en 3 pasos' cabe en una pantalla", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)
    await dismissCookieBanner(page)

    const heading = page.getByRole("heading", { name: "Abastece tu negocio en 3 pasos" })
    await expect(heading).toBeVisible({ timeout: 5000 })
    const section = page.locator("section").filter({ has: heading })

    // Se scrollea la sección completa (no solo el heading) para que quede
    // alineada dentro del viewport — así se mide si cabe en una pantalla.
    await section.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)

    const sectionBox = await section.boundingBox()
    expect(sectionBox, "sección sin boundingBox").not.toBeNull()
    const vh = page.viewportSize()!.height
    expect(sectionBox!.y, "la sección arranca dentro del viewport").toBeGreaterThanOrEqual(0)
    expect(sectionBox!.y + sectionBox!.height, "la sección desborda la pantalla").toBeLessThanOrEqual(vh + 1)
  })

  // 13A: los h3 de los pasos usan text-sm (14px) en móvil, alineado con "Hecho para ti".
  test("los h3 de los 3 pasos usan ≤16px en móvil", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)

    const heading = page.getByRole("heading", { name: "Abastece tu negocio en 3 pasos" })
    await expect(heading).toBeVisible({ timeout: 5000 })
    const section = page.locator("section").filter({ has: heading })

    const sizes = await section
      .locator("h3")
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))
    expect(sizes.length, "no se encontraron los h3 de los pasos").toBe(3)
    expect(Math.max(...sizes), "h3 de los pasos demasiado grande en móvil").toBeLessThanOrEqual(16)
  })
})

test.describe("Fase 14 móvil: footer compacto, landings de negocio y hub del panel", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  async function boundingBoxSettled(
    locator: Locator,
    maxRetries = 6,
  ): Promise<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> {
    for (let i = 0; i < maxRetries; i++) {
      const box = await locator.boundingBox()
      if (box && box.height > 0 && box.width > 0) return box
      await (locator.page() as Page).waitForTimeout(300)
    }
    const box = await locator.boundingBox()
    if (!box) throw new Error("elemento sin boundingBox tras reintentos")
    return box
  }

  // 14A: el footer mide menos de 560px de alto en móvil (antes 677px).
  test("el footer mide menos de 560px de alto en móvil", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)

    const footer = page.locator("footer.site-footer")
    await expect(footer).toBeVisible({ timeout: 5000 })
    const box = await boundingBoxSettled(footer)
    expect(box.height, `footer demasiado alto (${box.height}px)`).toBeLessThan(560)
  })

  // 14B: hero h1 de /negocio/credito ≤30px y features horizontales en móvil.
  test("el hero de /negocio/credito usa ≤30px y sus features son horizontales", async ({ page }) => {
    await page.goto("/negocio/credito", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1000)

    const h1 = page.getByRole("heading", { level: 1 })
    await expect(h1).toBeVisible({ timeout: 5000 })
    const h1Px = await h1.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(h1Px, `h1 del hero demasiado grande (${h1Px}px)`).toBeLessThanOrEqual(30)

    // Features: en móvil el icono y el título comparten el mismo top (flex row).
    const icon = page.locator("div.bg-\\[\\#E8F5E8\\]").first()
    await expect(icon).toBeVisible({ timeout: 5000 })
    const iconBox = await boundingBoxSettled(icon)
    const title = icon.locator("xpath=../..").locator("h3").first()
    await expect(title).toBeVisible()
    const titleBox = await boundingBoxSettled(title)
    expect(
      Math.abs(iconBox.y - titleBox.y),
      `icono y título de feature deberían estar a la misma altura (icon=${iconBox.y}, title=${titleBox.y})`,
    ).toBeLessThanOrEqual(8)
  })

  // 14C: el hub del panel — ToolGrid compacto y BackupStrip con scroll horizontal.
  test("el hub del panel: primera card <110px y BackupStrip con scroll sin overflow", async ({ page }) => {
    await page.goto("/panel", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)

    // Seleccionar un tipo de restaurante para activar el hub (BackupStrip solo aparece con colección).
    const pickerBtn = page.getByRole("button", { name: /Hamburguesas y Hot Dogs/ }).first()
    await expect(pickerBtn).toBeVisible({ timeout: 5000 })
    await pickerBtn.tap()
    await page.waitForTimeout(800)

    // ToolGrid: primera card (Link horizontal) mide <110px en móvil.
    const firstTool = page.locator("div.flex.flex-col.gap-2").first().locator("a").first()
    await expect(firstTool).toBeVisible({ timeout: 5000 })
    const cardBox = await boundingBoxSettled(firstTool)
    expect(cardBox.height, `card de ToolGrid demasiado alta (${cardBox.height}px)`).toBeLessThan(110)

    // BackupStrip: overflow-x-auto con scrollWidth > clientWidth, sin overflow del viewport.
    const strip = page.locator("div.overflow-x-auto.scrollbar-hide").filter({ hasText: "Acciones rápidas" })
    await expect(strip).toBeVisible({ timeout: 5000 })
    const metrics = await strip.evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    expect(metrics.scrollWidth, "BackupStrip debería ser scrolleable horizontalmente").toBeGreaterThan(
      metrics.clientWidth,
    )
    expect(metrics.docOverflow, "el hub no debería desbordar el viewport").toBeLessThanOrEqual(1)
  })
})

// Fase 15 — Bug del logo móvil: el tap-target era solo el texto (~26px), por eso
// los taps que caían en el header (pero fuera de las letras) no navegaban. El fix
// estira el <Link> a la altura completa del header (self-stretch, 64px) + px-2.
test.describe("Fase 15 — logo móvil: tap-target amplio y navegación al home", () => {
  test.skip(({ isMobile }) => !isMobile, "solo project mobile-chromium")

  test("el logo mide ≥44px y un tap en el borde del header navega al home", async ({ page }) => {
    // Bug reportado desde la página de búsqueda.
    await page.goto("/cdmx/buscar?q=cebolla", { waitUntil: "domcontentloaded" })
    const header = page.locator("header")
    await header.waitFor({ state: "visible", timeout: 10000 })

    const logo = page.getByRole("link", { name: "Resurte — ir al inicio" })
    await logo.waitFor({ state: "visible", timeout: 10000 })
    const logoBox = (await boundingBoxSettled(logo))!
    expect(
      logoBox.height,
      `el logo debe estirarse a la altura del header (≥44px); mide ${Math.round(logoBox.height)}px`,
    ).toBeGreaterThanOrEqual(44)

    const headerBox = (await boundingBoxSettled(header))!
    // Tap en el borde superior del header, dentro del ancho del logo. Antes del fix
    // (solo las letras centradas, ~26px) este punto NO pertenecía al link → tap perdido.
    const tapX = logoBox.x + Math.min(20, logoBox.width / 2)
    const tapY = headerBox.y + 6

    // Anti-race de hidratación en preview frío: reintentar si el tap no navega.
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.touchscreen.tap(tapX, tapY)
      try {
        await page.waitForURL(/\/cdmx$/, { timeout: 6000 })
        return
      } catch {
        // siguiente intento
      }
    }
    throw new Error("el tap en el borde del logo no navegó al home (tras 3 intentos)")
  })
})

test.describe("Fase 16 — Hub del panel des-saturado en móvil y barra de accesos rápidos", () => {
  test.skip(({ isMobile }) => !isMobile, "solo móvil")

  test.beforeEach(async ({ page }) => {
    await page.goto("/panel", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
  })

  async function boundingBoxSettled(
    locator: import("@playwright/test").Locator,
    timeout = 5000
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const deadline = Date.now() + timeout
    let last: { x: number; y: number; width: number; height: number } | null = null
    while (Date.now() < deadline) {
      if (!(await locator.isVisible())) return last!
      last = (await locator.boundingBox()) ?? last
      if (last) return last
      await new Promise((r) => setTimeout(r, 300))
    }
    return last!
  }

  async function selectCollection(page: import("@playwright/test").Page) {
    // Si el hub ya tiene colección seleccionada (persistida), no hace falta el picker.
    const nav = page.getByRole("navigation", { name: "Accesos rápidos del panel" })
    if (await nav.isVisible().catch(() => false)) return
    const pickerBtn = page.locator("button", { hasText: /Hamburguesas y Hot Dogs/ }).first()
    await pickerBtn.tap().catch(() => {})
    await page.waitForTimeout(800)
  }

  test("LiveStats es una tira horizontal swipeable en móvil", async ({ page }) => {
    await selectCollection(page)

    const strip = page.locator("div.overflow-x-auto.scrollbar-hide.snap-x").first()
    await expect(strip).toBeVisible({ timeout: 8000 })

    const metrics = await strip.evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }))
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth)

    const firstCard = strip.locator("> div").first()
    const box = await boundingBoxSettled(firstCard)
    expect(box).toBeTruthy()
    // Compacta: la tira cabe en ~1-2 filas (vs ~500px del grid grid-cols-2
    // anterior). Umbral 160 para tolerar la nota de costo real ("Costo: $X").
    expect(Math.round(box!.height)).toBeLessThanOrEqual(160)
  })

  test("el hub tiene un solo grid agrupado por 4 áreas con contexto", async ({ page }) => {
    await selectCollection(page)

    for (const header of [
      "Costos y rentabilidad",
      "Planeación y compras",
      "Operación y apertura",
      "Sistema de pedidos",
    ]) {
      await expect(page.getByRole("heading", { name: header })).toBeVisible({ timeout: 8000 })
    }

    // El header "Sistema de pedidos" vive dentro del grid unificado (regresión de ToolGrid).
    const grid = page.locator("div.flex.flex-col.gap-2").first()
    await expect(grid.getByRole("heading", { name: "Sistema de pedidos" })).toBeVisible()

    // Chip "Incluido gratis" se conserva en el grupo de FoodOS.
    await expect(page.getByText("Incluido gratis")).toBeVisible()
  })

  test("la barra inferior de accesos rápidos tiene 5 destinos y navega", async ({ page }) => {
    await selectCollection(page)

    const nav = page.getByRole("navigation", { name: "Accesos rápidos del panel" })
    await expect(nav).toBeVisible({ timeout: 8000 })

    for (const label of ["Inicio", "Ventas", "Costeo", "Mermas", "Menú digital"]) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible()
    }

    // Tap en "Ventas" navega a /panel/ventas
    for (let attempt = 0; attempt < 3; attempt++) {
      await nav.getByText("Ventas", { exact: true }).tap()
      try {
        await page.waitForURL(/\/panel\/ventas$/, { timeout: 8000 })
        break
      } catch {
        // reintentar (race de hidratación en preview frío)
      }
    }
    expect(page.url()).toMatch(/\/panel\/ventas$/)
  })

  test("sin overflow del viewport y el último tool queda visible sobre la barra", async ({ page }) => {
    await selectCollection(page)

    const grid = page.locator("div.flex.flex-col.gap-2").first()
    const lastTool = grid.locator("a").last()
    await lastTool.scrollIntoViewIfNeeded()
    // Scrollear hasta el fondo: el wrapper del hub tiene pb-24, así el último tool
    // queda por encima de la barra inferior (que mide ~72px).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(400)

    const toolBox = await boundingBoxSettled(lastTool)
    const nav = page.getByRole("navigation", { name: "Accesos rápidos del panel" })
    const navBox = await boundingBoxSettled(nav)
    expect(toolBox).toBeTruthy()
    expect(navBox).toBeTruthy()
    // El último tool no queda tapado por la barra inferior.
    expect(toolBox!.y + toolBox!.height).toBeLessThanOrEqual(navBox!.y + 2)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})

test.describe("Fase 16 — PanelQuickNav solo en móvil", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false })

  test("en desktop la barra inferior de accesos rápidos no se renderiza", async ({ page }) => {
    await page.goto("/panel", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})

    const pickerBtn = page.locator("button", { hasText: /Hamburguesas y Hot Dogs/ }).first()
    await pickerBtn.tap().catch(() => {})
    await page.waitForTimeout(800)

    await expect(page.getByRole("navigation", { name: "Accesos rápidos del panel" })).toHaveCount(0)
  })
})

test.describe("Fase 17 — Panel: banner oculto, ThemeToggle con feedback, footer compacto, intuitividad", () => {
  test.skip(({ isMobile }) => !isMobile, "solo móvil")

  test.beforeEach(async ({ page }) => {
    await page.goto("/panel", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
  })

  async function selectCollection(page: import("@playwright/test").Page) {
    const nav = page.getByRole("navigation", { name: "Accesos rápidos del panel" })
    if (await nav.isVisible().catch(() => false)) return
    const pickerBtn = page.locator("button", { hasText: /Hamburguesas y Hot Dogs/ }).first()
    await pickerBtn.tap().catch(() => {})
    await page.waitForTimeout(800)
  }

  test("el banner 'personalizadas para' está oculto en móvil", async ({ page }) => {
    await selectCollection(page)
    const banner = page.getByText("Todas las herramientas están personalizadas para")
    await expect(banner).toHaveCount(1)
    await expect(banner).toBeHidden()
  })

  test("ThemeToggle: dark y system con feedback del tema resuelto", async ({ page }) => {
    const toggle = page.getByRole("radiogroup", { name: "Tema de color" })
    await expect(toggle).toBeVisible({ timeout: 8000 })

    await page.getByRole("radio", { name: "Oscuro", exact: true }).tap()
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")

    // El botón "Sistema" anuncia el tema resuelto y su dot lo pinta (dark → indigo).
    const system = page.getByRole("radio", { name: /^Sistema \(/ })
    await expect(system).toHaveAttribute("aria-label", /\(oscuro\)/)
    await expect(system.locator("span").first()).toHaveClass(/bg-indigo-400/)

    // Volver a "Sistema" → sin atributo data-theme y el dot sigue presente.
    await system.tap()
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./)
    await expect(page.getByRole("radio", { name: /^Sistema \(/ })).toHaveAttribute(
      "aria-label",
      /\(claro\)|\(oscuro\)/
    )
  })

  test("footer del panel es compacto con navs deslizables", async ({ page }) => {
    const footer = page.locator("footer.panel-compact-footer")
    await footer.scrollIntoViewIfNeeded()
    await expect(footer).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole("link", { name: "Resurte.me — Ir al inicio" })).toBeVisible()

    const carousel = footer.locator("div.flex.gap-4.overflow-x-auto.scrollbar-hide")
    const m = await carousel.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
    expect(m.sw, "carrusel de navs deslizable").toBeGreaterThan(m.cw)

    const metrics = await footer.evaluate((el) => {
      const inner = el.firstElementChild as HTMLElement
      const pb = parseFloat(getComputedStyle(inner).paddingBottom)
      return { total: el.getBoundingClientRect().height, pb }
    })
    // Altura visual del footer (sin el clearance de PanelQuickNav) < 260px
    // (el footer global de páginas públicas mide ~551px).
    expect(metrics.total - metrics.pb, "footer compacto").toBeLessThan(260)
  })

  test("la comanda del panel no menciona SoftRestaurant", async ({ page }) => {
    await selectCollection(page)
    await page.goto("/panel/comanda", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
    const text = await page.evaluate(() => document.body.innerText.toLowerCase())
    expect(text).not.toContain("softrestaurant")
  })

  test("DaySummary es colapsable en móvil", async ({ page }) => {
    await selectCollection(page)

    const expandBtn = page.getByRole("button", { name: "Expandir resumen del día" })
    await expect(expandBtn).toBeVisible({ timeout: 8000 })
    await expect(page.getByText("Ingresos hoy")).toBeHidden()

    await expandBtn.tap()
    await expect(page.getByText("Ingresos hoy")).toBeVisible()
  })

  test("las cards del grid muestran micro-label 'short'", async ({ page }) => {
    await selectCollection(page)
    const grid = page.locator("div.flex.flex-col.gap-2").first()
    const firstCard = grid.locator("a").first()
    await expect(firstCard.getByText("Costear")).toBeVisible()
  })
})

test.describe("Fase 17 — Banner 'personalizadas para' visible en desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false })

  test("en desktop el banner sí se muestra tras elegir colección", async ({ page }) => {
    await page.goto("/panel", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})

    const pickerBtn = page.locator("button", { hasText: /Hamburguesas y Hot Dogs/ }).first()
    // Desktop sin hasTouch → tap() lanza y el catch lo traga; usar click().
    await pickerBtn.click().catch(() => {})
    await page.waitForTimeout(800)

    await expect(page.getByText("Todas las herramientas están personalizadas para")).toBeVisible()
  })
})
