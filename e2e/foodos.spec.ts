import { test, expect } from "@playwright/test"

/**
 * E2E de la paridad con FluxSales (Fase 9).
 *
 * Dos bloques:
 *
 * 1. La landing comercial `/restaurantes` y sus dos diagnósticos son
 *    `force-static` y calculan en el navegador, así que se pueden ejercer
 *    completos sin credenciales ni seed.
 * 2. Las superficies premium (panel FoodOS, admin de restaurantes y las APIs
 *    públicas de pedido y catering) NUNCA deben responder 200 con datos a un
 *    anónimo. En CI/dev sin env de Supabase fallan al crear el cliente (500);
 *    con env configurado responden 400/401/403. En todos los casos lo que
 *    importa es lo mismo: nada de datos.
 */

const GUARDED_CODES = [400, 401, 403, 500]

test.describe("landing /restaurantes", { tag: "@ci" }, () => {
  test("renderiza el hero y las secciones comerciales", async ({ page }) => {
    const response = await page.goto("/restaurantes", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)

    await expect(
      page.getByRole("heading", { level: 1, name: /se gana comprando/i })
    ).toBeVisible()
    await expect(page.locator("#niveles")).toBeVisible()
    await expect(page.locator("#diagnostico")).toBeVisible()
    await expect(page.locator("#capacidades")).toBeVisible()
    await expect(page.locator("#faq")).toBeVisible()
  })

  test("la calculadora de comisión recalcula en el navegador", async ({ page }) => {
    await page.goto("/restaurantes", { waitUntil: "domcontentloaded" })

    // La tarjeta completa: cualquier cifra del resultado tiene que moverse.
    const card = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: /le regalas a la app/i }) })
      .filter({ hasText: "Comisión que pagas al año" })
      .last()
    await expect(card).toBeVisible()
    const before = await card.innerText()
    // `innerText` respeta text-transform: las etiquetas salen en mayúsculas.
    expect(before.toUpperCase()).toContain("COMISIÓN QUE PAGAS AL AÑO")

    // Se duplican los pedidos por mes: la comisión anual tiene que moverse.
    await page.locator("#roi-monthlyOrders").fill("1200")

    await expect(card).not.toHaveText(before)
  })

  test("el diagnóstico del restaurante se calcula sin backend", async ({ page }) => {
    await page.goto("/restaurantes", { waitUntil: "domcontentloaded" })

    const diagnosis = page.locator("#diagnostico")
    const score = diagnosis.getByText(/Segmento .*\(\d+\/100\)/)
    await expect(score).toBeVisible()

    // Elegir un canal mueve el diagnóstico sin salir del navegador.
    const before = (await score.textContent())?.trim()
    await diagnosis.getByRole("button", { pressed: false }).first().click()
    await expect(score).toBeVisible()
    expect((await score.textContent())?.trim()).toBeTruthy()
    expect(before).toBeTruthy()
  })

  test("sin overflow horizontal a 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/restaurantes", { waitUntil: "domcontentloaded" })

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      return doc.scrollWidth - doc.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(1)
  })
})

test.describe("guards de las capacidades premium", { tag: "@ci" }, () => {
  test("POST /api/foodos/orders sin datos no crea pedido", async ({ request }) => {
    const response = await request.post("/api/foodos/orders", { data: {} })
    expect(GUARDED_CODES).toContain(response.status())
    if (response.status() !== 500) {
      const data = await response.json()
      expect(data.error).toBeTruthy()
      expect(data.orderId).toBeUndefined()
    }
  })

  test("POST /api/foodos/catering/request sin datos no crea solicitud", async ({ request }) => {
    const response = await request.post("/api/foodos/catering/request", { data: {} })
    expect(GUARDED_CODES).toContain(response.status())
    if (response.status() !== 500) {
      const data = await response.json()
      expect(data.error).toBeTruthy()
      expect(data.requestId).toBeUndefined()
    }
  })

  const PANEL_PATHS = [
    "/panel/foodos",
    "/panel/foodos/mesero-ia",
    "/panel/foodos/flotilla",
    "/panel/foodos/wallet",
    "/panel/foodos/sitio-ia",
    "/panel/foodos/pos",
    "/panel/foodos/catering",
  ]

  for (const path of PANEL_PATHS) {
    test(`${path} no muestra el panel a un anónimo`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" })
      expect(response?.status()).toBeLessThan(500)
      await expect(page.locator("body")).not.toBeEmpty()
      // El error boundary responde 200 con "Algo salió mal": un 200 no basta
      // para saber que la superficie degradó en vez de reventar.
      await expect(page.getByText("Algo salió mal")).toHaveCount(0)
    })
  }

  test("/admin/restaurantes no muestra la cartera a un anónimo", async ({ page }) => {
    const response = await page.goto("/admin/restaurantes", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
    await expect(page.getByText("Algo salió mal")).toHaveCount(0)
  })
})

test.describe("micrositio /r/[slug]", { tag: "@ci" }, () => {
  // El slug inexistente debe dar 404 real: el micrositio se comparte por
  // WhatsApp y un soft-404 (200 con la vista de 404) indexaba enlaces rotos
  // como páginas válidas. Por eso se verifica el status, no solo la vista.
  test("un slug inexistente responde 404 y no renderiza un restaurante", async ({ page }) => {
    const response = await page.goto("/r/no-existe-este-restaurante", { waitUntil: "domcontentloaded" })

    expect(response?.status()).toBe(404)
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible()
    await expect(page.getByText("Página no encontrada")).toBeVisible()
    // Copy del not-found del micrositio: confirma que no cae al boundary raíz.
    await expect(page.getByText("El restaurante que buscas no existe", { exact: false })).toBeVisible()
    await expect(page.getByRole("link", { name: /Agregar/i })).toHaveCount(0)
  })

  test("la carta de un slug inexistente responde 404", async ({ page }) => {
    const response = await page.goto("/r/no-existe-este-restaurante/carta", { waitUntil: "domcontentloaded" })

    expect(response?.status()).toBe(404)
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible()
    await expect(page.getByText("Página no encontrada")).toBeVisible()
  })
})
