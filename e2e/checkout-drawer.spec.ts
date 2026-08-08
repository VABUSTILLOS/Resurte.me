import { test, expect, type Page } from "@playwright/test"

/**
 * E2E del checkout drawer de alta conversión (mecánica SamCart/ThriveCart).
 *
 * Estrategia: se siembra el carrito en localStorage (sin depender de la BD) y
 * se abre el drawer disparando el evento global `resurte:toggle-checkout-drawer`
 * (la misma mecánica que el botón "Ir a Checkout" del CartDrawer).
 *
 * Se recorre el flujo de pasos (review → address → schedule → bumps → payment)
 * sin completar el pago (no hay credenciales de Stripe en CI) y se verifican
 * las mecánicas de conversión: barra de envío gratis, límite de 3 bumps y
 * retrocompatibilidad con el carrito vacío.
 */

const CART_STORAGE_KEY = "resurte_cart"
const CHECKOUT_DRAWER_EVENT = "resurte:toggle-checkout-drawer"
const CART_DRAWER_EVENT = "resurte:toggle-cart-drawer"

interface SeedItem {
  product_id: number
  name: string
  slug: string
  image_url: string
  brand: string
  price: number
  sale_price: number | null
  quantity: number
  stock_status: string
}

function seedCart(page: Page, items: SeedItem[]) {
  return page.addInitScript(
    ({ key, items: seedItems }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          cart: { items: seedItems },
          coupon: null,
        })
      )
      // Evita que el banner de cookies intercepte clics durante el test.
      localStorage.setItem("resurte_cookie_consent", "accepted")
    },
    { key: CART_STORAGE_KEY, items }
  )
}

async function openCheckoutDrawer(page: Page) {
  // El listener del drawer se registra al hidratar React (los efectos se corren
  // tras el primer render). Reintentamos el dispatch hasta que el drawer abra:
  // si el evento llegó antes de registrarse el listener, es un no-op y el
  // siguiente intento (ya con el listener activo) lo abre.
  //
  // Señal de drawer abierto: el botón "Continuar al envío" es exclusivo del
  // paso "review" del drawer (la página pública también tiene una sección
  // "Tu pedido" en el footer, por eso no usamos el heading como señal).
  const continueBtn = page.getByRole("button", { name: "Continuar al envío" })
  for (let i = 0; i < 6; i++) {
    await page.evaluate((evt) => window.dispatchEvent(new Event(evt)), CHECKOUT_DRAWER_EVENT)
    try {
      await expect(continueBtn).toBeVisible({ timeout: 1000 })
      return
    } catch {
      // sigue reintentando (toggle: si abrió y el check falló por timing, el
      // siguiente dispatch lo cerraría — por eso el check usa timeout amplio)
    }
  }
  throw new Error("No se pudo abrir el checkout drawer")
}

