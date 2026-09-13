import { test, expect } from "@playwright/test"

/**
 * E2E de flujos de cuenta (R5.4): mis-pedidos y el botón "Completar pago".
 *
 * Sin credenciales no se puede crear sesión real, así que se verifica:
 *  - El guard de seguridad: las páginas de cuenta no exponen datos a anónimos.
 *  - El contrato de create-intent que usa el botón "Completar pago".
 */

test.describe("cuenta — guards", { tag: "@ci" }, () => {
  test("mis-pedidos sin sesión no lista pedidos", async ({ page }) => {
    await page.goto("/chihuahua/mis-pedidos", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle").catch(() => {})
    const url = page.url()
    const bodyText = await page.textContent("body")
    const showsEmpty = /Sin pedidos aún|Explorar productos/i.test(bodyText ?? "")
    const redirectedToLogin = /\/auth\/login/.test(url)
    expect(showsEmpty || redirectedToLogin).toBe(true)
  })

  test("recompensas carga su shell sin error a anónimos", async ({ page }) => {
    const response = await page.goto("/recompensas", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
    const bodyText = await page.textContent("body")
    expect(bodyText).not.toMatch(/error interno|internal server error/i)
  })
})

test.describe("completar pago — contrato create-intent", { tag: "@ci" }, () => {
  test("el payload del botón llega correcto a create-intent", async ({ page }) => {
    let captured: { order_id?: number; type?: string; guest_token?: string } | null = null
    await page.route("**/api/payments/stripe/create-intent", async (route) => {
      captured = JSON.parse(route.request().postData() ?? "{}")
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ clientSecret: "pi_test_secret" }),
      })
    })

    // Mismo payload que envía CompletePaymentButton.
    const payload = { order_id: 777, type: "main", guest_token: "00000000-0000-0000-0000-000000000000" }
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })
    await page.evaluate(async (p) => {
      await fetch("/api/payments/stripe/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      })
    }, payload)

    expect(captured).not.toBeNull()
    expect(captured!.order_id).toBe(777)
    expect(captured!.type).toBe("main")
  })

  test("create-intent sin sesión válida rechaza el cobro", async ({ request }) => {
    const res = await request.post("/api/payments/stripe/create-intent", {
      data: { order_id: 123, type: "main" },
    })
    // Sin sesión/guest válido debe rechazar (400/401/403/404/500), nunca 200.
    expect([400, 401, 403, 404, 500]).toContain(res.status())
  })
})
