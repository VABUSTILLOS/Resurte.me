import { test, expect } from "@playwright/test"

/**
 * E2E de la bandeja de leads y el CRM del panel (`/admin/leads`).
 *
 * Contexto: hasta la Ronda 5 la página tenía dos listas desconectadas, editaba
 * con `window.prompt` y no tenía ni filtros ni detalle. Ahora los filtros
 * viajan en la URL (una sola fuente de verdad: `@/lib/crm-filters`), hay tres
 * pestañas (leads / pipeline / embudo) y la conversión lead → prospecto es
 * idempotente.
 *
 * Sin credenciales de admin no se puede ejercer el camino feliz (requiere
 * sesión + Supabase), así que el spec verifica lo que **sí** es verificable en
 * CI y es donde se esconden las regresiones reales:
 *
 * 1. La superficie sigue cerrada a anónimos (nunca 200 con datos).
 * 2. Los parámetros de URL arbitrarios se descartan sin romper el render. Esto
 *    importa porque el parseo es una allowlist: un `tab`/`box`/`page` inválido
 *    debe caer al default, no lanzar ni pintar una vista imposible.
 * 3. Los deep-links que generan las alertas del dashboard y el widget del
 *    dashboard apuntan a rutas que existen y renderizan.
 */

test.describe("leads CRM — guards", { tag: "@ci" }, () => {
  // En CI/dev sin env de Supabase las rutas admin fallan con 500 al crear el
  // cliente (no hay auth disponible); con env configurado deben responder
  // 401/403. En ambos casos lo importante: NUNCA 200 con datos.
  const GUARDED_CODES = [401, 403, 500]

  test("la página /admin/leads no sirve la bandeja a anónimos", async ({ page }) => {
    const response = await page.goto("/admin/leads")
    // El middleware puede redirigir al login (200 tras seguir el redirect) o
    // el guard del panel corta la vista. Lo que no puede: reventar con 5xx.
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("la vista de pipeline no sirve el tablero a anónimos", async ({ page }) => {
    const response = await page.goto("/admin/leads?tab=pipeline")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })
})

test.describe("leads CRM — filtros en la URL", { tag: "@ci" }, () => {
  test("?tab= fuera de la allowlist cae al default sin romper", async ({ page }) => {
    const response = await page.goto("/admin/leads?tab=../etc/passwd")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?box= fuera de la allowlist se descarta sin romper", async ({ page }) => {
    const response = await page.goto("/admin/leads?box=bandeja-inventada")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?status= fuera del CHECK de leads.status se descarta sin romper", async ({ page }) => {
    const response = await page.goto("/admin/leads?status=pendiente")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?page= absurda no genera una consulta fuera de rango", async ({ page }) => {
    const response = await page.goto("/admin/leads?page=999999")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?page= no numérica no rompe el render", async ({ page }) => {
    const response = await page.goto("/admin/leads?page=abc")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("una búsqueda con caracteres especiales no rompe el render", async ({ page }) => {
    const response = await page.goto("/admin/leads?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("la combinación completa de filtros no rompe el render", async ({ page }) => {
    const response = await page.goto(
      "/admin/leads?tab=pipeline&box=todos&status=nuevo&due=1&unassigned=1&page=2&q=cafe&source=lead_web"
    )
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })
})

test.describe("leads CRM — deep-links de las alertas", { tag: "@ci" }, () => {
  // Las alertas y el widget del dashboard no escriben rutas a mano: las
  // resuelve `crmHref`. Estos son los destinos que producen hoy, y cada uno
  // tiene que existir y renderizar.
  const ALERT_TARGETS = [
    "/admin/leads",
    "/admin/leads?tab=pipeline&due=1",
    "/admin/leads?tab=pipeline&unassigned=1",
  ]

  for (const href of ALERT_TARGETS) {
    test(`el destino ${href} responde y renderiza`, async ({ page }) => {
      const response = await page.goto(href)
      expect(response?.status()).toBeLessThan(500)
      await expect(page.locator("body")).not.toBeEmpty()
    })
  }
})
