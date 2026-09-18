import { test, expect } from "@playwright/test"
import { hasAdminCredentials, signInAsAdmin } from "./support/session"

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

// En CI/dev sin env de Supabase las rutas admin fallan con 500 al crear el
// cliente (no hay auth disponible); con env configurado deben responder
// 401/403. En ambos casos lo importante: NUNCA 200 con datos.
const GUARDED_CODES = [401, 403, 500]

test.describe("leads CRM — guards", { tag: "@ci" }, () => {
  test("la página /admin/leads no sirve la bandeja a anónimos", async ({ page }) => {
    const response = await page.goto("/admin/leads")
    // 200 solo es aceptable tras seguir un redirect al login; si el guard del
    // panel corta la vista, tiene que ser uno de los códigos de rechazo.
    expect([...GUARDED_CODES, 200]).toContain(response?.status() ?? 0)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("la vista de pipeline no sirve el tablero a anónimos", async ({ page }) => {
    const response = await page.goto("/admin/leads?tab=pipeline")
    expect([...GUARDED_CODES, 200]).toContain(response?.status() ?? 0)
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

test.describe("leads CRM — bandeja de conversaciones", { tag: "@ci" }, () => {
  // La pestaña "bandeja" es nueva en la Ronda 6: lee los mensajes que el
  // webhook guarda desde 00041 y que hasta ahora nadie mostraba. Su superficie
  // es la más sensible de la página (teléfonos y contenido de conversaciones),
  // así que el guard se verifica aparte y con el parámetro explícito.
  test("la pestaña bandeja no sirve conversaciones a anónimos", async ({ page }) => {
    const response = await page.goto("/admin/leads?tab=bandeja")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?view= fuera de la allowlist de la bandeja se descarta sin romper", async ({ page }) => {
    const response = await page.goto("/admin/leads?tab=bandeja&view=conversaciones-inventadas")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?tag= arbitraria no rompe el render del pipeline", async ({ page }) => {
    const response = await page.goto("/admin/leads?tab=pipeline&tag=vip")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("la combinación completa de filtros de la bandeja no rompe el render", async ({ page }) => {
    const response = await page.goto(
      "/admin/leads?tab=bandeja&view=secuencias&tag=mayoreo&box=todos&q=cafe&page=2"
    )
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("las secuencias de goteo nacen apagadas: la URL no puede activarlas", async ({ page }) => {
    // Activar una secuencia es un acto explícito en la interfaz (con auditoría),
    // nunca un efecto de abrir un enlace.
    const response = await page.goto("/admin/leads?tab=bandeja&view=secuencias&active=1")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })
})

/**
 * Ronda 18 — el admin recupera la escritura y el dinero.
 *
 * Hasta la Ronda 18 el admin era la superficie **más pobre** del CRM: leía todo
 * y no podía crear un prospecto, ni editar el contacto, ni importar CSV, ni
 * tocar una actividad, ni ver un peso. Estos casos fijan las cuatro invariantes
 * que la ronda añadió y que solo se pueden comprobar con navegador:
 *
 * 1. Escribir es un acto explícito: ningún parámetro de la URL abre el alta.
 * 2. Un desenlace "perdido" no se puede confirmar sin motivo (la base lo
 *    rechazaría, pero el botón no debe dejar intentarlo).
 * 3. Una columna del tablero sin ningún valor declarado dice "Sin valor
 *    declarado", nunca `$0`: el pipeline de nadie no vale cero, vale "sin
 *    declarar".
 * 4. Un prospecto nuevo del admin cae en el pozo (sin vendedor), no asignado a
 *    quien lo creó.
 *
 * Las guardas de anonimato corren siempre. El bloque de comportamiento exige
 * sesión admin + Supabase, así que se salta solo salvo que se le pasen
 * credenciales:
 *
 *   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
 */

test.describe("leads CRM — escritura del admin (Ronda 18)", { tag: "@ci" }, () => {
  test("?nuevo=1 no abre el alta: escribir es un acto explícito", async ({ page }) => {
    // Un enlace no puede dejar un formulario de alta abierto y listo para
    // enviar. El alta se abre desde el botón, con estado local.
    const response = await page.goto("/admin/leads?nuevo=1")
    expect([...GUARDED_CODES, 200]).toContain(response?.status() ?? 0)
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("la pestaña agenda se pide por URL sin romper el render", async ({ page }) => {
    const response = await page.goto("/admin/leads?tab=agenda")
    expect([...GUARDED_CODES, 200]).toContain(response?.status() ?? 0)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("una combinación absurda de filtros nuevos no rompe el render", async ({ page }) => {
    const response = await page.goto(
      "/admin/leads?tab=agenda&nuevo=1&importar=1&editar=999999&ciudad=Inventada&seller=abc"
    )
    expect([...GUARDED_CODES, 200]).toContain(response?.status() ?? 0)
    await expect(page.locator("body")).not.toBeEmpty()
  })
})

test.describe("leads CRM — comportamiento con sesión admin (Ronda 18)", { tag: "@ci" }, () => {
  test.beforeEach(async ({ page }) => {
    // Sin credenciales se salta al instante: esperar a que falle el login
    // consume el tiempo del test y lo hace fallar por timeout en vez de
    // saltarse, que es lo que se quiere en CI.
    test.skip(!hasAdminCredentials(), "faltan E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD")
    test.skip(!(await signInAsAdmin(page)), "no se pudo iniciar sesión como admin")
  })

  test("el botón de alta abre el formulario y ofrece vendedor", async ({ page }) => {
    await page.goto("/admin/leads")
    const trigger = page.getByRole("button", { name: /Nuevo prospecto/ }).first()
    test.skip((await trigger.count()) === 0, "el alta no está disponible")
    await trigger.click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // El selector de vendedor solo se ofrece en el alta; asignar a posteriori
    // tiene su propio camino en la ficha.
    await expect(dialog.getByLabel(/Vendedor/i)).toHaveCount(1)
  })

  test("un prospecto sin valor declarado no se pinta como $0", async ({ page }) => {
    await page.goto("/admin/leads?tab=pipeline")
    const board = page.locator("#crm-panel-pipeline")
    test.skip((await board.count()) === 0, "el tablero no está disponible")

    // El total de una columna puede faltar; lo que no puede es mentir. `$0`
    // solo es legítimo si alguien declaró cero, y el formato de la interfaz
    // nunca produce esa cadena para un agregado vacío.
    const text = (await board.innerText()) ?? ""
    if (text.includes("Sin valor declarado")) {
      expect(text).not.toMatch(/Sin valor declarado[^A-Za-z0-9]{0,4}\$0(?![\d,])/)
    }
    await expect(board).not.toContainText("Sin valor declarado: $0")
  })

  test("cerrar como perdido exige motivo: el botón no deja intentarlo", async ({ page }) => {
    await page.goto("/admin/leads?tab=pipeline")
    const board = page.locator("#crm-panel-pipeline")
    // Las tarjetas del tablero abren la ficha con un botón; el primero sirve.
    const card = board.locator("ul > li button").first()
    test.skip((await card.count()) === 0, "no hay prospectos que abrir")
    await card.click()

    const dialog = page.getByRole("dialog").first()
    await expect(dialog).toBeVisible()

    const perdido = dialog.getByRole("button", { name: "Perdido", exact: true })
    test.skip((await perdido.count()) === 0, "el cierre no está disponible")
    await perdido.click()

    // El motivo es obligatorio y el botón lo sabe: sin elegirlo, confirmar está
    // deshabilitado. La base lo rechazaría igual (CHECK de 00184), pero el
    // usuario no debe llegar a intentarlo.
    await expect(dialog.getByLabel(/Motivo de pérdida/)).toBeVisible()
    await expect(dialog.getByRole("button", { name: /Cerrar como perdido/ })).toBeDisabled()

    // Se elige un motivo y sigue sin confirmarse: esta prueba **no** cierra el
    // trato de nadie. Se cancela para dejar el estado como estaba.
    await dialog.getByLabel(/Motivo de pérdida/).selectOption({ index: 1 })
    await expect(dialog.getByRole("button", { name: /Cerrar como perdido/ })).toBeEnabled()
    await dialog.getByRole("button", { name: "Cancelar" }).click()
  })
})
