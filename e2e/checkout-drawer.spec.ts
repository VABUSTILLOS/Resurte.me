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
 * las mecánicas de conversión: barra de envío gratis, bumps encadenados sin
 * tope artificial (con su persistencia al salir del checkout) y
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

test.describe("checkout drawer (alta conversión)", { tag: "@ci" }, () => {
  test("abre el drawer con el carrito y muestra la barra de envío gratis", async ({ page }) => {
    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })

    await openCheckoutDrawer(page)

    // Drawer visible con el paso de revisión (botón exclusivo del drawer)
    await expect(page.getByRole("button", { name: "Continuar al envío" })).toBeVisible()
    await expect(page.getByText("1× Aguacate Hass (caja 10 kg)")).toBeVisible()

    // Barra de envío gratis: subtotal $850 ≥ $500 → envío gratis.
    // El texto existe duplicado en el DOM (variantes responsive); se acota al
    // diálogo de Checkout y a la variante visible para no violar strict mode.
    const drawer = page.getByLabel("Checkout", { exact: true })
    await expect(drawer.getByText("🎉 Tienes envío gratis").filter({ visible: true })).toBeVisible()
    await expect(drawer.getByText("Gratis 🎉").filter({ visible: true })).toBeVisible()
  })

  test("subtotal menor al umbral muestra la barra con lo que falta", async ({ page }) => {
    seedCart(page, [{ ...aguacate, price: 250 }])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })

    await openCheckoutDrawer(page)

    await expect(page.getByRole("button", { name: "Continuar al envío" })).toBeVisible()
    // $250 → faltan $250 para envío gratis
    const drawer = page.getByLabel("Checkout", { exact: true })
    await expect(drawer.getByText("Agrega $250.00 más para envío gratis").filter({ visible: true })).toBeVisible()
    await expect(drawer.getByText("$125.00").filter({ visible: true })).toBeVisible() // envío con cargo
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
    //
    // La señal de apertura es el **propio diálogo**, no un texto de su
    // contenido: `CartDrawer` devuelve `null` cuando está cerrado
    // (`cart-drawer.tsx`), así que el `role="dialog"` solo existe abierto. El
    // aviso de cross-sell que se usaba antes ("🔥 Restaurantes también compran")
    // solo se pinta con el carrito **no vacío** (`cart.items.length > 0`), así
    // que servía de señal para dos cosas distintas: cuando faltaba, el bucle no
    // sabía si el drawer no había abierto o si el carrito aún no había hidratado
    // de `localStorage` — y el error final acusaba al drawer en ambos casos.
    //
    // Y el reintento es **idempotente**: el evento es un *toggle*, así que
    // despachar a ciegas podía cerrar el drawer que el intento anterior acababa
    // de abrir (el bucle oscilaba y podía terminar en cerrado). Ahora solo se
    // despacha si se observa cerrado.
    const cartDrawer = page.getByRole("dialog", { name: "Mi Carrito" })
    const restaurantsHint = page.getByText("🔥 Restaurantes también compran")
    for (let i = 0; i < 6; i++) {
      if (await cartDrawer.isVisible()) break
      await page.evaluate((evt) => window.dispatchEvent(new Event(evt)), CART_DRAWER_EVENT)
      await cartDrawer.waitFor({ state: "visible", timeout: 1000 }).catch(() => {})
    }
    await expect(cartDrawer).toBeVisible()
    // El carrito viene sembrado en `localStorage`, así que el aviso depende de
    // la hidratación del store, no de la red: se le da su propia espera.
    await expect(restaurantsHint).toBeVisible({ timeout: 5000 })

    // BumpCards montado en el cross-sell del drawer: 2 tarjetas simultáneas.
    const guacamoleCard = page.getByRole("button", { name: /Guacamole preparado/ })
    await expect(guacamoleCard).toBeVisible()
    await expect(page.getByText("Sugerido para tu receta / pedido")).toBeVisible()
    // El encabezado es el nombre real del producto; el título adorno de la
    // bump_rule ya no se pinta en la tarjeta.
    await expect(page.getByText("Sazonador", { exact: true })).toBeVisible()
    await expect(page.getByText("Sazonador para carne asada")).toHaveCount(0)
    await expect(page.getByText(/Hasta 3 artículos especiales por pedido/)).toBeVisible()

    // Selecciona un bump → el subtotal del bump se marca en el drawer.
    await guacamoleCard.click()
    await expect(guacamoleCard).toHaveAttribute("aria-pressed", "true")

    // "Ir a Checkout" transfiere los bumps vía detail.bumps al CheckoutDrawer.
    await page.getByRole("button", { name: /Ir a Checkout/ }).click()

    await expect(page.getByRole("button", { name: "Continuar al envío" })).toBeVisible()
    // El review del checkout incluye el bump: subtotal $850 + bump $31.50.
    // exact: true — "Artículos especiales" como subcadena también coincide con
    // "Hasta 3 artículos especiales por pedido." del cart drawer (strict mode).
    await expect(page.getByText("Artículos especiales", { exact: true })).toBeVisible()
    await expect(page.getByText("+$31.50", { exact: true })).toBeVisible()
  })

  test("checkout: el bump entra al pedido, su tarjeta desaparece y las cantidades son editables", async ({
    page,
  }) => {
    // Pool de 5 ofertas para poder observar la ventana deslizante: solo se
    // muestran MAX_BUMPS candidatos a la vez (3), nunca el pool completo.
    const bump = (ruleId: number, name: string, price: number, categoryId: number) => ({
      ruleId,
      trigger_type: "perishables",
      title: name,
      description: `Complemento ${name} para tu pedido`,
      discount_pct: 0.1,
      product: {
        id: 900 + ruleId,
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        description: "",
        image_url: "",
        price: price + 5,
        sale_price: null,
        stock_status: "in_stock",
        category_id: categoryId,
      },
      price,
      original_price: price + 5,
    })
    const stubBumps = {
      bumps: [
        bump(6101, "Guacamole preparado", 31.5, 1),
        bump(6102, "Sazonador", 17, 4),
        bump(6103, "Tortillas", 22, 5),
        bump(6104, "Salsa", 18, 6),
        bump(6105, "Queso", 25, 7),
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
    await openCheckoutDrawer(page)

    const drawer = page.getByLabel("Checkout", { exact: true })
    const aguacateLabel = "Aguacate Hass (caja 10 kg)"
    // Las tarjetas de bump viven en el grupo "Artículos especiales": así el
    // locator no choca con los steppers ("Aumentar cantidad de …").
    const bumpGroup = drawer.getByRole("group", { name: "Artículos especiales" })
    const bumpCard = (name: string) =>
      bumpGroup.locator("button").filter({ hasText: name })
    const visibleText = (text: string) => drawer.getByText(text, { exact: true }).filter({ visible: true })

    // Ventana inicial: 3 ofertas visibles, el resto del pool oculto.
    await expect(bumpCard("Guacamole preparado")).toBeVisible()
    await expect(bumpCard("Tortillas")).toBeVisible()
    await expect(bumpCard("Salsa")).toHaveCount(0)
    await expect(bumpCard("Queso")).toHaveCount(0)
    await expect(bumpGroup.locator("button")).toHaveCount(3)
    await expect(
      bumpGroup.getByText("Elige una oferta: entra a tu pedido y aparece la siguiente.")
    ).toBeVisible()

    // Piso 0: con 1 unidad el "−" está operativo (el checkout ya no bloquea la
    // bajada a 0; eliminar exige un segundo "−" y confirmación, ver el test
    // "el '−' baja hasta 0 y el segundo '−' pide confirmar la eliminación").
    await expect(
      drawer.getByRole("button", { name: `Reducir cantidad de ${aguacateLabel}` })
    ).toBeEnabled()

    // "+" sube la cantidad del artículo del catálogo y recalcula su línea.
    await drawer.getByRole("button", { name: `Aumentar cantidad de ${aguacateLabel}` }).click()
    await expect(drawer.getByText(`2× ${aguacateLabel}`)).toBeVisible()
    await expect(visibleText("$1700.00").first()).toBeVisible() // línea + total
    await expect(drawer.getByText("Tu pedido (2)")).toBeVisible()
    // Con 2 unidades el "−" sigue operativo.
    await expect(
      drawer.getByRole("button", { name: `Reducir cantidad de ${aguacateLabel}` })
    ).toBeEnabled()

    // Elegir un bump: la tarjeta DESAPARECE (ya vive como línea del pedido) y su
    // hueco lo ocupa la siguiente oferta del pool. Nunca hay más de 3 tarjetas.
    await bumpCard("Guacamole preparado").click()
    await expect(bumpCard("Guacamole preparado")).toHaveCount(0)
    await expect(drawer.getByText("1× Guacamole preparado")).toBeVisible()
    await expect(drawer.getByText("Tu pedido (3)")).toBeVisible()
    await expect(visibleText("$31.50").first()).toBeVisible() // línea del bump
    await expect(visibleText("+$31.50").first()).toBeVisible() // subtotal especiales
    // …y el total del pedido incluye el bump ($1700 + $31.50).
    await expect(visibleText("$1731.50").first()).toBeVisible()

    // …y revela la siguiente oferta del pool sin pasar de 3 tarjetas.
    await expect(bumpCard("Salsa")).toBeVisible()
    await expect(bumpCard("Queso")).toHaveCount(0)
    await expect(bumpGroup.locator("button")).toHaveCount(3)

    // La cantidad del bump también es editable con "+".
    await drawer.getByRole("button", { name: "Aumentar cantidad de Guacamole preparado" }).click()
    await expect(drawer.getByText("2× Guacamole preparado")).toBeVisible()
    await expect(drawer.getByText("Tu pedido (4)")).toBeVisible()
    await expect(visibleText("$63.00").first()).toBeVisible()
    await expect(visibleText("+$63.00").first()).toBeVisible()

    // El encadenamiento continúa: el segundo bump desaparece y entra el quinto.
    await bumpCard("Sazonador").click()
    await expect(bumpCard("Sazonador")).toHaveCount(0)
    await expect(drawer.getByText("1× Sazonador")).toBeVisible()
    await expect(bumpCard("Queso")).toBeVisible()
    await expect(bumpGroup.locator("button")).toHaveCount(3)

    // Al agotarse el pool la ventana se encoge (2, luego 1) y, cuando ya no
    // queda ninguna oferta por mostrar, la sección desaparece del todo.
    await bumpCard("Tortillas").click()
    await expect(bumpCard("Tortillas")).toHaveCount(0)
    await expect(bumpGroup.locator("button")).toHaveCount(2)
    await bumpCard("Salsa").click()
    await expect(bumpGroup.locator("button")).toHaveCount(1)
    await bumpCard("Queso").click()
    await expect(bumpGroup).toHaveCount(0)

    // Los 5 bumps quedaron como líneas del pedido: 2 aguacate + 6 unidades de
    // bump = 8 artículos, y $1700 + $145 de especiales = $1845.
    await expect(drawer.getByText("Tu pedido (8)")).toBeVisible()
    await expect(visibleText("+$145.00").first()).toBeVisible()
    await expect(visibleText("$1845.00").first()).toBeVisible()
  })

  test("checkout: la tarjeta muestra el nombre real del producto y el motivo como subtítulo", async ({
    page,
  }) => {
    // El título de la bump_rule es una frase adorno; el nombre real vive en el
    // producto. La tarjeta debe encabezar con el nombre, no con la frase.
    const bump = (
      ruleId: number,
      productName: string,
      title: string,
      description: string,
      triggerType: string,
      badgeLabel?: string
    ) => ({
      ruleId,
      trigger_type: triggerType,
      title,
      description,
      discount_pct: 0.1,
      badgeLabel,
      product: {
        id: 900 + ruleId,
        name: productName,
        slug: productName.toLowerCase().replace(/\s+/g, "-"),
        description: "",
        image_url: "",
        price: 30,
        sale_price: null,
        stock_status: "in_stock",
        category_id: 1,
      },
      price: 27,
      original_price: 30,
    })

    await page.route("**/api/cart/bumps", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bumps: [
            bump(
              6201,
              "Limón",
              "Limón para tus mariscos",
              "Ideal con Camarón",
              "ingredient_affinity",
              "Ideal con tu pedido"
            ),
            bump(6202, "Chile Serrano", "Chiles secos para tu salsa", "Ideal con Cebolla Blanca", "ingredient_affinity", "Ideal con tu pedido"),
          ],
        }),
      })
    )

    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })
    await openCheckoutDrawer(page)

    const drawer = page.getByLabel("Checkout", { exact: true })
    const bumpGroup = drawer.getByRole("group", { name: "Artículos especiales" })

    // Encabezado = nombre real del catálogo.
    await expect(bumpGroup.getByText("Limón", { exact: true })).toBeVisible()
    await expect(bumpGroup.getByText("Chile Serrano", { exact: true })).toBeVisible()
    // El título adorno NO se usa como encabezado.
    await expect(drawer.getByText("Limón para tus mariscos", { exact: true })).toHaveCount(0)
    await expect(drawer.getByText("Chiles secos para tu salsa", { exact: true })).toHaveCount(0)
    // El motivo y el badge del tier de afinidad sí se muestran.
    await expect(bumpGroup.getByText("Ideal con Cebolla Blanca", { exact: true })).toBeVisible()
    await expect(bumpGroup.getByText("Ideal con tu pedido").first()).toBeVisible()

    // Al elegirlo entra al pedido con el nombre real, no con la frase.
    await bumpGroup.locator("button").filter({ hasText: "Limón" }).first().click()
    await expect(bumpGroup.getByText("Limón", { exact: true })).toHaveCount(0)
    await expect(drawer.getByText("1× Limón", { exact: true })).toBeVisible()
  })

  test("checkout: el '−' baja hasta 0 y el segundo '−' pide confirmar la eliminación", async ({
    page,
  }) => {
    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })
    await openCheckoutDrawer(page)

    const drawer = page.getByLabel("Checkout", { exact: true })
    const label = "Aguacate Hass (caja 10 kg)"
    const zeroLine = drawer.getByText(`0× ${label}`, { exact: true })
    const reduceBtn = drawer.getByRole("button", { name: `Reducir cantidad de ${label}` })
    const removeBtn = drawer.getByRole("button", { name: `Eliminar ${label} del pedido` })
    // El diálogo de confirmación comparte el rol con el drawer: se acota por
    // su nombre accesible ("¿Eliminar del pedido?").
    const dialog = page.getByRole("dialog", { name: "¿Eliminar del pedido?" })

    // 1 → 0: la línea SIGUE en el pedido, marcada "En 0" y sin cobrar.
    await reduceBtn.click()
    await expect(zeroLine).toBeVisible()
    await expect(drawer.getByText("En 0", { exact: true }).first()).toBeVisible()
    await expect(drawer.getByText("Tu pedido (0)")).toBeVisible()
    await expect(drawer.getByText("$0.00").first()).toBeVisible()
    // Con el pedido en 0 no se avanza al envío.
    await expect(drawer.getByRole("button", { name: "Continuar al envío" })).toBeDisabled()

    // El "−" en 0 ya no reduce: pide confirmar la eliminación.
    await expect(removeBtn).toBeEnabled()
    await removeBtn.click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(label, { exact: true })).toBeVisible()

    // Cancelar: la línea se queda en 0 y no se elimina nada.
    await dialog.getByRole("button", { name: "Cancelar" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(zeroLine).toBeVisible()

    // Volver a subir desde 0 restaura la línea en el carrito (y su precio).
    await drawer.getByRole("button", { name: `Aumentar cantidad de ${label}` }).click()
    await expect(drawer.getByText(`1× ${label}`, { exact: true })).toBeVisible()
    await expect(drawer.getByText("En 0", { exact: true })).toHaveCount(0)
    await expect(drawer.getByText("Tu pedido (1)")).toBeVisible()

    // Confirmar: la línea sale del pedido.
    await reduceBtn.click()
    await expect(zeroLine).toBeVisible()
    await removeBtn.click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Eliminar" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(zeroLine).toHaveCount(0)
    await expect(drawer.getByText("Tu pedido (0)")).toBeVisible()
  })

  test("checkout: un artículo especial en 0 se elimina solo con confirmación", async ({ page }) => {
    // Un solo bump en el pool: al quitarse vuelve a ofrecerse.
    const guacamole = {
      ruleId: 6201,
      trigger_type: "perishables",
      title: "Guacamole preparado",
      description: "El complemento perfecto para tu taquería",
      discount_pct: 0.1,
      product: {
        id: 9201,
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
    }
    await page.route("**/api/cart/bumps", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bumps: [guacamole] }),
      })
    )

    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })
    await openCheckoutDrawer(page)

    const drawer = page.getByLabel("Checkout", { exact: true })
    const bumpGroup = drawer.getByRole("group", { name: "Artículos especiales" })
    const bumpCard = bumpGroup.locator("button").filter({ hasText: "Guacamole preparado" })
    const dialog = page.getByRole("dialog", { name: "¿Eliminar del pedido?" })

    // Agrega el bump: la tarjeta desaparece y entra como línea del pedido.
    await bumpCard.click()
    await expect(bumpCard).toHaveCount(0)
    await expect(drawer.getByText("1× Guacamole preparado")).toBeVisible()

    // 1 → 0: el bump se queda en el pedido (los bumps no viven en el carrito).
    await drawer.getByRole("button", { name: "Reducir cantidad de Guacamole preparado" }).click()
    await expect(drawer.getByText("0× Guacamole preparado")).toBeVisible()
    await expect(drawer.getByText("En 0", { exact: true }).first()).toBeVisible()
    await expect(drawer.getByText("Tu pedido (1)")).toBeVisible() // solo el aguacate
    await expect(bumpCard).toHaveCount(0) // sigue seleccionado, no se re-ofrece

    // Segundo "−": confirma la eliminación y el bump vuelve a la ventana de ofertas.
    await drawer.getByRole("button", { name: "Eliminar Guacamole preparado del pedido" }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Eliminar" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(drawer.getByText("0× Guacamole preparado")).toHaveCount(0)
    await expect(bumpCard).toBeVisible()
  })

  test("checkout: pide todas las ofertas (sin 'limit') y encadena más allá de la ventana de 3", async ({
    page,
  }) => {
    // Regresión del tope artificial: el checkout pedía `limit=12` y, agotado el
    // pool, no había forma de agregar más ofertas. Ahora omite `limit` por
    // completo para que el servidor devuelva TODAS las reglas que apliquen.
    const requestBodies: { method: string; body: Record<string, unknown> | null }[] = []
    const bump = (ruleId: number, name: string, price: number) => ({
      ruleId,
      trigger_type: "perishables",
      title: name,
      description: `Complemento ${name} para tu pedido`,
      discount_pct: 0.1,
      product: {
        id: 900 + ruleId,
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        description: "",
        image_url: "",
        price: price + 5,
        sale_price: null,
        stock_status: "in_stock",
        category_id: 1,
      },
      price,
      original_price: price + 5,
    })
    // Pool de 14 ofertas: más que el tope anterior (12), para que el encadenado
    // no pueda agotarse dentro del test.
    const names = Array.from({ length: 14 }, (_, i) => `Oferta ${i + 1}`)
    await page.route("**/api/cart/bumps", (route) => {
      const raw = route.request().postData()
      let parsed: Record<string, unknown> | null = null
      if (raw) {
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>
        } catch {
          parsed = null
        }
      }
      requestBodies.push({ method: route.request().method(), body: parsed })
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bumps: names.map((name, i) => bump(6201 + i, name, 10 + i)),
        }),
      })
    })

    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })
    await openCheckoutDrawer(page)

    const drawer = page.getByLabel("Checkout", { exact: true })
    const bumpGroup = drawer.getByRole("group", { name: "Artículos especiales" })
    const bumpCard = (name: string) => bumpGroup.locator("button").filter({ hasText: name })

    // La petición NO lleva `limit`: el cliente pide el pool completo.
    // El fetch sale de un efecto posterior al render, así que se espera.
    await expect.poll(() => requestBodies.length).toBeGreaterThan(0)
    for (const { method, body } of requestBodies) {
      expect(method).toBe("POST")
      expect(body).not.toBeNull()
      expect(body).not.toHaveProperty("limit")
    }

    // Ventana de 3 tarjetas: el resto del pool queda oculto hasta elegir.
    await expect(bumpGroup.locator("button")).toHaveCount(3)
    await expect(bumpCard("Oferta 4")).toHaveCount(0)

    // El encadenado no se agota: cada elección repone la ventana a 3 y sigue
    // revelando ofertas nuevas más allá de las 3 visibles.
    await bumpCard("Oferta 1").click()
    await expect(bumpCard("Oferta 1")).toHaveCount(0)
    await expect(drawer.getByText("1× Oferta 1")).toBeVisible()
    await expect(bumpCard("Oferta 4")).toBeVisible()
    await expect(bumpGroup.locator("button")).toHaveCount(3)

    await bumpCard("Oferta 2").click()
    await bumpCard("Oferta 3").click()
    await bumpCard("Oferta 4").click()
    await expect(drawer.getByText("1× Oferta 4")).toBeVisible()
    // Sigue habiendo 3 tarjetas en la ventana y una oferta que antes no se veía.
    await expect(bumpGroup.locator("button")).toHaveCount(3)
    await expect(bumpCard("Oferta 7")).toBeVisible()

    // Las 4 ofertas elegidas viven como líneas del pedido.
    await expect(drawer.getByText("Tu pedido (5)")).toBeVisible() // 1 aguacate + 4 bumps
  })

  test("checkout: los bumps agregados sobreviven salir del checkout (recarga)", async ({ page }) => {
    // Petición del usuario: al salir del checkout las ofertas agregadas se
    // perdían. Ahora la selección persiste en el dispositivo (localStorage
    // `resurte_bumps`) y, con sesión, también en `user_carts.bumps`.
    const guacamole = {
      ruleId: 6301,
      trigger_type: "perishables",
      title: "Guacamole preparado",
      description: "Complemento para tu pedido",
      discount_pct: 0.1,
      product: {
        id: 9301,
        name: "Guacamole preparado",
        slug: "guacamole-preparado",
        description: "",
        image_url: "",
        price: 35,
        sale_price: null,
        stock_status: "in_stock",
        category_id: 1,
      },
      price: 31.5,
      original_price: 35,
    }
    await page.route("**/api/cart/bumps", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bumps: [guacamole] }),
      })
    )

    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })
    await openCheckoutDrawer(page)

    const drawer = page.getByLabel("Checkout", { exact: true })
    const bumpGroup = drawer.getByRole("group", { name: "Artículos especiales" })
    const bumpCard = bumpGroup.locator("button").filter({ hasText: "Guacamole preparado" })

    // Agrega el bump: entra al pedido y su tarjeta desaparece.
    await bumpCard.click()
    await expect(drawer.getByText("1× Guacamole preparado")).toBeVisible()
    await expect(bumpCard).toHaveCount(0)

    // Sale del checkout recargando la página (equivale a volver más tarde).
    await page.reload({ waitUntil: "domcontentloaded" })
    await openCheckoutDrawer(page)

    const drawerAfter = page.getByLabel("Checkout", { exact: true })
    const bumpGroupAfter = drawerAfter.getByRole("group", { name: "Artículos especiales" })

    // El bump sigue en el pedido: no se perdió al salir del checkout.
    await expect(drawerAfter.getByText("1× Guacamole preparado")).toBeVisible()
    await expect(drawerAfter.getByText("Tu pedido (2)")).toBeVisible() // aguacate + bump
    await expect(drawerAfter.getByText("+$31.50").filter({ visible: true }).first()).toBeVisible()
    // …y no se vuelve a ofrecer como tarjeta (ya está en el pedido).
    await expect(
      bumpGroupAfter.locator("button").filter({ hasText: "Guacamole preparado" })
    ).toHaveCount(0)
  })

  /**
   * El aviso "… agregado al carrito" (toast.tsx) se anclaba abajo-derecha en
   * desktop y tapaba el CTA "Hacer Checkout" de la barra de carrito (162×29px).
   * Ahora vive abajo-izquierda y en sm+ a la MISMA altura que el WhatsApp FAB
   * (--toast-bottom-gap: 0), en la esquina opuesta; el StickyCatalogButton, que
   * ocupa esa misma esquina, se aparta mientras hay avisos (body.has-toast +
   * --toast-stack-h) en vez de quedar debajo del aviso.
   *
   * El contenedor de toasts existe siempre (ToastProvider en layout.tsx) pero su
   * caja mide 0 sin avisos, así que validamos su posición computada contra las
   * cajas reales del carril (el carrito sembrado monta la barra sin depender de
   * la BD ni del catálogo local).
   */
  test("el aviso no tapa los CTAs del carril inferior", async ({ page, isMobile }) => {
    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })

    const checkout = page.getByRole("button", { name: "Hacer Checkout" })
    await expect(checkout).toBeVisible()
    const checkoutBox = await checkout.boundingBox()
    const viewport = page.viewportSize()
    expect(checkoutBox).not.toBeNull()
    expect(viewport).not.toBeNull()

    const anchor = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('div[aria-live="polite"].fixed')
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        left: el.getBoundingClientRect().left,
        bottom: parseFloat(cs.bottom),
        maxWidth: parseFloat(cs.maxWidth),
      }
    })
    expect(anchor).not.toBeNull()
    if (!anchor || !checkoutBox || !viewport) return

    // 1) En sm+ el aviso se ancla a la izquierda: su borde derecho máximo
    //    (left + max-w-sm) queda a la izquierda del botón de checkout. En mobile
    //    el aviso es full-width por diseño y se separa del CTA en vertical.
    if (!isMobile) {
      expect(anchor.left + anchor.maxWidth).toBeLessThanOrEqual(checkoutBox.x)
    }

    // 2) Arranca por encima de la barra de carrito (no la pisa).
    const toastBottomY = viewport.height - anchor.bottom
    expect(toastBottomY).toBeLessThanOrEqual(checkoutBox.y)

    // 3) En desktop comparte fila con el WhatsApp FAB y libra el pill "Ver todos
    //    los productos" (misma esquina): el pill sube por encima del stack de
    //    avisos. Simulamos el estado que publica ToastProvider (clase + token)
    //    porque disparar un aviso real exige catálogo con productos.
    const whatsapp = await page.locator(".whatsapp-floating").boundingBox()
    if (!isMobile && whatsapp) {
      expect(Math.abs(whatsapp.y + whatsapp.height - toastBottomY)).toBeLessThanOrEqual(2)
    }

    const sticky = page.locator(".sticky-catalog-button")
    const railBox = (await sticky.count()) > 0 ? await sticky.boundingBox() : null
    if (!isMobile && railBox) {
      const stackH = 50 // alto de un aviso de una línea (px-4 py-3 + borde)
      await page.evaluate((h) => {
        document.body.classList.add("has-toast")
        document.documentElement.style.setProperty("--toast-stack-h", `${h}px`)
      }, stackH)
      // El pill se aparta con transition-all 300ms: se sondea hasta que su borde
      // inferior libra el borde superior del aviso (alto del stack + 10px de aire).
      const pillBottom = async () => {
        const b = await sticky.boundingBox()
        return b ? b.y + b.height : Number.POSITIVE_INFINITY
      }
      await expect.poll(pillBottom).toBeLessThanOrEqual(toastBottomY - stackH - 9)
      // Y vuelve al carril cuando expira el último aviso (no queda desplazado).
      await page.evaluate(() => {
        document.body.classList.remove("has-toast")
        document.documentElement.style.removeProperty("--toast-stack-h")
      })
      await expect.poll(pillBottom).toBeGreaterThan(toastBottomY - stackH - 9)
    }
  })

  /**
   * Libro de direcciones del checkout (migración 00117).
   *
   * El invitado ya no reescribe su dirección en cada compra: el servidor le
   * guarda las que usa (por `guest_token`) y el checkout le preselecciona la
   * predeterminada / última usada. Se stubea el endpoint anónimo para no
   * depender de la BD y se verifica la mecánica completa: preselección, cambio
   * a otra guardada, "Nueva dirección" y borrado con confirmación.
   */
  test("checkout: el invitado ve sus direcciones guardadas y elige entre ellas", async ({ page }) => {
    const savedAddresses = [
      {
        id: 7001,
        label: "Casa",
        street: "Av. Reforma",
        number: "100",
        interior: null,
        neighborhood: "Centro",
        zip_code: "31000",
        references: null,
        is_default: true,
        last_used_at: "2026-09-01T10:00:00.000Z",
      },
      {
        id: 7002,
        label: "Oficina",
        street: "Calle Aldama",
        number: "45",
        interior: "2B",
        neighborhood: "Cuauhtémoc",
        zip_code: "31020",
        references: null,
        is_default: false,
        last_used_at: "2026-09-10T10:00:00.000Z",
      },
    ]

    await page.route("**/api/addresses/guest*", (route) => {
      if (route.request().method() === "DELETE") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ deleted: true }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ addresses: savedAddresses }),
      })
    })

    seedCart(page, [aguacate])
    await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })
    await openCheckoutDrawer(page)

    await page.getByRole("button", { name: "Continuar al envío" }).click()
    await expect(page.getByRole("heading", { name: "Dirección de entrega" })).toBeVisible()

    const group = page.getByRole("radiogroup", { name: "Direcciones guardadas" })
    await expect(group).toBeVisible()
    // Invitado: sin enlace a "Mis direcciones" (esa página exige sesión).
    await expect(group.getByRole("radio")).toHaveCount(3) // + Nueva dirección + 2 guardadas
    await expect(page.getByRole("link", { name: "Gestionar direcciones" })).toHaveCount(0)

    // Preselección: la predeterminada rellena el formulario sin escribir nada.
    await expect(group.getByRole("radio", { name: /Casa/ })).toHaveAttribute("aria-checked", "true")
    await expect(page.getByPlaceholder("Av. Insurgentes Sur")).toHaveValue("Av. Reforma")
    await expect(page.getByPlaceholder("1234", { exact: true })).toHaveValue("100")
    await expect(page.getByPlaceholder("Roma Norte")).toHaveValue("Centro")
    await expect(page.getByPlaceholder("06700")).toHaveValue("31000")

    // Cambiar a otra guardada: rellena el formulario con esa dirección.
    await group.getByRole("radio", { name: /Oficina/ }).click()
    await expect(page.getByPlaceholder("Av. Insurgentes Sur")).toHaveValue("Calle Aldama")
    await expect(page.getByPlaceholder("Depto 4B")).toHaveValue("2B")
    await expect(group.getByRole("radio", { name: /Oficina/ })).toHaveAttribute("aria-checked", "true")

    // "Nueva dirección" limpia el formulario (y deselecciona la guardada).
    await group.getByRole("radio", { name: "+ Nueva dirección" }).click()
    await expect(page.getByPlaceholder("Av. Insurgentes Sur")).toHaveValue("")

    // Eliminar pide confirmación en dos pasos y luego hace DELETE al endpoint.
    await page.getByRole("button", { name: "Eliminar dirección Oficina" }).click()
    const deleteRequest = page.waitForRequest(
      (req) => req.method() === "DELETE" && req.url().includes("/api/addresses/guest")
    )
    await page.getByRole("button", { name: "Eliminar", exact: true }).click()
    await deleteRequest
    await expect(group.getByRole("radio", { name: /Oficina/ })).toHaveCount(0)
    await expect(group.getByRole("radio", { name: /Casa/ })).toBeVisible()
  })
})
