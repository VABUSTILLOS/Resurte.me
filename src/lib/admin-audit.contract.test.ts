import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * Contrato de la bitácora de administración: **toda ruta admin que muta algo
 * del negocio deja una fila en `admin_audit_log`**.
 *
 * Contexto: la auditoría de la Fase C encontró 32 rutas con export mutante y
 * **16 sin una sola llamada a `logAdminAction`**. Entre las que faltaban había
 * dos que mueven dinero (`facturas` abona créditos de monedero,
 * `reward-services` fija el costo en créditos de un servicio canjeable) y dos
 * que cambian precios de checkout (`bump-rules`). El fallo no fue una ruta
 * concreta: fue que nada impedía que la siguiente se agregara igual.
 *
 * `admin_audit_log` es el único registro de quién cambió un precio, quién
 * otorgó créditos y quién activó un repartidor. Sin esa fila, una discrepancia
 * de saldo no tiene respuesta.
 *
 * Este contrato cierra las dos formas de reintroducir el hueco:
 *
 *  1. Una ruta admin mutante nueva sin `logAdminAction`.
 *  2. Una ruta ya exenta que empieza a mutar sin salir de la lista de
 *     excepciones (por eso las excepciones llevan motivo escrito).
 *
 * Las excepciones son deliberadas y están justificadas una por una abajo. La
 * prueba falla si el conjunto de rutas mutantes cambia sin que cambie la lista:
 * así, agregar una ruta obliga a decidir, y no se puede decidir "no auditar"
 * sin escribir por qué.
 */

const ADMIN_DIR = join(process.cwd(), "src", "app", "api", "admin")

/**
 * Export mutante a nivel de módulo. Se exige la forma de declaración de Next
 * (`export async function POST` / `export const POST`) para no confundirla con
 * un handler local.
 */
const MUTATING_EXPORT_RE =
  /^export\s+(?:async\s+)?(?:function|const)\s+(POST|PATCH|PUT|DELETE)\b/m

/** Llamada real, no el `import { logAdminAction } from ...`. */
const AUDIT_CALL_RE = /\blogAdminAction\s*\(/

/**
 * Rutas que mutan algo pero **no** son una acción de negocio atribuible a un
 * admin. Cada entrada es una decisión, no un pendiente.
 */
const EXEMPT: Record<string, string> = {
  "city-performance/tip/route.ts":
    "getAdminCityTip es una lectura (LLM); el POST no muta ninguna fila",
  "kie-ai/chat/route.ts": "herramienta generativa; consume cuota de API, no datos de negocio",
  "kie-ai/image/route.ts": "herramienta generativa; consume cuota de API, no datos de negocio",
  "kie-ai/music/route.ts": "herramienta generativa; consume cuota de API, no datos de negocio",
  "kie-ai/video/route.ts": "herramienta generativa; consume cuota de API, no datos de negocio",
  "products/bulk-seo/route.ts": "no hay una sola llamada a supabase; devuelve sugerencias de SEO",
  "products/check-images/route.ts": "solo reporta el estado de las imágenes",
  "products/upload-image/route.ts": "sube a Storage; no toca ninguna fila de negocio",
}

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...routeFiles(full))
    else if (entry.name === "route.ts") out.push(full)
  }
  return out
}

const mutatingRoutes = routeFiles(ADMIN_DIR)
  .map((full) => ({
    rel: relative(ADMIN_DIR, full).split(sep).join("/"),
    source: readFileSync(full, "utf8"),
  }))
  .filter(({ source }) => MUTATING_EXPORT_RE.test(source))

describe("contrato de bitácora admin", () => {
  it("encuentra rutas mutantes (el escaneo no se vació solo)", () => {
    expect(mutatingRoutes.length).toBeGreaterThan(20)
  })

  it("toda ruta admin mutante llama a logAdminAction o está exenta con motivo", () => {
    const sinAuditar = mutatingRoutes
      .filter(({ source }) => !AUDIT_CALL_RE.test(source))
      .map(({ rel }) => rel)
      .filter((rel) => !(rel in EXEMPT))

    expect(sinAuditar).toEqual([])
  })

  it("no hay exenciones de rutas que ya no existen o que ya auditan", () => {
    const vivas = new Set(mutatingRoutes.map(({ rel }) => rel))
    const obsoletas = Object.keys(EXEMPT).filter((rel) => {
      if (!vivas.has(rel)) return true
      const route = mutatingRoutes.find((r) => r.rel === rel)
      return route !== undefined && AUDIT_CALL_RE.test(route.source)
    })

    expect(obsoletas).toEqual([])
  })

  it("cada exención tiene un motivo escrito", () => {
    for (const [rel, reason] of Object.entries(EXEMPT)) {
      expect(reason.trim().length, `exención sin motivo: ${rel}`).toBeGreaterThan(10)
    }
  })
})
