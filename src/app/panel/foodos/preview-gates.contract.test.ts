import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato "ver vs usar" de las herramientas premium de FoodOS.
 *
 * Contexto: el nivel de compras (Verde → Diamante) decidía **dos** cosas a la
 * vez: si la herramienta se veía y si se podía usar. El resultado era que 8 de
 * las 10 capacidades estaban detrás de Diamante y un restaurantero no podía ni
 * mirarlas: la página entera se sustituía por un muro (`<NivelGate />`) y las
 * secciones bloqueadas ni se renderizaban. Eso contradice el producto: el
 * nivel es una palanca de *capacidad de operar*, no de *visibilidad*.
 *
 * La ronda de mejoras separó las dos decisiones:
 *   - **Ver**: el contenido completo se renderiza siempre, en cualquier nivel.
 *   - **Usar**: la escritura pide el nivel justo en el momento de ejecutarla,
 *     con un aviso que explica cuánto falta (`TierUpsellDialog`).
 *
 * Tres piezas hacen cumplir eso, y las tres tienen que estar presentes en
 * **cada** página premium; si falta una, la invariante se rompe de forma
 * silenciosa (la página se ve, pero al guardar truena con el error crudo del
 * servidor, o al revés: se ve el aviso pero el campo está escondido).
 *
 *   1. `useTierGuard()` montado, con su `upsellDialog` **renderizado**. El
 *      guard corta *antes* de llamar al servidor, así que el usuario recibe el
 *      aviso en español y no un `FoodosFeatureLockedError` en inglés.
 *   2. `<ToolPreviewNotice />` montado: el aviso de "puedes verlo, para usarlo
 *      necesitas nivel X" con el botón de demo. Sin él, la página se ve normal
 *      y el usuario descubre el límite solo al perder su captura.
 *   3. Ningún `<NivelGate />` como muro de contenido. Los campos **no** se
 *      esconden por nivel.
 *
 * Además el nivel de administrador de plataforma ve todo desbloqueado
 * (`isAdmin` en el contexto → `canUse` siempre `true`), también del lado del
 * servidor (`requireFoodosFeature`), porque el admin necesita revisar los
 * campos que el restaurantero reporta como rotos.
 *
 * Límite conocido: es un barrido de texto, no de AST. Detecta que la pieza está
 * montada, no que cubra todas las escrituras de la página — de eso se encargan
 * los `*-gates.test.ts` de cada superficie, que verifican el gate del servidor.
 */

const REPO = process.cwd()
const FOODOS_DIR = join(REPO, "src", "app", "panel", "foodos")

/** Las 11 superficies con capacidad premium y su capacidad asociada. */
const PREMIUM_PAGES = {
  "mostrador/page.tsx": "pos_mostrador",
  "mesas/page.tsx": "comandero",
  "caja/page.tsx": "pos_mostrador",
  "pos/page.tsx": "pos_integraciones",
  "wallet/page.tsx": "wallet_passes",
  "catering/page.tsx": "catering",
  "sitio-ia/page.tsx": "sitio_ia",
  "mesero-ia/page.tsx": "mesero_ia",
  "flotilla/page.tsx": "flotilla",
  "clientes/page.tsx": "marketing_ia",
  "app-marca/page.tsx": "app_marca",
} as const

function read(rel: string): string {
  return readFileSync(join(FOODOS_DIR, rel), "utf8")
}

describe("contrato de vista previa de herramientas premium", () => {
  for (const [rel, feature] of Object.entries(PREMIUM_PAGES)) {
    it(`${rel} deja ver los campos y pide el nivel solo al usarlos`, () => {
      const src = read(rel)

      // 1. Guard de escritura montado y su diálogo renderizado.
      expect(src).toMatch(/useTierGuard\(/)
      expect(src).toContain(`"${feature}"`)
      expect(src).toMatch(/\{\s*upsellDialog\s*\}/)

      // 2. Aviso de vista previa montado.
      expect(src).toContain("<ToolPreviewNotice")

      // 3. Sin muro de contenido: el nivel no esconde campos.
      expect(src).not.toMatch(/<NivelGate[\s/>]/)
    })
  }

  it("todas las páginas premium existen y comparten el mismo montaje", () => {
    for (const rel of Object.keys(PREMIUM_PAGES)) {
      expect(existsSync(join(FOODOS_DIR, rel)), `${rel} no existe`).toBe(true)
    }
  })

  it("cada página premium tiene su demo en el catálogo de herramientas", () => {
    const demos = readFileSync(
      join(REPO, "src", "components", "panel", "guide", "tool-demo.ts"),
      "utf8"
    )
    for (const rel of Object.keys(PREMIUM_PAGES)) {
      const slug = rel.replace("/page.tsx", "")
      expect(demos, `falta la demo de ${slug}`).toContain(`"/panel/foodos/${slug}":`)
    }
  })

  it("el muro de nivel ya no se exporta como componente de página", () => {
    const gate = readFileSync(
      join(REPO, "src", "components", "panel", "foodos", "nivel-gate.tsx"),
      "utf8"
    )
    expect(gate).not.toContain("export default")
    // Sus piezas reutilizables sí siguen vivas para el aviso y la tarjeta.
    expect(gate).toContain("export function featureLabel")
    expect(gate).toContain("export function featureDescription")
    expect(gate).toContain("export function NivelProgress")
  })

  it("el admin de plataforma queda exento del nivel en el servidor", () => {
    const tier = readFileSync(join(REPO, "src", "lib", "foodos-tier.ts"), "utf8")
    expect(tier).toContain("isCurrentUserAdmin")
    const gate = tier.slice(tier.indexOf("export async function requireFoodosFeature"))
    expect(gate).toMatch(/isCurrentUserAdmin\(\)/)
    // P14: la exención no aplica mientras un admin impersona un restaurante.
    // Ahí el nivel que decide es el real del restaurante visitado, para que el
    // modo soporte muestre exactamente lo que ve el dueño.
    expect(gate).toMatch(/!impersonating && \(await isCurrentUserAdmin\(\)\)/)
  })

  it("el nivel del panel sale del restaurante operado, no de una lectura propia", () => {
    const tier = readFileSync(join(REPO, "src", "lib", "foodos-tier.ts"), "utf8")
    // El restaurante lo resuelve el seam de P14: mientras un admin impersona,
    // `getMyEntitlements` tiene que reportar el nivel del restaurante visitado.
    expect(tier).toContain("getOperatingContext")
    expect(tier).toMatch(/getRestaurantEntitlements\(ctx\.restaurantId\)/)
  })

  it("el admin también queda exento en el cliente", () => {
    const ctx = readFileSync(
      join(REPO, "src", "components", "panel", "foodos", "entitlements-context.tsx"),
      "utf8"
    )
    expect(ctx).toMatch(/canUseFeature\(value\.tier, feature, \{ isAdmin \}\)/)
    expect(ctx).toMatch(/lockedTierFor\(value\.tier, feature, \{ isAdmin \}\)/)
  })
})
