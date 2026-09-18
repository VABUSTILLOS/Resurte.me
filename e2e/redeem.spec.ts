import { test, expect } from "@playwright/test"

/**
 * E2E de /api/redeem — canje de Créditos Resurte por servicios de la Tienda
 * de Crecimiento.
 *
 * Estrategia (la misma que money-flows.spec.ts): la ruta valida el body y el
 * servicio contra el catálogo ANTES de tocar Supabase, así que los 400/404 se
 * pueden probar contra el dev server real sin credenciales ni seed.
 *
 * El débito atómico (RPC redeem_service), el saldo y la idempotencia se
 * cubren en src/lib/wallet-actions.test.ts.
 *
 * ⚠️ NO usar page.route en este archivo: `page.request` NO pasa por los route
 * handlers de Playwright, así que un mock aquí se asertaría a sí mismo y el
 * test pasaría sin ejercitar la ruta.
 */
test.describe("API /api/redeem — validación de dinero", { tag: "@ci" }, () => {
  test("body vacío → 400 con mensaje claro", async ({ request }) => {
    const response = await request.post("/api/redeem", { data: {} })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toBe("service_id es requerido")
  })

  test("service_id vacío → 400 (no consulta el catálogo)", async ({ request }) => {
    const response = await request.post("/api/redeem", { data: { service_id: "" } })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toBe("service_id es requerido")
  })

  test("service_id desconocido → 404, nunca 200 ni 500", async ({ request }) => {
    // El brief va completo a propósito. La ruta lo valida ANTES de buscar en el
    // catálogo (rechazarlo después de cobrar dejaría al cliente sin créditos y
    // sin servicio), así que una petición sin brief se detiene en el 400 y este
    // test nunca llegaría a ejercitar el 404 que su nombre promete.
    const response = await request.post("/api/redeem", {
      data: {
        service_id: "servicio-que-no-existe-xyz",
        brief: { restaurant_name: "Resurte Test" },
      },
    })

    expect(response.status()).toBe(404)
    const data = await response.json()
    expect(data.error).toBe("Servicio no encontrado")
  })

  // La cara complementaria del test anterior: el orden de validación de la ruta
  // (body → catálogo) es una decisión, no un accidente. Sin esta prueba, alguien
  // podría invertirlo para "arreglar" el 404 y nadie se enteraría de que se
  // perdió la garantía de no debitar con un brief inválido.
  test("brief inválido + service_id desconocido → 400, el body se valida antes del catálogo", async ({
    request,
  }) => {
    const response = await request.post("/api/redeem", {
      data: { service_id: "servicio-que-no-existe-xyz" },
    })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toBe("El nombre de tu restaurante es obligatorio")
  })
})
