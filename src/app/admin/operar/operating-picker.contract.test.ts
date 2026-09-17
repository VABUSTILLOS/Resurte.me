import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato de la sesión de soporte "operar como restaurante" (P14), lado UI.
 *
 * El seam (`src/lib/foodos-operating.ts`) ya tiene sus tests hostiles. Lo que
 * falta cubrir es el cableado de la interfaz, que falla de formas silenciosas:
 *
 *   1. **La franja de la sesión.** Sin ella el admin no sabe que está viendo
 *      datos de otro restaurante: puede escribir creyendo que opera el suyo.
 *      Además tiene que ser salible desde **cualquier** página del panel —
 *      incluida una a la que su rol no llega — o el admin queda atrapado si
 *      el restaurante operado no tiene la herramienta que necesita.
 *   2. **La exención de admin apagada mientras se impersona.** `isAdmin` en el
 *      contexto del panel abre todas las herramientas sin nivel. Si sigue
 *      encendida durante la sesión, el cliente pinta el botón y el servidor lo
 *      rechaza: el admin ve un error de servidor que no puede explicarse, y
 *      peor, deja de ver el nivel real del restaurante, que es justo lo que
 *      vino a diagnosticar. Tiene que estar apagada en **las dos** capas
 *      (servidor y cliente) porque son dos decisiones independientes.
 *   3. **El selector de `/admin`.** Es la única puerta de entrada; si el botón
 *      no llama a `startOperatingAs` o la página no consulta el estado actual,
 *      el admin entra dos veces al mismo restaurante o cree que ya salió.
 *
 * Límite conocido: es un barrido de texto, no de AST. Comprueba que el cableado
 * existe y en el orden correcto, no que el comportamiento en pantalla sea
 * correcto — eso no es medible aquí porque `/panel` responde 200 sin sesión
 * (no hay `requireAuth` en el layout) y CI no tiene credenciales de admin.
 */

const REPO = process.cwd()

function read(relative: string): string {
  const path = join(REPO, relative)
  expect(existsSync(path), `falta ${relative}`).toBe(true)
  return readFileSync(path, "utf8")
}

describe("franja de la sesión de soporte (P14)", () => {
  const banner = read("src/components/panel/foodos/operating-banner.tsx")
  const layout = read("src/app/panel/layout.tsx")
  const layoutClient = read("src/app/panel/panel-layout-client.tsx")

  it("el layout del panel resuelve nivel y sesión en una sola lectura", () => {
    expect(layout).toContain("getPanelOperatingState")
    expect(layout).toContain("operatingRestaurantName")
    expect(layout).toContain("impersonating")
  })

  it("la franja se pinta fuera del control de acceso", () => {
    // Si la franja viviera dentro del ternario de `denied`, un admin en una
    // página que su rol no alcanza no tendría cómo salir de la sesión.
    const bannerIndex = layoutClient.indexOf("<OperatingBanner")
    const deniedIndex = layoutClient.indexOf("{denied ? (")
    expect(bannerIndex).toBeGreaterThan(-1)
    expect(deniedIndex).toBeGreaterThan(-1)
    expect(bannerIndex).toBeLessThan(deniedIndex)
  })

  it("la franja nombra el restaurante y ofrece salir", () => {
    expect(banner).toContain("foodos.operating.banner")
    expect(banner).toContain("stopOperatingAs")
    expect(banner).toContain("foodos.operating.bannerExit")
  })

  it("la franja no sale impresa en los tickets", () => {
    // Los tickets son documentos del restaurante, no de la sesión de soporte.
    expect(banner).toContain("print:hidden")
  })

  it("la franja anuncia el fallo al salir en vez de fallar en silencio", () => {
    expect(banner).toContain('role="alert"')
    expect(banner).toContain("foodos.operating.bannerExitError")
  })

  it("la exención de admin está apagada mientras se impersona", () => {
    expect(layout).toContain('const isAdmin = role === "admin" && !impersonating')
  })
})

describe("selector de restaurante en /admin (P14)", () => {
  const page = read("src/app/admin/operar/page.tsx")
  const picker = read("src/app/admin/operar/operating-picker.tsx")
  const subNav = read("src/app/admin/sub-nav.tsx")

  it("la página vuelve a comprobar el rol antes de listar restaurantes", () => {
    // Es la única superficie que entrega el listado completo de clientes.
    expect(page).toContain("isCurrentUserAdmin")
    expect(page).toContain("redirect(")
  })

  it("la página conoce la sesión abierta y el restaurante propio", () => {
    expect(page).toContain("getOperatingPickerState")
    expect(page).toContain("ownRestaurantId")
    expect(page).toContain("operatingRestaurantId")
  })

  it("cada fila abre la sesión con la server action", () => {
    expect(picker).toContain("startOperatingAs")
  })

  it("el restaurante propio no ofrece un botón que no haría nada", () => {
    // `decideOperatingTarget` rechaza impersonar el propio, así que el botón
    // ahí sería un no-op silencioso.
    expect(picker).toContain("Tu restaurante")
    expect(picker).toContain("No necesitas soporte aquí")
  })

  it("se distingue la sesión ya abierta", () => {
    expect(picker).toContain("Operando aquí")
  })

  it("los errores de la acción se traducen, no se muestran crudos", () => {
    for (const code of ["noAccess", "notFound", "invalid", "error"]) {
      expect(picker, `falta el código ${code}`).toContain(`${code}:`)
    }
  })

  it("el selector es alcanzable desde la navegación de administración", () => {
    expect(subNav).toContain('href: "/admin/operar"')
  })
})
