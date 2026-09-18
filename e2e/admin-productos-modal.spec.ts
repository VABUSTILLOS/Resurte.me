import { test, expect, type Page } from "@playwright/test"
import { hasAdminCredentials, signInAsAdmin } from "./support/session"

/**
 * E2E del modal de producto (ronda 9 — B13).
 *
 * La primera mitad (guardas) corre siempre. La segunda (comportamiento) exige
 * sesión admin + Supabase, así que se salta sola salvo que se le pasen
 * credenciales:
 *
 *   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
 *
 * Con sesión ejerce estas invariantes, todas imposibles de ver sin navegador:
 *
 * 1. Los errores salen **todos a la vez** y el foco va al primer campo inválido.
 * 2. Corregir un campo retira su error mientras se escribe.
 * 3. `Escape` con cambios sin guardar abre la confirmación de descarte (y no
 *    cierra el modal); descartar sí lo cierra.
 * 4. «Guardar y cerrar» no puede dejar la barra de descarte tapando los errores.
 * 5. El índice de secciones marca la que se está viendo al bajar.
 * 6. Un guardado rechazado por versión (409) abre el panel de conflicto en vez
 *    de un error de campo, y «Guardar lo mío» conserva lo que editó el otro.
 *
 * Las reglas de validación se cubren sin navegador en
 * `src/lib/product-form.test.ts`; aquí se prueba lo que solo se ve en pantalla.
 * Los casos de alta dejan el formulario inválido a propósito para no crear
 * productos reales. El de conflicto (ronda 12) sí escribe, pero solo sobre un
 * producto existente y **restaura** sus dos campos en el `finally`.
 */

/**
 * Abre el modal de alta. Devuelve null cuando el botón no existe (sin sesión el
 * guard del panel corta antes de pintarlo), para poder saltarse el test.
 */
async function openNewProductModal(page: Page) {
  const response = await page.goto("/admin/productos")
  expect(response?.status() ?? 0).toBeLessThan(500)
  const trigger = page.getByRole("button", { name: "Nuevo producto" }).first()
  if ((await trigger.count()) === 0) return null
  await trigger.click()
  const dialog = page.getByRole("dialog")
  if ((await dialog.count()) === 0) return null
  return dialog
}

/** Fila del catálogo con lo justo para provocar —y deshacer— un conflicto. */
interface ConflictRow {
  id: number
  name: string
  low_stock_threshold?: number | null
  seo_title?: string | null
}

/**
 * Primer producto del catálogo, leído por API: el spec necesita su `id` para
 * mover la fila por detrás y la tabla del DOM no lo expone.
 *
 * `low_stock_threshold` y `seo_title` se exigen presentes: si la base degradó a
 * `COLS_LEGACY` faltarían, y entonces ni el diff ni la restauración final
 * tendrían de dónde leer el valor original (el spec escribe sobre datos reales).
 */
async function fetchFirstProduct(page: Page): Promise<ConflictRow | null> {
  const res = await page.request.get("/api/admin/products/list?pageSize=1")
  if (!res.ok()) return null
  const body = (await res.json()) as { rows?: ConflictRow[] }
  const row = body.rows?.[0]
  if (!row) return null
  if (!("low_stock_threshold" in row) || !("seo_title" in row)) return null
  return row
}

/** Abre la edición del producto por su nombre (la tabla no lleva ids). */
async function openEditProductModal(page: Page, name: string) {
  const trigger = page.getByRole("button", { name: `Editar ${name}`, exact: true }).first()
  // `count()` no espera: tras un `reload()` la tabla puede no haber pintado aún,
  // y un falso "no está" haría saltar el test sin motivo.
  try {
    await trigger.waitFor({ state: "visible", timeout: 15_000 })
  } catch {
    return null
  }
  await trigger.click()
  const dialog = page.getByRole("dialog")
  if ((await dialog.count()) === 0) return null
  return dialog
}

test.describe("modal de producto — guardas sin sesión", { tag: "@ci" }, () => {
  test("anónimo no ve el formulario de producto", async ({ page }) => {
    await page.goto("/admin/productos")
    // El modal solo existe tras autenticarse: ni el diálogo ni sus campos deben
    // estar en el DOM (el guard del panel redirige al login).
    await expect(page.locator("#pf-name")).toHaveCount(0)
    await expect(page.locator("#pf-sec-identidad")).toHaveCount(0)
    await expect(page.locator('[aria-labelledby="pf-dialog-title"]')).toHaveCount(0)
  })
})

