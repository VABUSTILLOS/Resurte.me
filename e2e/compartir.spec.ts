import { test, expect } from "@playwright/test"

/**
 * E2E del share target PWA (W8) y de la lista compartida.
 *
 * `/compartir` resuelve cada renglón contra el catálogo con `searchProducts`.
 * Sin env de Supabase ese server action devuelve `[]`, así que el camino
 * verificable aquí es "sin coincidencia" — que además es el que no depende de
 * datos. El camino con productos (agregar al carrito) requiere catálogo real.
 */

test.describe("lista compartida — share target PWA", { tag: "@ci" }, () => {
  /**
   * `/compartir` es un `<Suspense>` sobre un componente CLIENTE y la página no
   * declara `force-dynamic`, así que NADA de su contenido viaja en la cáscara
   * del servidor: todo aserto de esta suite es post-hidratación. El default de
   * 5s medía la hidratación y no la página — de ahí los rojos intermitentes.
   * El presupuesto va solo en el primer aserto de cada test: una vez hidratado,
   * el resto resuelve al instante y no necesita margen propio.
   */
  const HIDRATACION = { timeout: 20_000 }

  test("sin lista muestra el estado vacío y no ofrece agregar nada", async ({ page }) => {
    const response = await page.goto("/compartir", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)

    await expect(
      page.getByRole("heading", { level: 1, name: "Lista compartida" })
    ).toBeVisible(HIDRATACION)
    await expect(page.getByRole("heading", { name: "Aún no hay lista" })).toBeVisible()
    await expect(page.getByRole("link", { name: /Ir al catálogo/ })).toBeVisible()

    // Sin lista no hay CTA de agregar ni secciones de resultados.
    await expect(page.getByRole("button", { name: /Agregar .* al carrito/ })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: /Sin coincidencia/ })).toHaveCount(0)
  })

  test("precarga el texto del share sheet y resume la lista", async ({ page }) => {
    const lista = "2 kg de tomate\n1 lechuga\n3 limones"
    await page.goto(`/compartir?texto=${encodeURIComponent(lista)}`, {
      waitUntil: "domcontentloaded",
    })

    await expect(page.getByLabel("Tu lista")).toHaveValue(lista, HIDRATACION)
    // 3 renglones, 2+1+3 piezas.
    await expect(page.getByText("3 productos · 6 piezas")).toBeVisible()
  })

  test("los renglones sin coincidencia enlazan al buscador y bloquean el CTA", async ({ page }) => {
    const lista = "2 kg de tomate\n1 lechuga"
    await page.goto(`/compartir?texto=${encodeURIComponent(lista)}`, {
      waitUntil: "domcontentloaded",
    })

    // Sin Supabase `searchProducts` devuelve []: todo cae en "sin coincidencia".
    // La resolución corre en el cliente contra un server action, así que el
    // primer aserto espera con holgura (el resto ya es inmediato).
    const sinCoincidencia = page.getByRole("heading", { name: /Sin coincidencia \(2\)/ })
    await expect(sinCoincidencia).toBeVisible(HIDRATACION)
    await expect(page.getByRole("heading", { name: /Encontrados/ })).toHaveCount(0)

    // `exact` para no capturar los enlaces "Buscar en el catálogo" del header.
    const enlaces = page.getByRole("link", { name: "Buscar", exact: true })
    await expect(enlaces).toHaveCount(2)
    await expect(enlaces.first()).toHaveAttribute("href", /\/buscar\?q=/)
    // El deep link busca el sustantivo del renglón (sin cantidad ni unidad) y
    // conserva el orden de la lista, no el de otro renglón.
    await expect(enlaces.first()).toHaveAttribute("href", /q=tomate$/)
    await expect(enlaces.nth(1)).toHaveAttribute("href", /q=lechuga$/)

    // Nada que agregar: el CTA queda deshabilitado y lo dice.
    await expect(
      page.getByRole("button", { name: "Selecciona al menos un producto" })
    ).toBeDisabled()
  })

  test("cae al título cuando el share sheet no manda texto", async ({ page }) => {
    await page.goto(`/compartir?titulo=${encodeURIComponent("2 kg de tomate")}`, {
      waitUntil: "domcontentloaded",
    })
    await expect(page.getByLabel("Tu lista")).toHaveValue("2 kg de tomate", HIDRATACION)
  })

  test("el manifest declara el share target GET hacia /compartir", async ({ request }) => {
    const response = await request.get("/manifest.json")
    expect(response.status()).toBe(200)
    const manifest = await response.json()

    expect(manifest.share_target).toMatchObject({
      action: "/compartir",
      method: "GET",
      params: { title: "titulo", text: "texto", url: "url" },
    })
    expect(manifest.shortcuts.some((s: { url: string }) => s.url === "/compartir")).toBe(true)
  })
})

/**
 * Fase 14 — acciones masivas de pedidos.
 *
 * La barra masiva requiere sesión admin + Supabase, así que aquí se verifica
 * lo que sí es determinista sin credenciales: la página nunca renderiza la
 * barra ni la tabla para un anónimo, y el PATCH por pedido (el mismo endpoint
 * al que hace fan-out la barra) sigue rechazando escrituras anónimas.
 */
test.describe("acciones masivas de pedidos — guards", { tag: "@ci" }, () => {
  test("/admin/pedidos no expone la barra masiva a un anónimo", async ({ page }) => {
    const response = await page.goto("/admin/pedidos", { waitUntil: "domcontentloaded" })
    // 200 con el estado de error/guard, o redirección al login.
    expect([200, 302, 307]).toContain(response?.status() ?? 0)

    await expect(page.getByRole("region", { name: "Acciones masivas" })).toHaveCount(0)
    await expect(page.getByRole("checkbox", { name: /Seleccionar todos/ })).toHaveCount(0)
  })

  test("el fan-out masivo no puede escribir sin sesión", async ({ request }) => {
    // La barra llama al PATCH por pedido, secuencialmente; ninguno debe pasar.
    // `requireAdmin()` corre antes que cualquier escritura, así que sin sesión
    // la respuesta es 401/403 (o 500 si el entorno no tiene Supabase, como en
    // el sandbox local). Lo que importa es que nunca sea 2xx.
    for (const id of [1, 2, 3]) {
      const response = await request.patch(`/api/orders/${id}/status`, {
        data: { status: "confirmed" },
      })
      expect(response.ok()).toBe(false)
      expect([401, 403, 500]).toContain(response.status())
    }
  })
})
