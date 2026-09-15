import { test, expect, type Page } from "@playwright/test"

/**
 * E2E de /calificar (reseñas de pedidos entregados).
 *
 * Estrategia: se mockea /api/reviews con route handlers porque el CI corre
 * contra un Supabase dummy (https://example.supabase.co), así que ningún test
 * puede depender de la base real. Los casos de validación pura (400) sí van
 * contra la ruta real, porque rechazan antes de tocar la base de datos.
 */

interface MockOpts {
  /** Respuesta de GET /api/reviews (prefill) */
  prefill?: { status: number; body?: unknown }
  /** Respuesta de POST /api/reviews */
  post?: { status: number; body?: unknown }
}

/** Mockea /api/reviews y devuelve los bodies que el cliente envió por POST. */
async function mockReviews(page: Page, opts: MockOpts = {}) {
  const posted: Record<string, unknown>[] = []

  await page.route("**/api/reviews**", async (route) => {
    const request = route.request()

    if (request.method() === "GET") {
      const prefill = opts.prefill ?? { status: 200, body: {} }
      await route.fulfill({
        status: prefill.status,
        contentType: "application/json",
        body: JSON.stringify(prefill.body ?? {}),
      })
      return
    }

    posted.push(JSON.parse(request.postData() ?? "{}"))
    const post = opts.post ?? { status: 200, body: { ok: true } }
    await route.fulfill({
      status: post.status,
      contentType: "application/json",
      body: JSON.stringify(post.body ?? {}),
    })
  })

  return posted
}

const PREFILL_OK = { orderId: 42, delivered: true, review: null }

function star(page: Page, n: number) {
  return page.getByRole("button", { name: `${n} estrella${n === 1 ? "" : "s"}`, exact: true })
}

