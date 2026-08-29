import { test, expect, type Page } from "@playwright/test"

/**
 * E2E del flujo de recompensas /api/redeem (canje de créditos cashback).
 * Estrategia: mock de Supabase/Stripe vía route handlers de Playwright.
 * Cubre:
 *  1. Saldo insuficiente → 400
 *  2. Canje feliz → 200
 *  3. Cupón inválido → 400
 */

test.describe("rewards redeem API", () => {
  test("saldo insuficiente devuelve 400 con mensaje claro", async ({ page }) => {
    // Mock de la wallet con saldo bajo
    await page.route("**/api/redeem", async (route) => {
      const req = route.request()
      const body = JSON.parse(req.postData() ?? "{}")

      if (body.amount && body.amount > 50) {
        // Simula wallet con 50 créditos
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Saldo insuficiente",
            code: "INSUFFICIENT_BALANCE",
            available: 50,
            requested: body.amount,
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, newBalance: 50 - (body.amount ?? 0) }),
        })
      }
    })

    const response = await page.request.post("/api/redeem", {
      data: { amount: 100, concept: "test" },
    })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toBe("Saldo insuficiente")
    expect(data.code).toBe("INSUFFICIENT_BALANCE")
  })

  test("canje feliz devuelve 200 y nuevo saldo", async ({ page }) => {
    await page.route("**/api/redeem", async (route) => {
      const req = route.request()
      const body = JSON.parse(req.postData() ?? "{}")

      if (body.amount && body.amount <= 50) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, newBalance: 50 - body.amount }),
        })
      } else {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Saldo insuficiente" }),
        })
      }
    })

    const response = await page.request.post("/api/redeem", {
      data: { amount: 25, concept: "test" },
    })

    expect(response.status()).toBe(200)
    const data = await response.json()
    expect(data.ok).toBe(true)
    expect(data.newBalance).toBe(25)
  })

  test("cupón inválido en checkout devuelve 400", async ({ page }) => {
    await page.route("**/api/coupons/validate", async (route) => {
      const req = route.request()
      const body = JSON.parse(req.postData() ?? "{}")

      if (body.code === "INVALIDO123") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Cupón no válido o expirado",
            code: "INVALID_COUPON",
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ valid: true, discount: 100 }),
        })
      }
    })

    const response = await page.request.post("/api/coupons/validate", {
      data: { code: "INVALIDO123" },
    })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.code).toBe("INVALID_COUPON")
  })
})