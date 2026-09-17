import { test, expect } from "@playwright/test"

/**
 * E2E de los deep-links del panel admin (A15 ronda 2 + A12).
 *
 * Los filtros de `/admin/pedidos` y `/admin/marketing` viajan en la URL para
 * que las alertas del dashboard aterricen en el recurso concreto, y el
 * dashboard permite asignar repartidor sin salir de él. Sin credenciales no se
 * puede ejercer el camino feliz, así que se verifica:
 *
 * 1. Las APIs nuevas siguen cerradas a anónimos (nunca 200 con datos).
 * 2. Las URLs con parámetros arbitrarios no rompen el render ni filtran datos.
 */

test.describe("deep-links admin — guards", { tag: "@ci" }, () => {
  // En CI/dev sin env de Supabase las rutas admin fallan con 500 al crear el
  // cliente (no hay auth disponible); con env configurado deben responder
  // 401/403. En ambos casos lo importante: NUNCA 200 con datos.
  const GUARDED_CODES = [401, 403, 500]

  test("GET /api/admin/drivers sin sesión no expone repartidores", async ({ request }) => {
    const response = await request.get("/api/admin/drivers")
    expect(GUARDED_CODES).toContain(response.status())
    if (response.status() !== 500) {
      const data = await response.json()
      expect(data.error).toBeTruthy()
      expect(data.drivers).toBeUndefined()
    }
  })

  test("PATCH /api/orders/:id/status sin sesión no asigna repartidor", async ({ request }) => {
    const response = await request.patch("/api/orders/1/status", {
      data: { driver_id: 1 },
    })
    expect(GUARDED_CODES).toContain(response.status())
  })

  test("PATCH /api/orders/:id/status sin sesión no desasigna repartidor", async ({ request }) => {
    const response = await request.patch("/api/orders/1/status", {
      data: { driver_id: null },
    })
    expect(GUARDED_CODES).toContain(response.status())
  })
})

test.describe("deep-links admin — render", { tag: "@ci" }, () => {
  test("?status= válido no rompe /admin/pedidos", async ({ page }) => {
    const response = await page.goto("/admin/pedidos?status=pending")
    // Anónimo: el middleware puede redirigir al login (200 tras seguir el
    // redirect) o el guard del panel corta la vista. Lo importante: responde.
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?status= fuera de la allowlist se descarta sin romper", async ({ page }) => {
    const response = await page.goto("/admin/pedidos?status=../etc/passwd")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("fechas mal formadas se descartan sin romper", async ({ page }) => {
    const response = await page.goto("/admin/pedidos?from=no-es-fecha&to=2026-13-45")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?code= inexistente no rompe /admin/marketing", async ({ page }) => {
    const response = await page.goto("/admin/marketing?code=NO-EXISTE")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })
})
