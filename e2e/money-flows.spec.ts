import { test, expect, type Page } from "@playwright/test"

/**
 * E2E de flujos de dinero (P0): validación server-side de las APIs que mueven
 * dinero y comportamiento del cupón en el carrito.
 *
 * Estrategia:
 *  - /api/orders y /api/payments/stripe/create-intent validan el body con zod
 *    ANTES de tocar Supabase/Stripe, así que los 400 se pueden probar contra
 *    el dev server real sin credenciales ni seed.
 *  - El cupón se prueba a nivel UI mockeando /api/coupons/validate con route
 *    handlers de Playwright (no hay cupones reales en CI).
 */

const CART_STORAGE_KEY = "resurte_cart"

function seedCart(page: Page) {
  return page.addInitScript((key) => {
    const item = {
      product_id: 999001,
      name: "Aguacate Hass (caja 10 kg)",
      slug: "aguacate-hass",
      image_url: "",
      brand: "Central de Abastos",
      price: 850,
      sale_price: null,
      quantity: 2,
      stock_status: "in_stock",
    }
    localStorage.setItem(
      key,
      JSON.stringify({
        cart: { items: [item] },
        coupon: null,
      })
    )
  }, CART_STORAGE_KEY)
}

/** Payload válido del checkout; cada test rompe un solo campo. */
function validOrderBody() {
  return {
    city_id: 1,
    address: {
      label: "Casa",
      street: "Av. Juárez",
      number: "123",
      interior: "",
      neighborhood: "Centro",
      zip_code: "31000",
      references: "",
    },
    schedule: { date: "2026-09-15", time: "10:00" },
    payment_method: "card",
    subtotal: 1700,
    delivery_fee: 0,
    total: 1700,
    items: [{ product_id: 999001, quantity: 2, unit_price: 850, name: "Aguacate" }],
  }
}

test.describe("API /api/orders — validación de dinero", { tag: "@ci" }, () => {
  test("body vacío → 400 con mapa de campos", async ({ request }) => {
    const response = await request.post("/api/orders", { data: {} })
    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toBeTruthy()
    expect(data.fields).toBeTruthy()
    expect(data.fields.city_id).toBeTruthy()
    expect(data.fields.items).toBeTruthy()
  })

  test("total negativo → 400", async ({ request }) => {
    const body = { ...validOrderBody(), total: -100 }
    const response = await request.post("/api/orders", { data: body })
    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.fields?.total ?? data.error).toBeTruthy()
  })

  test("items vacíos → 400", async ({ request }) => {
    const body = { ...validOrderBody(), items: [] }
    const response = await request.post("/api/orders", { data: body })
    expect(response.status()).toBe(400)
  })

  test("item con cantidad 0 → 400", async ({ request }) => {
    const body = validOrderBody()
    body.items = [{ product_id: 999001, quantity: 0, unit_price: 850, name: "Aguacate" }]
    const response = await request.post("/api/orders", { data: body })
    expect(response.status()).toBe(400)
  })

  test("método de pago fuera de la whitelist → 400", async ({ request }) => {
    const body = { ...validOrderBody(), payment_method: "bitcoin" }
    const response = await request.post("/api/orders", { data: body })
    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toMatch(/método de pago/i)
  })
})

test.describe("API /api/payments/stripe/create-intent — validación", { tag: "@ci" }, () => {
  test("sin order_id → 400", async ({ request }) => {
    const response = await request.post("/api/payments/stripe/create-intent", {
      data: {},
    })
    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.fields?.order_id).toBeTruthy()
  })

  test("order_id de tipo inválido → 400", async ({ request }) => {
    const response = await request.post("/api/payments/stripe/create-intent", {
      data: { order_id: true },
    })
    expect(response.status()).toBe(400)
  })

  // Seguridad: el endpoint NO debe aceptar `amount` del cliente (el monto se
  // deriva del pedido en la BD). Verifica que el esquema lo descarte.
  test("el body no acepta amount del cliente", async ({ request }) => {
    const response = await request.post("/api/payments/stripe/create-intent", {
      data: { amount: 1 },
    })
    // Sin order_id válido debe fallar por validación, nunca crear un intent
    // con el monto enviado.
    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.fields?.order_id).toBeTruthy()
  })
})

test.describe("cupón en carrito — UI", { tag: "@ci" }, () => {
  test("cupón inválido muestra el error del servidor", async ({ page }) => {
    seedCart(page)
    await page.route("**/api/coupons/validate", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Cupón no válido o expirado" }),
      })
    })

    await page.goto("/chihuahua/carrito", { waitUntil: "domcontentloaded" })
    await page.getByPlaceholder("Código de descuento").fill("INVALIDO123")
    await page.getByRole("button", { name: "Aplicar", exact: true }).click()

    await expect(page.getByText("Cupón no válido o expirado")).toBeVisible()
  })

  test("cupón válido se aplica y muestra el descuento", async ({ page }) => {
    seedCart(page)
    await page.route("**/api/coupons/validate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: "RESURTE10",
          discount_type: "percentage",
          discount_value: 10,
          min_order: 0,
        }),
      })
    })

    await page.goto("/chihuahua/carrito", { waitUntil: "domcontentloaded" })
    await page.getByPlaceholder("Código de descuento").fill("RESURTE10")
    await page.getByRole("button", { name: "Aplicar", exact: true }).click()

    // 10% de $1,700 (2 × $850) = $170.00
    await expect(page.getByText(/Cupón RESURTE10 aplicado/i)).toBeVisible()
    await expect(page.getByText(/Descuento de \$170\.00/)).toBeVisible()

    // Quitar el cupón regresa al input
    await page.getByRole("button", { name: "Quitar cupón" }).click()
    await expect(page.getByPlaceholder("Código de descuento")).toBeVisible()
  })
})
