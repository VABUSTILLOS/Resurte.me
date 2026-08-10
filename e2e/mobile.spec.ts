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
    const bar = page.locator(".sticky-atc-bar").first()
    // Durante la hidratación Next/React puede montar la barra dos veces de forma
    // transitoria (ambas copias idénticas que colapsan a 1); .first() evita el
    // strict-mode y no cambia la semántica del test.
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

  test("'Ver más productos' abre el overlay de búsqueda en móvil", async ({ page }) => {
    const hasData = await seedCart(page)
    test.skip(!hasData, "no hay productos en /cdmx (sin datos locales)")

    // El botón está en la barra flotante (z-50); se pulsa directamente sin abrir el drawer.
    const verMas = page.getByRole("button", { name: "Ver más productos" })
    await expect(verMas).toBeVisible({ timeout: 5000 })
    await verMas.tap()

    // El overlay de búsqueda se abre (dialog visible), sin navegación a /buscar.
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

    const todoBox = await todoChip.boundingBox()
    const selectBox = await selectWrap.boundingBox()
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
      const box = await el.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })

  // ===== Fase 5: back arrows de cuenta, chips de ciudad y onboarding de recompensas =====

  // El back arrow de mis-pedidos (único alcanzable sin sesión) mide >= 44px.
  test("el back arrow de mis-pedidos mide al menos 44px", async ({ page }) => {
    await page.goto("/cdmx/mis-pedidos", { waitUntil: "domcontentloaded" })
    const back = page.getByRole("link", { name: "Volver a inicio" })
    await expect(back).toBeVisible({ timeout: 5000 })
    const box = await back.boundingBox()
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
