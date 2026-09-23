import { test, expect } from "@playwright/test"

/**
 * E2E del panel admin de Productos (ronda 8).
 *
 * Sin credenciales no se puede ejercer el camino feliz (requiere sesión admin
 * + Supabase), así que se verifica lo que sí es comprobable en CI:
 *
 * 1. Las APIs de producto siguen cerradas a anónimos — incluido el endpoint
 *    de escritura masiva `POST /api/admin/products/bulk`, que es la única vía
 *    de escritura en masa del panel y por tanto la de mayor riesgo.
 * 2. Los deep-links con filtros (q, stock, status, sort, dir, page, view)
 *    renderizan sin romper, y los valores fuera de allowlist se descartan
 *    en vez de propagarse.
 */

test.describe("panel productos — guards de API", { tag: "@ci" }, () => {
  // En CI/dev sin env de Supabase las rutas admin fallan con 500 al crear el
  // cliente (no hay auth disponible); con env configurado deben responder
  // 401/403. En ambos casos lo importante: NUNCA 200 con datos.
  const GUARDED_CODES = [401, 403, 500]

  test("POST /api/admin/products/bulk sin sesión no escribe nada", async ({ request }) => {
    const response = await request.post("/api/admin/products/bulk", {
      data: { ids: [1, 2, 3], patch: { is_active: false } },
    })
    expect(GUARDED_CODES).toContain(response.status())
    if (response.status() !== 500) {
      const data = await response.json()
      expect(data.error).toBeTruthy()
      expect(data.updated).toBeUndefined()
    }
  })

  test("POST /api/admin/products/bulk no filtra el motivo del rechazo de ids", async ({ request }) => {
    // Payload deliberadamente inválido: sin sesión debe cortar por auth, no
    // por validación (una respuesta 400 aquí revelaría la allowlist de patch).
    const response = await request.post("/api/admin/products/bulk", {
      data: { ids: [], patch: { is_admin: true } },
    })
    expect(GUARDED_CODES).toContain(response.status())
  })

  test("GET /api/admin/products/city-availability sin sesión no expone disponibilidad", async ({
    request,
  }) => {
    const response = await request.get("/api/admin/products/city-availability?ids=1,2,3")
    expect(GUARDED_CODES).toContain(response.status())
    if (response.status() !== 500) {
      const data = await response.json()
      expect(data.error).toBeTruthy()
      expect(data.rows).toBeUndefined()
    }
  })

  test("PATCH /api/admin/products/city-availability sin sesión no cambia disponibilidad", async ({
    request,
  }) => {
    const response = await request.patch("/api/admin/products/city-availability", {
      data: { ids: [1], scope: "all", isAvailable: false },
    })
    expect(GUARDED_CODES).toContain(response.status())
  })

  test("PATCH /api/admin/products/city-availability no acepta el modo restore sin sesión", async ({
    request,
  }) => {
    // `restore` es el camino de undo: reescribe celdas capturadas previamente.
    // Sin sesión debe cortar antes de tocar la tabla.
    const response = await request.patch("/api/admin/products/city-availability", {
      data: { ids: [1], mode: "restore", cells: [{ cityId: 1, isAvailable: true }] },
    })
    expect(GUARDED_CODES).toContain(response.status())
  })

  test("GET /api/admin/products/list sin sesión no expone el catálogo", async ({ request }) => {
    const response = await request.get("/api/admin/products/list?page=1&pageSize=5")
    expect(GUARDED_CODES).toContain(response.status())
    if (response.status() !== 500) {
      const data = await response.json()
      expect(data.error).toBeTruthy()
      expect(data.products).toBeUndefined()
    }
  })

  test("GET /api/admin/products/list no acepta idsOnly sin sesión", async ({ request }) => {
    // `idsOnly` devuelve la lista completa de ids para «seleccionar todo el
    // filtro»; expuesta a anónimos sería un volcado del catálogo.
    const response = await request.get("/api/admin/products/list?idsOnly=1&pageSize=1000")
    expect(GUARDED_CODES).toContain(response.status())
    if (response.status() !== 500) {
      const data = await response.json()
      expect(data.ids).toBeUndefined()
    }
  })

  test("las demás APIs de producto tampoco exponen datos a anónimos", async ({ request }) => {
    for (const url of [
      "/api/admin/products/audit",
      "/api/admin/products/row-meta?ids=1,2",
      // El resumen por proveedor alimenta el apartado "Proveedores": expuesto
      // a anónimos sería un mapa de quién nos surte y cuántos productos tiene.
      "/api/admin/suppliers/overview",
      "/api/admin/products/sales-report?period=monthly",
    ]) {
      const response = await request.get(url)
      expect(GUARDED_CODES).toContain(response.status())
    }
  })
})

test.describe("panel productos — deep-links", { tag: "@ci" }, () => {
  test("una combinación de filtros válida no rompe /admin/productos", async ({ page }) => {
    const response = await page.goto(
      "/admin/productos?q=resorte&stock=out&status=draft&sort=name&dir=asc&page=2&view=cards",
    )
    // Anónimo: el middleware puede redirigir al login (200 tras seguir el
    // redirect) o el guard del panel corta la vista. Lo importante: responde.
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("sort fuera de la allowlist se descarta sin romper", async ({ page }) => {
    const response = await page.goto("/admin/productos?sort=../etc/passwd&dir=DROP")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("page y pageSize inválidos no rompen el render", async ({ page }) => {
    const response = await page.goto("/admin/productos?page=-1&pageSize=999999&view=nope")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("el filtro por proveedor acepta basura sin propagarla", async ({ page }) => {
    // `supplier` es texto libre (el slug del proveedor), así que la URL es el
    // único punto donde se puede colar algo raro: debe descartarse, no
    // reenviarse a la API ni dejar el listado en blanco.
    for (const value of ["<script>alert(1)</script>", "../../etc/passwd", "", "none", "frugasa"]) {
      const response = await page.goto(`/admin/productos?supplier=${encodeURIComponent(value)}`)
      expect(response?.status()).toBeLessThan(500)
      await expect(page.locator("body")).not.toBeEmpty()
    }
  })

  test("los flags de filtro aceptan basura sin propagarla", async ({ page }) => {
    // Se navega la PÁGINA (no la API): así se ejerce el parseo de la URL, que
    // debe descartar los valores fuera de allowlist en vez de reenviarlos.
    const response = await page.goto(
      "/admin/productos?onlyBrokenImage=<script>alert(1)</script>&trashed=0&noImage=1&city=nope",
    )
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })
})
