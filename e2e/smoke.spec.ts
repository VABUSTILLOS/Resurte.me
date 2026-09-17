import { test, expect } from "@playwright/test"

test.describe("smoke: páginas públicas", { tag: "@ci" }, () => {
  test("home responde y renderiza la landing", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(/Resurte/i)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  })

  test("marketplace /comer responde", async ({ page }) => {
    const response = await page.goto("/comer", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  })

  test("blog /blog renderiza el index", async ({ page }) => {
    const response = await page.goto("/blog", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  })

  test("blog: el índice del artículo enlaza encabezados reales y marca el activo", async ({ page }) => {
    test.setTimeout(60_000)
    const response = await page.goto("/blog/guia-marketing-restaurantes", {
      waitUntil: "domcontentloaded",
    })
    expect(response?.status()).toBe(200)

    const toc = page.locator('nav[aria-label="Índice del artículo"] ol a')
    await expect(toc.first()).toBeVisible()
    const count = await toc.count()
    expect(count, "el artículo debe tener al menos 3 secciones").toBeGreaterThanOrEqual(3)

    // Cada enlace apunta a un encabezado que existe en el documento.
    const targets = await toc.evaluateAll((links) =>
      links.map((link) => (link.getAttribute("href") ?? "").replace(/^#/, ""))
    )
    for (const id of targets) {
      await expect(page.locator(`#${id}`)).toHaveCount(1)
    }

    const active = page.locator(
      'nav[aria-label="Índice del artículo"] ol a[aria-current="location"]'
    )

    // El scroll-spy marca el encabezado que entra en su franja de detección.
    // Se prueba sección a sección: depender del fondo absoluto es frágil
    // porque cada artículo cierra con FAQ, fuentes y newsletter.
    const scrollIntoBand = async (id: string) => {
      await page.evaluate((target) => {
        const el = document.getElementById(target)
        if (!el) return
        // 15–30% del alto de la ventana es la franja del IntersectionObserver.
        const band = window.innerHeight * 0.2
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - band)
      }, id)
    }

    const samples = [
      targets[0]!,
      targets[Math.floor(targets.length / 2)]!,
      targets.at(-1)!,
    ]
    for (const id of samples) {
      await scrollIntoBand(id)
      await expect(
        page.locator(`nav[aria-label="Índice del artículo"] ol a[href="#${id}"]`)
      ).toHaveAttribute("aria-current", "location")
      await expect(active).toHaveCount(1)
    }
  })

  test("ciudad /cdmx responde", async ({ page }) => {
    const response = await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  })

  test("recompensas /recompensas responde", async ({ page }) => {
    const response = await page.goto("/recompensas", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
  })

  test("404 para rutas inexistentes", async ({ page }) => {
    const response = await page.goto("/ruta-que-no-existe-xyz", { waitUntil: "domcontentloaded" })
    // 404 real (antes el streaming del shell devolvía 200 y el enlace roto se
    // indexaba como página válida). El título lo aporta el generateMetadata del
    // segmento, que sigue resolviéndose aunque la página llame a notFound():
    // medido, la ruta termina con "Ciudad no encontrada — Resurte.me".
    // La cáscara inicial (id="__next_error__") trae el título del root layout y
    // solo se reemplaza al hidratar el payload de flight — de ahí el margen:
    // con el timeout por defecto (5s) el test medía la carga del server, no el
    // 404. Medido aislado: pasa en 22.7s los 8 tests de 404 de los 3 specs.
    expect(response?.status()).toBe(404)
    await expect(page).toHaveTitle(/Ciudad no encontrada/i, { timeout: 15000 })
  })
})
