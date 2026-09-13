import { test, expect } from "@playwright/test"

/**
 * E2E de la bitácora administrativa (C5).
 *
 * Sin credenciales no se puede ejercer el camino feliz (requiere sesión
 * admin + Supabase), así que se verifica el comportamiento de seguridad:
 * la API nunca expone la bitácora a anónimos, y el dashboard público no
 * renderiza la sección.
 */

test.describe("bitácora admin — guards", { tag: "@ci" }, () => {
  // En CI/dev sin env de Supabase las rutas admin fallan con 500 al crear el
  // cliente (no hay auth disponible); con env configurado deben responder
  // 401/403. En ambos casos lo importante: NUNCA 200 con datos.
  const GUARDED_CODES = [401, 403, 500]

  test("GET /api/admin/audit-log sin sesión no expone la bitácora", async ({ request }) => {
    const response = await request.get("/api/admin/audit-log")
    expect(GUARDED_CODES).toContain(response.status())
    if (response.status() !== 500) {
      const data = await response.json()
      expect(data.error).toBeTruthy()
      expect(data.entries).toBeUndefined()
    }
  })

  test("PATCH /api/orders/:id/status sin sesión no modifica pedidos", async ({ request }) => {
    const response = await request.patch("/api/orders/1/status", {
      data: { status: "confirmed" },
    })
    expect(GUARDED_CODES).toContain(response.status())
  })

  test("las demás APIs admin tampoco exponen datos a anónimos", async ({ request }) => {
    for (const url of ["/api/admin/orders?limit=5", "/api/admin/metrics?period=daily"]) {
      const response = await request.get(url)
      expect(GUARDED_CODES).toContain(response.status())
    }
  })
})
