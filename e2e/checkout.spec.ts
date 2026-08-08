import { test, expect, type Page } from "@playwright/test"

/**
 * Smoke test del checkout público (e-commerce /[slug]/checkout).
 *
 * Estrategia: se siembra el carrito directamente en localStorage para no
 * depender de productos en la BD (la suite e2e corre en CI sin seed). Se
 * recorre el flujo de pasos descompuestos (AddressStep → ScheduleStep →
 * ReviewStep → PaymentStep) verificando breadcrumb e indicador de pasos, sin
 * completar el pago (no hay credenciales de Stripe en CI).
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
      quantity: 1,
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

test.describe("checkout público", () => {
  test("recorre los 4 pasos y muestra breadcrumb + step indicator", async ({ page }) => {
    seedCart(page)

    const response = await page.goto("/chihuahua/checkout", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)

    // Breadcrumb
    await expect(page.getByText("Carrito").first()).toBeVisible()
    await expect(page.getByText("Checkout").first()).toBeVisible()

    // Step indicator: 4 pasos visibles
    const indicator = page.locator(".w-8.h-8.rounded-full")
    await expect(indicator).toHaveCount(4)

    // STEP 1: AddressStep
    await expect(
      page.getByRole("heading", { name: /Dirección de entrega/i })
    ).toBeVisible()

    // Llena el formulario de dirección para habilitar Continuar
    await page.getByPlaceholder("Av. Insurgentes Sur").fill("Av. Juárez")
    await page.getByPlaceholder("1234", { exact: true }).fill("123")
    await page.getByPlaceholder("Roma Norte").fill("Centro")
    await page.getByPlaceholder("06700").fill("31000")
    await page.getByPlaceholder("55 1234 5678").fill("6141234567")

    await page.getByRole("button", { name: "Continuar", exact: true }).click()

    // STEP 2: ScheduleStep
    await expect(
      page.getByRole("heading", { name: /¿Cuándo entregamos\?/i })
    ).toBeVisible()
    await page.getByRole("button", { name: "Continuar", exact: true }).click()

    // STEP 3: ReviewStep
    await expect(
      page.getByRole("heading", { name: /Revisa tu pedido/i })
    ).toBeVisible()
    await expect(page.getByText("Aguacate Hass (caja 10 kg)").first()).toBeVisible()
    await page.getByRole("button", { name: "Continuar al pago", exact: true }).click()

    // STEP 4: PaymentStep — sin credenciales, solo validar que se renderiza
    await expect(
      page.getByRole("heading", { name: /Método de pago/i })
    ).toBeVisible()
    await expect(page.getByText("Tarjeta (Stripe)").first()).toBeVisible()
  })

  test("carrito vacío muestra estado vacío en lugar del flujo", async ({ page }) => {
    const response = await page.goto("/chihuahua/checkout", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)

    await expect(page.getByRole("heading", { name: /Carrito vacío/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /Ver productos/i })).toBeVisible()
  })
})
