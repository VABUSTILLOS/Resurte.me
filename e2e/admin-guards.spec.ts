import { test, expect } from "@playwright/test"
import { ADMIN_SECTIONS } from "../src/lib/admin-permissions"
import { hasAdminCredentials, signInAsAdmin } from "./support/session"

/**
 * E2E del guard de sección del panel admin — barrido de las 19 secciones.
 *
 * HUECO QUE CIERRA: la cobertura de `/admin` era desigual y **accidental**.
 * `/admin/leads` tenía 26 menciones y `/admin/productos` 8, pero once secciones
 * (`/admin/proveedores`, `/admin/repartidores`, `/admin/comisiones`,
 * `/admin/foodos/dispersiones`, `/admin/seo-ia`, `/admin/whatsapp`,
 * `/admin/recompensas`, `/admin/foodos/restaurantes`, `/admin/operar`,
 * `/admin/conversion`, `/admin/sistema`) no aparecían **ni una vez** en `e2e/`.
 * Una sección sin ninguna mención no es "probablemente está bien": es una
 * sección donde nadie comprobó que el guard esté montado.
 *
 * POR QUÉ SE IMPORTA LA LISTA: `ADMIN_SECTIONS` es la fuente de verdad del mapa
 * sección → dominio (`src/lib/admin-permissions.ts`) y la que vigila
 * `admin-sections.contract.test.ts`. Recorrerla aquí en vez de copiarla hace
 * imposible que el barrido y el mapa se separen: añadir una sección al panel
 * añade su guarda al e2e en el mismo commit, sin que nadie se acuerde.
 *
 * QUÉ SE AFIRMA: sin credenciales no se puede ejercer el camino feliz, así que
 * lo que se verifica es (1) que ninguna sección sea alcanzable en anónimo y
 * (2) que el login recuerde **la sección concreta** a la que iba el usuario.
 * El segundo punto es el que antes era falso: el guard redirigía siempre a
 * `next=/admin`, así que quien abría un enlace profundo iniciaba sesión y
 * aterrizaba en el dashboard, con la sección perdida.
 */

const paths = ADMIN_SECTIONS.map((s) => s.path)

test.describe("guards de sección admin", { tag: "@ci" }, () => {
  test("el barrido cubre todas las secciones del mapa", () => {
    // Canario: si alguien vacía la lista o cambia su forma, esto lo dice en vez
    // de dejar pasar un barrido de cero rutas como si fuera verde.
    expect(paths.length).toBeGreaterThanOrEqual(19)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) expect(path.startsWith("/admin")).toBe(true)
  })

  for (const path of paths) {
    test(`${path} sin sesión va al login recordando la sección`, async ({ page }) => {
      await page.goto(path)

      const landed = new URL(page.url())
      expect(landed.pathname, `${path} no pasó por el guard`).toBe("/auth/login")
      // `searchParams` decodifica: el `next` codificado vuelve a ser la ruta.
      expect(landed.searchParams.get("next"), `se perdió el destino de ${path}`).toBe(path)
    })
  }

  test("un enlace profundo conserva su query al volver del login", async ({ page }) => {
    // El caso real: un aviso del dashboard enlaza a `/admin/pedidos?status=pending`.
    // Sin la query el admin vuelve a la lista sin filtrar, que es justo lo que
    // el enlace evitaba.
    await page.goto("/admin/pedidos?status=pending&from=2026-03-01")

    const landed = new URL(page.url())
    expect(landed.pathname).toBe("/auth/login")
    expect(landed.searchParams.get("next")).toBe(
      "/admin/pedidos?status=pending&from=2026-03-01"
    )
  })

  test("parámetros adversarios no rompen la redirección", async ({ page }) => {
    // La sección no llega a renderizar en anónimo (el guard corta antes), así
    // que lo que se prueba aquí es que construir el destino no se rompa con
    // una query hostil. El parseo de parámetros de cada sección se cubre en
    // `admin-deep-links.spec.ts` y en los unitarios de cada `*-shared.ts`.
    const response = await page.goto("/admin/pedidos?status=../etc/passwd")
    expect(response?.status()).toBeLessThan(500)
    expect(new URL(page.url()).pathname).toBe("/auth/login")
  })
})

test.describe("guards de sección admin — con sesión", { tag: "@ci" }, () => {
  test("un admin autenticado abre cada sección sin volver al login", async ({ page }) => {
    test.skip(!hasAdminCredentials(), "faltan E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD")
    test.skip(!(await signInAsAdmin(page)), "no se pudo iniciar sesión como admin")

    for (const path of paths) {
      await page.goto(path)
      const landed = new URL(page.url()).pathname
      // Con sesión válida y ámbito sin restringir no hay rebote al login ni
      // salida al dashboard por falta de dominio: la sección se abre.
      expect(landed, `no se abrió ${path}`).toBe(path)
      await expect(page.locator("body")).not.toBeEmpty()
    }
  })
})
