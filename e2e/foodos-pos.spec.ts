import { test, expect } from "@playwright/test"

/**
 * E2E de la paridad con Maspedidos: punto de venta, comandero y marketplace
 * transaccional.
 *
 * **Este spec no autentica.** El repo no tiene seed ni credenciales de e2e (ver
 * `e2e/global-setup.ts`: solo calienta rutas), así que un flujo completo
 * —abrir turno → vender → imprimir, o abrir mesa → mandar a cocina → cerrar
 * cuenta— no se puede ejercer aquí sin inventar una sesión. Lo que sí se puede
 * y sí importa verificar es lo contrario: que **ninguna** de las superficies
 * nuevas entregue datos ni reviente para un anónimo.
 *
 * La aritmética de esos flujos (folio, arqueo, totales, payload de impresión)
 * está cubierta por unitarios, que es donde se puede fijar de verdad:
 * `src/lib/foodos-cash.test.ts`, `src/lib/foodos-printing/tickets.test.ts`,
 * `src/lib/foodos-order-create.test.ts` y los `*-gates.test.ts`.
 */

/** Con env de Supabase las rutas guardadas responden 4xx; sin env, 500. */
const GUARDED_CODES = [400, 401, 403, 500]

/**
 * Rutas del punto de venta. El nombre dice qué NO debe aparecer: si un anónimo
 * ve el verbo, la superficie se filtró aunque el status sea 200.
 */
const POS_SURFACES: { path: string; verbs: string[] }[] = [
  { path: "/panel/foodos/tablero", verbs: ["Ticket promedio", "Cierre del día"] },
  { path: "/panel/foodos/mostrador", verbs: ["Cobrar", "Abrir turno"] },
  { path: "/panel/foodos/mesas", verbs: ["Abrir cuenta", "Enviar a cocina"] },
  { path: "/panel/foodos/caja", verbs: ["Arqueo", "Corte de caja"] },
  { path: "/panel/foodos/pedidos", verbs: ["Comanda", "Marcar pagado"] },
]

test.describe("punto de venta: un anónimo no ve ninguna superficie", { tag: "@ci" }, () => {
  for (const { path, verbs } of POS_SURFACES) {
    test(`${path} no entrega datos ni revienta`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" })
      expect(response?.status()).toBeLessThan(500)

      const body = page.locator("body")
      await expect(body).not.toBeEmpty()

      // El error boundary responde 200 con "Algo salió mal": un 200 no basta
      // para saber que la superficie degradó en vez de reventar.
      await expect(page.getByText("Algo salió mal")).toHaveCount(0)

      // Y lo que de verdad importa: ni un verbo del punto de venta.
      const text = await body.innerText()
      for (const verb of verbs) {
        expect(text).not.toContain(verb)
      }
    })
  }
})

test.describe("marketplace HoyQueComemos", { tag: "@ci" }, () => {
  test("/comer renderiza el directorio sin backend", async ({ page }) => {
    const response = await page.goto("/comer", { waitUntil: "domcontentloaded" })

    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/comemos/i)
    await expect(page.getByText("Algo salió mal")).toHaveCount(0)
  })

  // El marketplace se comparte por WhatsApp: un slug inexistente tiene que dar
  // 404 real. Un soft-404 (200 con la vista de error) indexaba enlaces rotos
  // como fichas válidas. Mismo motivo que en `/r/[slug]` (ver foodos.spec.ts).
  test("/comer/[slug] inexistente responde 404", async ({ page }) => {
    const response = await page.goto("/comer/no-existe-este-restaurante", {
      waitUntil: "domcontentloaded",
    })

    expect(response?.status()).toBe(404)
    // Mismo margen que en foodos.spec.ts: el boundary se hidrata, no viene en la cáscara.
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("Página no encontrada")).toBeVisible()
  })

  test("el pedido anónimo por API sigue guardado", async ({ request }) => {
    // El marketplace reutiliza el productor único de pedidos: la ruta de API no
    // cambió, pero un pedido de canal `marketplace` tampoco puede colarse.
    const response = await request.post("/api/foodos/orders", {
      data: { restaurant_id: "no-existe", channel: "marketplace", items: [] },
    })
    expect(GUARDED_CODES).toContain(response.status())
    if (response.status() !== 500) {
      const data = await response.json()
      expect(data.orderId).toBeUndefined()
    }
  })
})
