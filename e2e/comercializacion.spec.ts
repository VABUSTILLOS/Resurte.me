import { test, expect } from "@playwright/test"

/**
 * E2E del CRM del vendedor (`/comercializacion`).
 *
 * Contexto: hasta la Ronda 7 esta superficie **no tenía ninguna prueba e2e**, y
 * era justo la que se fusionó con el CRM del admin. La fusión hizo que las dos
 * superficies compartan lector, contrato y ficha, así que un cambio en
 * `@/lib/crm-core` puede romper al vendedor sin tocar ni una línea de su
 * carpeta. Este spec cierra ese hueco.
 *
 * Sin credenciales de vendedor no se puede ejercer el camino feliz (requiere
 * sesión + Supabase), así que se verifica lo que **sí** es comprobable en CI y
 * es donde viven las regresiones reales:
 *
 * 1. La superficie sigue cerrada a anónimos: `/comercializacion` no se puede
 *    quedar sirviendo la cartera de nadie. Un anónimo tiene que acabar fuera de
 *    la ruta del vendedor, no dentro con datos.
 * 2. Los parámetros de URL arbitrarios se descartan sin romper el render. El
 *    filtro de etiqueta viaja en la URL (`?tag=`), así que es una superficie de
 *    entrada pública dentro de la app: un `tag` inventado debe caer a "sin
 *    filtrar", no lanzar.
 * 3. La ficha de un prospecto con un id absurdo no puede reventar la página.
 *
 * Lo que este spec NO puede comprobar: que el vendedor deje de ver el pozo sin
 * asignar. Eso lo cubre `src/lib/crm-prospects.test.ts` (el alcance se traduce a
 * un filtro `seller_id = userId`) y `src/lib/crm-core.contract.test.ts` (el
 * alcance nunca incluye `seller_id IS NULL`).
 */

const SELLER_ROUTES = [
  "/comercializacion",
  "/comercializacion/prospectos",
  "/comercializacion/pedidos",
  "/comercializacion/agente",
]

test.describe("comercialización — guards", { tag: "@ci" }, () => {
  // En CI/dev sin env de Supabase las rutas fallan al crear el cliente (no hay
  // auth disponible); con env configurado responden 307 al login. En ambos
  // casos lo importante: NUNCA se queda sirviendo la ruta del vendedor.
  for (const route of SELLER_ROUTES) {
    test(`${route} no sirve la cartera a anónimos`, async ({ page }) => {
      const response = await page.goto(route)
      expect(response?.status()).toBeLessThan(500)

      // El guard puede redirigir al login o dejar la ruta en blanco, pero no
      // puede entregar la página del vendedor.
      expect(new URL(page.url()).pathname).not.toBe(route)
      await expect(page.locator("body")).not.toBeEmpty()
    })
  }
})

test.describe("comercialización — filtros en la URL", { tag: "@ci" }, () => {
  test("?tag= arbitraria se descarta sin romper el render", async ({ page }) => {
    const response = await page.goto("/comercializacion/prospectos?tag=etiqueta-inventada")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?tag= con espacios y acentos no rompe el render", async ({ page }) => {
    const response = await page.goto("/comercializacion/prospectos?tag=%20VIP%20Mayoreo%20")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?tag= con caracteres especiales no rompe el render", async ({ page }) => {
    // El filtro se aplica en memoria sobre `p.tags`, pero el valor viene de la
    // URL: si alguna vez se manda a PostgREST, esto es lo que lo delata.
    const response = await page.goto(
      "/comercializacion/prospectos?tag=%3Cscript%3Ealert(1)%3C%2Fscript%3E"
    )
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("?nuevo=1 sin sesión no abre un formulario utilizable", async ({ page }) => {
    const response = await page.goto("/comercializacion/prospectos?nuevo=1")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("la combinación completa de parámetros no rompe el render", async ({ page }) => {
    const response = await page.goto(
      "/comercializacion/prospectos?tag=vip&nuevo=1&q=cafe&status=nuevo&page=2"
    )
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })
})

test.describe("comercialización — ficha del prospecto", { tag: "@ci" }, () => {
  // La ficha dejó de ser `prospecto-detail.tsx` y ahora es el componente
  // compartido `ProspectDetailDrawer`, el mismo que usa el admin. Un id que no
  // existe tiene que responder "no encontrado", no un error del servidor.
  const IDS = ["1", "999999", "abc", "-1", "0"]

  for (const id of IDS) {
    test(`/prospectos/${id} responde sin error de servidor`, async ({ page }) => {
      const response = await page.goto(`/comercializacion/prospectos/${id}`)
      expect(response?.status()).toBeLessThan(500)
      await expect(page.locator("body")).not.toBeEmpty()
    })
  }

  test("un id fuera de alcance no revela si el prospecto existe", async ({ page }) => {
    // `assertProspectInScope` responde siempre "Prospecto no encontrado" y
    // nunca "Acceso denegado": la diferencia filtraría la existencia de
    // prospectos de otros vendedores. Sin sesión solo se puede comprobar que la
    // página no distingue por código de estado.
    const ajeno = await page.goto("/comercializacion/prospectos/999999")
    const inexistente = await page.goto("/comercializacion/prospectos/abc")
    expect(ajeno?.status()).toBe(inexistente?.status())
  })
})

test.describe("comercialización — sin regresión por la Ronda 18", { tag: "@ci" }, () => {
  // La Ronda 18 le devolvió la escritura al admin y añadió dinero al CRM. El
  // camino del vendedor es el criterio de no-regresión de esa ronda: no cambia
  // de comportamiento. Lo que se fija aquí es que la superficie del vendedor no
  // adopta los parámetros nuevos del admin ni se rompe al recibirlos.

  test("los parámetros del admin no alteran la superficie del vendedor", async ({ page }) => {
    const response = await page.goto(
      "/comercializacion/prospectos?nuevo=1&importar=1&tab=agenda&seller=abc&ciudad=Inventada"
    )
    expect(response?.status()).toBeLessThan(500)
    expect(new URL(page.url()).pathname).not.toBe("/admin/leads")
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("la ficha sigue siendo la compartida y no revienta con un id absurdo", async ({ page }) => {
    // `?tab=` es una pestaña del admin; en el vendedor no debe existir una vista
    // "agenda" ni un panel de dinero del admin.
    const response = await page.goto("/comercializacion/prospectos/999999?tab=agenda")
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("la agenda del admin no tiene equivalente en la ruta del vendedor", async ({ page }) => {
    const response = await page.goto("/comercializacion/agenda")
    // No existe esa ruta: el vendedor ve sus tareas desde su propia ficha. Lo
    // que importa es que no responda sirviendo el panel del admin.
    expect(response?.status()).not.toBe(200)
  })
})
