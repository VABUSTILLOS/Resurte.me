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
    // indexaba como página válida). La garantía SEO es el **status**, no el
    // título: `not-found.js` se renderiza dentro del root layout, así que el
    // <title> es el del layout aunque el segmento haya resuelto uno propio en
    // generateMetadata — Next descarta el del segmento cuando el boundary lo
    // reemplaza. Medido: /ruta-que-no-existe-xyz responde 404 con el título de
    // la home. No hay vía soportada para cambiarlo (`global-not-found.js` solo
    // cubre rutas que no matchean ninguna, y esta sí matchea [slug]).
    expect(response?.status()).toBe(404)
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible()
    await expect(page.getByText("Página no encontrada")).toBeVisible()
  })
})