const aguacate = {
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

test.describe("checkout drawer (alta conversión)", () => {
  test("abre el drawer con el carrito y muestra la barra de envío gratis", async ({ page }) => {
    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })

    await openCheckoutDrawer(page)

    // Drawer visible con el paso de revisión (botón exclusivo del drawer)
    await expect(page.getByRole("button", { name: "Continuar al envío" })).toBeVisible()
    await expect(page.getByText("1× Aguacate Hass (caja 10 kg)")).toBeVisible()

    // Barra de envío gratis: subtotal $850 ≥ $500 → envío gratis
    await expect(page.getByText("🎉 Tienes envío gratis")).toBeVisible()
    await expect(page.getByText("Gratis 🎉")).toBeVisible()
  })

  test("subtotal menor al umbral muestra la barra con lo que falta", async ({ page }) => {
    seedCart(page, [{ ...aguacate, price: 250 }])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })

    await openCheckoutDrawer(page)

    await expect(page.getByRole("button", { name: "Continuar al envío" })).toBeVisible()
    // $250 → faltan $250 para envío gratis
    await expect(page.getByText("Agrega $250.00 más para envío gratis")).toBeVisible()
    await expect(page.getByText("$35.00")).toBeVisible() // envío con cargo
  })

  test("carrito vacío: botón de continuar deshabilitado (retrocompatibilidad)", async ({ page }) => {
    seedCart(page, [])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })

    await openCheckoutDrawer(page)

    await expect(page.getByRole("button", { name: "Continuar al envío" })).toBeDisabled()
  })

  test("recorre los pasos hasta pago mostrando el paso de bumps", async ({ page }) => {
    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })

    await openCheckoutDrawer(page)
    await expect(page.getByRole("button", { name: "Continuar al envío" })).toBeVisible()

    // Review → Address
    await page.getByRole("button", { name: "Continuar al envío" }).click()
    await expect(page.getByRole("heading", { name: "Dirección de entrega" })).toBeVisible()

    // Llena la dirección para habilitar continuar
    await page.getByPlaceholder("Av. Insurgentes Sur").fill("Av. Juárez")
    await page.getByPlaceholder("1234", { exact: true }).fill("123")
    await page.getByPlaceholder("Roma Norte").fill("Centro")
    await page.getByPlaceholder("06700").fill("31000")
    await page.getByPlaceholder("55 1234 5678").fill("6141234567")
    await page.getByPlaceholder("tucorreo@ejemplo.com").fill("e2e@resurte.me")

    await page.getByRole("button", { name: "Continuar", exact: true }).click()

    // Address → Schedule
    await expect(page.getByRole("heading", { name: /¿Cuándo entregamos\?/i })).toBeVisible()
    await page.getByRole("button", { name: "Continuar", exact: true }).click()

    // Schedule → Bumps
    // Sin seed de bump_rules el API devuelve vacío → BumpCards renderiza null
    // (fail-open) y se muestra directo el resumen + botón de pagar. Verificamos
    // que el paso no rompe el flujo.
    await expect(page.getByRole("button", { name: /Ir a pagar/ })).toBeVisible()
    await page.getByRole("button", { name: /Ir a pagar/ }).click()

    // Bumps → Payment
    // Sin credenciales de Stripe en CI, el paso de pago muestra el resumen
    // final + botón "Confirmar pedido" (el formulario de Stripe solo se monta
    // tras crear el PaymentIntent).
    await expect(page.getByRole("button", { name: /Confirmar pedido/ })).toBeVisible()
    await expect(page.getByText(/Pago seguro|Guardar mi tarjeta/i).first()).toBeVisible()
  })

  test("cart drawer muestra los order bumps y los transfiere al checkout", async ({ page }) => {
    // Respuesta determinística del API para no depender del seed de bump_rules.
    const stubBumps = {
      bumps: [
        {
          ruleId: 6001,
          trigger_type: "recipe_collection",
          title: "Guacamole preparado",
          description: "El complemento perfecto para tu taquería",
          discount_pct: 0.1,
          product: {
            id: 900,
            name: "Guacamole preparado",
            slug: "guacamole",
            description: "",
            image_url: "",
            price: 35,
            sale_price: null,
            stock_status: "in_stock",
            category_id: 1,
          },
          price: 31.5,
          original_price: 35,
          isRecipeMatch: true,
          badgeLabel: "Sugerido para tu receta / pedido",
          collection_slug: "taquerias-antojitos",
        },
        {
          ruleId: 6002,
          trigger_type: "meat_bbq",
          title: "Sazonador para carne asada",
          description: "Lleva tu carne asada a otro nivel",
          discount_pct: 0.15,
          product: {
            id: 901,
            name: "Sazonador",
            slug: "sazonador",
            description: "",
            image_url: "",
            price: 20,
            sale_price: null,
            stock_status: "in_stock",
            category_id: 4,
          },
          price: 17,
          original_price: 20,
        },
      ],
    }
    await page.route("**/api/cart/bumps", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stubBumps),
      })
    )

    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })

    // Abre el cart drawer (toggle del mismo evento que usa MobileCartBar).
    const restaurantsHint = page.getByText("🔥 Restaurantes también compran")
    let cartDrawerOpen = false
    for (let i = 0; i < 6 && !cartDrawerOpen; i++) {
      await page.evaluate((evt) => window.dispatchEvent(new Event(evt)), CART_DRAWER_EVENT)
      try {
        await expect(restaurantsHint).toBeVisible({ timeout: 1000 })
        cartDrawerOpen = true
      } catch {
        // reintenta hasta que el listener de React esté registrado
      }
    }
    if (!cartDrawerOpen) throw new Error("No se pudo abrir el cart drawer")

    // BumpCards montado en el cross-sell del drawer: 2 tarjetas simultáneas.
    const guacamoleCard = page.getByRole("button", { name: /Guacamole preparado/ })
    await expect(guacamoleCard).toBeVisible()
    await expect(page.getByText("Sugerido para tu receta / pedido")).toBeVisible()
    await expect(page.getByText("Sazonador para carne asada")).toBeVisible()
    await expect(page.getByText(/Hasta 3 artículos especiales por pedido/)).toBeVisible()

    // Selecciona un bump → el subtotal del bump se marca en el drawer.
    await guacamoleCard.click()
    await expect(guacamoleCard).toHaveAttribute("aria-pressed", "true")

    // "Ir a Checkout" transfiere los bumps vía detail.bumps al CheckoutDrawer.
    await page.getByRole("button", { name: /Ir a Checkout/ }).click()

    await expect(page.getByRole("button", { name: "Continuar al envío" })).toBeVisible()
    // El review del checkout incluye el bump: subtotal $850 + bump $31.50.
    await expect(page.getByText("Artículos especiales")).toBeVisible()
    await expect(page.getByText("+$31.50")).toBeVisible()
  })
})