test.describe("modal de producto — comportamiento", { tag: "@ci" }, () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasAdminCredentials(), "requiere E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD")
    test.skip(!(await signInAsAdmin(page)), "no se pudo iniciar sesión como admin")
  })

  test("enviar con varios campos mal muestra todos los errores y enfoca el primero", async ({
    page,
  }) => {
    const dialog = await openNewProductModal(page)
    test.skip(dialog === null, "requiere sesión admin")
    if (!dialog) return

    // Cuatro problemas distintos a la vez: si el formulario abortara en el
    // primero, los otros tres no aparecerían. Todos los controles numéricos son
    // `type="number"`, así que se entra con números válidos pero rechazados.
    await dialog.locator("#pf-price").fill("-1")
    await dialog.locator("#pf-cost").fill("-2")
    await dialog.locator("#pf-qty").fill("2.5")

    await dialog.getByRole("button", { name: /Crear producto/ }).click()

    await expect(dialog.locator("#pf-err-name")).toBeVisible()
    await expect(dialog.locator("#pf-err-price")).toBeVisible()
    await expect(dialog.locator("#pf-err-cost")).toBeVisible()
    await expect(dialog.locator("#pf-err-stockQuantity")).toBeVisible()
    // El resumen se anuncia (única región `role="alert"` del formulario).
    await expect(dialog.getByRole("alert")).toContainText("Revisa los campos marcados en rojo")
    // Y el foco aterriza en el primer campo culpable, listo para escribir.
    await expect(dialog.locator("#pf-name")).toBeFocused()
  })

  test("corregir un campo retira su error al escribir", async ({ page }) => {
    const dialog = await openNewProductModal(page)
    test.skip(dialog === null, "requiere sesión admin")
    if (!dialog) return

    await dialog.locator("#pf-price").fill("-1")
    await dialog.getByRole("button", { name: /Crear producto/ }).click()
    await expect(dialog.locator("#pf-err-price")).toBeVisible()

    await dialog.locator("#pf-price").fill("12.50")
    await expect(dialog.locator("#pf-err-price")).toHaveCount(0)
    await expect(dialog.locator("#pf-price")).not.toHaveAttribute("aria-invalid", "true")
  })

  test("Escape con cambios pide confirmación en vez de cerrar", async ({ page }) => {
    const dialog = await openNewProductModal(page)
    test.skip(dialog === null, "requiere sesión admin")
    if (!dialog) return

    await dialog.locator("#pf-name").fill("Producto de prueba")

    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("Hay cambios sin guardar en este producto.")).toBeVisible()

    // Un segundo Escape cierra la confirmación, no el modal.
    await page.keyboard.press("Escape")
    await expect(dialog.getByText("Hay cambios sin guardar en este producto.")).toHaveCount(0)
    await expect(dialog).toBeVisible()
  })

  test("«Guardar y cerrar» deja ver los errores en vez de la barra de descarte", async ({
    page,
  }) => {
    const dialog = await openNewProductModal(page)
    test.skip(dialog === null, "requiere sesión admin")
    if (!dialog) return

    // Nombre válido (para que el aviso de descarte aparezca) y precio inválido
    // (para que el guardado se corte antes de tocar la API).
    await dialog.locator("#pf-name").fill("Producto de prueba")
    await dialog.locator("#pf-price").fill("-1")

    await page.keyboard.press("Escape")
    const discardBar = dialog.getByText("Hay cambios sin guardar en este producto.")
    await expect(discardBar).toBeVisible()

    await dialog.getByRole("button", { name: "Guardar y cerrar" }).click()

    await expect(discardBar).toHaveCount(0)
    await expect(dialog.locator("#pf-err-price")).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test("descartar cierra el modal", async ({ page }) => {
    const dialog = await openNewProductModal(page)
    test.skip(dialog === null, "requiere sesión admin")
    if (!dialog) return

    await dialog.locator("#pf-name").fill("Producto de prueba")
    await page.keyboard.press("Escape")
    await dialog.getByRole("button", { name: "Descartar cambios" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("el índice marca la sección visible al bajar", async ({ page }) => {
    const dialog = await openNewProductModal(page)
    test.skip(dialog === null, "requiere sesión admin")
    if (!dialog) return

    // Chips (móvil) y rail (escritorio) pintan las mismas entradas; solo una de
    // las dos está visible en cada proyecto, así que se apunta a la visible.
    const nav = dialog.locator('nav[aria-label="Secciones del formulario"]:visible')
    const current = nav.locator('[aria-current="true"]')
    await expect(current).toContainText("Identidad")

    // Bajar hasta el final deja a la vista la última sección (publicación).
    await dialog.locator("[data-pf-scroll]").evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect(current).toContainText("Publicación")

    // Y pulsar una entrada del índice devuelve a esa sección.
    await nav.getByRole("button", { name: "Identidad" }).click()
    await expect(current).toContainText("Identidad")
  })

  test("el margen se recalcula en vivo mientras se escribe el costo", async ({ page }) => {
    const dialog = await openNewProductModal(page)
    test.skip(dialog === null, "requiere sesión admin")
    if (!dialog) return

    const margin = dialog.locator("#pf-margin")

    // Sin precio no hay margen: se muestra el guion, no un 0% engañoso.
    await expect(margin).toContainText("—")

    await dialog.locator("#pf-price").fill("100")
    await dialog.locator("#pf-cost").fill("50")
    await expect(margin).toContainText("50%")

    // Costo por encima del precio: el aviso aparece y dice que se puede guardar.
    await dialog.locator("#pf-cost").fill("120")
    await expect(dialog.locator("#pf-warn-below-cost")).toBeVisible()
    await expect(dialog.locator("#pf-warn-below-cost")).toContainText("Puedes guardar así")

    // El aviso viaja en el resumen del encabezado y lleva a Precios.
    await expect(dialog.getByRole("button", { name: /aviso de precio/ })).toBeVisible()

    // Y al corregir el costo desaparece solo, sin recargar nada.
    await dialog.locator("#pf-cost").fill("50")
    await expect(dialog.locator("#pf-warn-below-cost")).toHaveCount(0)
  })

  test("el estado de stock muestra el valor que se guardará y se bloquea con unidades", async ({
    page,
  }) => {
    const dialog = await openNewProductModal(page)
    test.skip(dialog === null, "requiere sesión admin")
    if (!dialog) return

    const stock = dialog.locator("#pf-stock")

    // Sin unidades manda la selección manual: el select está operativo.
    await expect(stock).toBeEnabled()
    await stock.selectOption("low_stock")

    // Con 0 unidades el estado se deriva a agotado y el select deja de mentir.
    await dialog.locator("#pf-qty").fill("0")
    await expect(stock).toBeDisabled()
    await expect(stock).toHaveValue("out_of_stock")

    // Con pocas unidades (≤ umbral) pasa a bajo.
    await dialog.locator("#pf-qty").fill("2")
    await expect(stock).toHaveValue("low_stock")

    // Y vaciar las unidades devuelve el control a la selección manual previa.
    await dialog.locator("#pf-qty").fill("")
    await expect(stock).toBeEnabled()
    await expect(stock).toHaveValue("low_stock")
  })

  test("un guardado en conflicto abre el panel y «Guardar lo mío» conserva lo ajeno", async ({
    page,
  }) => {
    const row = await fetchFirstProduct(page)
    test.skip(row === null, "no se pudo leer el catálogo")
    if (!row) return

    // Dos campos distintos para las dos mitades del diff: el umbral lo edita
    // este admin (choque real) y el título SEO lo mueve el otro usuario (no hay
    // choque, solo hay que conservarlo). `mine` y `theirs` nunca coinciden con
    // lo cargado, así que el panel siempre tiene algo que contar.
    const base = row.low_stock_threshold ?? 0
    const theirs = base + 1
    const mine = base + 2
    const marker = `conflicto-e2e-${Date.now()}`
    const patch = (data: Record<string, unknown>) =>
      page.request.patch("/api/admin/products/update", { data: { productId: row.id, ...data } })

    try {
      await page.goto("/admin/productos")
      const dialog = await openEditProductModal(page, row.name)
      test.skip(dialog === null, "el producto no está en la tabla")
      if (!dialog) return

      await dialog.locator("#pf-threshold").fill(String(mine))

      // El otro usuario guarda por detrás, sin versión previa: gana él y la fila
      // avanza. Es exactamente el escenario que antes se perdía en silencio.
      const other = await patch({ low_stock_threshold: theirs, seo_title: marker })
      expect(other.status()).toBe(200)

      await dialog.getByRole("button", { name: "Guardar cambios" }).click()

      // El 409 pinta un panel, no un error de campo: marcar el umbral en rojo
      // mandaría al admin a "corregir" un valor que no tiene nada de malo.
      const panel = dialog.locator('[aria-describedby="pf-conflict-detail"]')
      await expect(panel).toBeVisible()
      await expect(panel).toContainText("1 campo en conflicto")
      await expect(panel).toContainText("en la base")
      await expect(dialog.locator("#pf-err-lowStockThreshold")).toHaveCount(0)

      // Con el conflicto abierto no se puede esquivar: el envío queda bloqueado.
      await expect(dialog.getByRole("button", { name: "Guardar cambios" })).toBeDisabled()

      // «Guardar lo mío»: gana mi umbral y sobrevive el título del otro usuario.
      await panel.getByRole("button", { name: "Guardar lo mío" }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0)

      // Se relee del servidor (no del estado local) para comprobar que ambos
      // valores llegaron a la base.
      await page.reload()
      const reopened = await openEditProductModal(page, row.name)
      test.skip(reopened === null, "el producto desapareció del listado")
      if (!reopened) return
      await expect(reopened.locator("#pf-threshold")).toHaveValue(String(mine))
      await expect(reopened.locator("#pf-seo-title")).toHaveValue(marker)
    } finally {
      // El spec escribe en un producto real: se deja como estaba pase lo que pase.
      await patch({ low_stock_threshold: row.low_stock_threshold, seo_title: row.seo_title })
    }
  })
})