test.describe("calificar — formulario de reseña", { tag: "@ci" }, () => {
  test("envía una reseña nueva y confirma con agradecimiento", async ({ page }) => {
    const posted = await mockReviews(page, { prefill: { status: 200, body: PREFILL_OK } })

    await page.goto("/calificar?pedido=42&t=tok-secreto")

    await expect(page.getByRole("heading", { name: "Califica tu pedido" })).toBeVisible()
    await expect(page.getByText("Pedido #42")).toBeVisible()

    const submit = page.getByRole("button", { name: "Enviar calificación" })
    // Sin estrellas no se puede enviar
    await expect(submit).toBeDisabled()

    await star(page, 3).click()
    await expect(submit).toBeEnabled()

    await page.getByPlaceholder(/Cuéntanos más/).fill("Llegó rápido")
    await expect(page.getByText("12/500")).toBeVisible()

    await submit.click()

    await expect(page.getByText("¡Gracias por tu reseña!")).toBeVisible()
    expect(posted).toEqual([
      { order_id: 42, rating: 3, comment: "Llegó rápido", token: "tok-secreto" },
    ])
  })

  test("enlace inválido muestra el aviso de pedido no encontrado", async ({ page }) => {
    await mockReviews(page, { prefill: { status: 404, body: { error: "Pedido no encontrado" } } })

    await page.goto("/calificar?pedido=99&t=token-malo")

    await expect(
      page.getByText("No encontramos este pedido o el enlace ya no es válido.")
    ).toBeVisible()
    await expect(page.getByRole("link", { name: "Volver al inicio" })).toBeVisible()
    // No se ofrece el formulario
    await expect(page.getByRole("button", { name: "Enviar calificación" })).toHaveCount(0)
  })

  test("un pedido no entregado no muestra el formulario", async ({ page }) => {
    await mockReviews(page, {
      prefill: { status: 200, body: { orderId: 42, delivered: false, review: null } },
    })

    await page.goto("/calificar?pedido=42&t=tok")

    await expect(
      page.getByText("Podrás calificar tu pedido cuando haya sido entregado.")
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Enviar calificación" })).toHaveCount(0)
  })

  test("una reseña existente se muestra como ya enviada y de solo lectura", async ({ page }) => {
    await mockReviews(page, {
      prefill: {
        status: 200,
        body: {
          orderId: 42,
          delivered: true,
          review: { rating: 4, comment: "Muy fresco", created_at: "2026-01-02T03:04:05.000Z" },
        },
      },
    })

    await page.goto("/calificar?pedido=42&t=tok")

    await expect(page.getByText("¡Gracias por tu reseña!")).toBeVisible()
    await expect(page.getByText("Muy fresco")).toBeVisible()
    // Sin onChange las estrellas quedan deshabilitadas y reflejan la nota
    await expect(star(page, 4)).toBeDisabled()
    await expect(star(page, 4)).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("button", { name: "Enviar calificación" })).toHaveCount(0)
  })

  test("el error del servidor al guardar se muestra en el formulario", async ({ page }) => {
    await mockReviews(page, {
      prefill: { status: 200, body: PREFILL_OK },
      post: { status: 409, body: { error: "Solo puedes calificar pedidos ya entregados" } },
    })

    await page.goto("/calificar?pedido=42&t=tok")
    await star(page, 5).click()
    await page.getByRole("button", { name: "Enviar calificación" }).click()

    await expect(page.getByText("Solo puedes calificar pedidos ya entregados")).toBeVisible()
    await expect(page.getByText("¡Gracias por tu reseña!")).toHaveCount(0)
  })

  test("un 500 sin mensaje cae al texto por defecto", async ({ page }) => {
    await mockReviews(page, {
      prefill: { status: 200, body: PREFILL_OK },
      post: { status: 500, body: {} },
    })

    await page.goto("/calificar?pedido=42&t=tok")
    await star(page, 2).click()
    await page.getByRole("button", { name: "Enviar calificación" }).click()

    await expect(page.getByText("No se pudo guardar tu reseña")).toBeVisible()
  })

  test("el selector de estrellas es un radiogroup accesible", async ({ page }) => {
    await mockReviews(page, { prefill: { status: 200, body: PREFILL_OK } })

    await page.goto("/calificar?pedido=42&t=tok")

    await expect(page.getByRole("radiogroup", { name: "Calificación en estrellas" })).toBeVisible()
    await expect(star(page, 5)).toHaveAttribute("aria-pressed", "false")

    await star(page, 5).click()

    await expect(star(page, 5)).toHaveAttribute("aria-pressed", "true")
    // Las estrellas anteriores quedan marcadas como parte del mismo valor
    await expect(star(page, 1)).toHaveAttribute("aria-pressed", "true")
  })

  test("sin pedido y sin sesión ofrece el enlace de WhatsApp e iniciar sesión", async ({ page }) => {
    // El CI no tiene Supabase real: cualquier llamada de auth debe resolverse
    // rápido y sin sesión para que la página caiga al estado invitado.
    await page.route("**/auth/v1/**", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: "{}" })
    )

    await page.goto("/calificar")

    // Se limita a <main> porque el header global también tiene "Iniciar sesión"
    const content = page.locator("#main-content")

    await expect(content.getByText(/Usa el enlace que te enviamos por WhatsApp/)).toBeVisible()
    await expect(content.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute(
      "href",
      "/auth/login"
    )
    await expect(content.getByRole("button", { name: "Enviar calificación" })).toHaveCount(0)
  })
})

test.describe("API /api/reviews — validación", { tag: "@ci" }, () => {
  test("GET sin pedido → 400", async ({ request }) => {
    const response = await request.get("/api/reviews")

    expect(response.status()).toBe(400)
    expect((await response.json()).error).toBe("Parámetros inválidos")
  })

  test("GET con pedido no numérico → 400", async ({ request }) => {
    const response = await request.get("/api/reviews?pedido=abc")

    expect(response.status()).toBe(400)
    expect((await response.json()).error).toBe("Parámetros inválidos")
  })

  test("POST sin order_id → 400", async ({ request }) => {
    const response = await request.post("/api/reviews", { data: {} })

    expect(response.status()).toBe(400)
    expect((await response.json()).error).toBe("Pedido inválido")
  })

  test("POST con calificación fuera de 1-5 → 400", async ({ request }) => {
    for (const rating of [0, 6, 2.5]) {
      const response = await request.post("/api/reviews", { data: { order_id: 1, rating } })

      expect(response.status()).toBe(400)
      expect((await response.json()).error).toBe("La calificación debe ser de 1 a 5 estrellas")
    }
  })
})
