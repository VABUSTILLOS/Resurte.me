import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  ADMIN_SCOPE,
  CRM_PROSPECT_COLUMNS,
  CRM_PROSPECT_COLUMNS_WITHOUT_TAGS,
  CRM_PROSPECT_COLUMN_SETS,
  CRM_STATUSES,
  CRM_STATUS_LABEL,
  applyCrmScope,
  assertProspectInScope,
  filterProspects,
  isCrmStatus,
  isProspectInScope,
  mapCrmProspect,
  matchesProspectFilters,
  readTags,
  sellerScope,
  withCityJoin,
} from "@/lib/crm-core"
import { CRM_STATUSES as PIPELINE_STATUSES } from "@/lib/crm-pipeline"
import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABEL,
  type ProspectStatus,
} from "@/lib/comercializacion/types"
import { crmProspect } from "@/lib/crm-fixtures"

/**
 * Contrato del núcleo compartido del CRM (Ronda 7).
 *
 * Tres lectores (`/admin/leads`, `/comercializacion`, `src/lib/agente`) leen la
 * misma tabla `crm_prospects`. Antes cada uno tenía su vocabulario de estados,
 * su mapeador y su propia idea de qué es un prospecto; el resultado eran tres
 * traducciones que podían divergir en silencio. Estas pruebas fijan lo que el
 * núcleo promete:
 *
 * 1. El vocabulario de estados es el del `CHECK` de la migración 00052, y las
 *    tres copias (`CRM_STATUSES`, `PROSPECT_STATUSES`, la de `crm-pipeline`) son
 *    la misma lista.
 * 2. `null` nunca se convierte en `0` ni en `"null"`: un dato ausente sigue
 *    ausente en toda la superficie.
 * 3. El alcance del vendedor es una comprobación de código, no una política RLS
 *    (las server actions usan `createServiceClient()`, que salta RLS).
 * 4. La escalera de columnas degrada en el orden correcto cuando una migración
 *    aún no está aplicada.
 */

const MIGRATION_00052 = join(
  process.cwd(),
  "supabase",
  "migrations",
  "00052_comercializacion.sql"
)

const sql = readFileSync(MIGRATION_00052, "utf8")

/** Los 6 valores del `CHECK (status IN (...))` de `crm_prospects`. */
function checkStatuses(): string[] {
  const match = /status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'[^']+'\s+CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)/i.exec(
    sql
  )
  expect(match?.[1], "no se encontró el CHECK de status en 00052").toBeTruthy()
  return [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].flatMap((m) => (m[1] ? [m[1]] : []))
}

describe("vocabulario de estados", () => {
  it("el CHECK de 00052 sigue teniendo los 6 estados", () => {
    expect(checkStatuses()).toEqual([
      "nuevo",
      "contactado",
      "en_seguimiento",
      "cliente_activo",
      "inactivo",
      "perdido",
    ])
  })

  it("CRM_STATUSES es exactamente el CHECK de la migración", () => {
    expect([...CRM_STATUSES]).toEqual(checkStatuses())
  })

  it("las tres copias del vocabulario son la misma lista", () => {
    // crm-pipeline re-exporta el núcleo; el módulo de vendedor mantiene su
    // propio nombre por compatibilidad con 33 acciones ya publicadas.
    expect([...PIPELINE_STATUSES]).toEqual([...CRM_STATUSES])
    expect(PROSPECT_STATUSES).toEqual([...CRM_STATUSES])
  })

  it("PROSPECT_STATUSES sigue siendo un array mutable", () => {
    // `prospectos.ts` usa `.includes()` y `pedidos.ts` usa `.map()`; una tupla
    // `readonly` rompería ambos con un error de tipo difícil de leer. Se
    // comprueba sobre una copia para no tocar la constante compartida.
    const copy: ProspectStatus[] = [...PROSPECT_STATUSES]
    expect(Array.isArray(copy)).toBe(true)
    copy.push("perdido")
    expect(copy.includes("perdido")).toBe(true)
  })

  it("cada estado tiene etiqueta en las dos superficies", () => {
    for (const status of CRM_STATUSES) {
      expect(CRM_STATUS_LABEL[status]).toBeTruthy()
      expect(PROSPECT_STATUS_LABEL[status]).toBe(CRM_STATUS_LABEL[status])
    }
  })

  it("isCrmStatus acepta solo el vocabulario cerrado", () => {
    for (const status of CRM_STATUSES) expect(isCrmStatus(status)).toBe(true)
    for (const bad of ["", "NUEVO", "lo_que_sea", null, undefined, 3, {}]) {
      expect(isCrmStatus(bad)).toBe(false)
    }
  })
})

describe("mapCrmProspect", () => {
  it("null no se convierte en 0 ni en cadena vacía", () => {
    const row = mapCrmProspect({
      id: 9,
      name: "Sin datos",
      seller_id: null,
      phone: null,
      email: null,
      city_id: null,
      tier: null,
      lead_id: null,
      next_follow_up_at: null,
      last_contact_at: null,
    })
    expect(row.seller_id).toBeNull()
    expect(row.phone).toBeNull()
    expect(row.email).toBeNull()
    expect(row.city_id).toBeNull()
    expect(row.tier).toBeNull()
    expect(row.lead_id).toBeNull()
    expect(row.next_follow_up_at).toBeNull()
    expect(row.last_contact_at).toBeNull()
    // `city_name` solo viene con el join; sin join es null, no "".
    expect(row.city_name).toBeNull()
  })

  it("conserva el 0 donde el 0 es un dato", () => {
    const row = mapCrmProspect({ id: 9, name: "Cero", tier: 0, city_id: 0 })
    expect(row.tier).toBe(0)
    expect(row.city_id).toBe(0)
  })

  it("un status desconocido cae a nuevo, nunca se propaga crudo", () => {
    expect(mapCrmProspect({ id: 1, name: "x", status: "lo_que_sea" }).status).toBe("nuevo")
    expect(mapCrmProspect({ id: 1, name: "x" }).status).toBe("nuevo")
    expect(mapCrmProspect({ id: 1, name: "x", status: "perdido" }).status).toBe("perdido")
  })

  it("source cae a manual y updated_at a created_at", () => {
    const row = mapCrmProspect({ id: 1, name: "x", created_at: "2026-02-01T00:00:00Z" })
    expect(row.source).toBe("manual")
    expect(row.updated_at).toBe("2026-02-01T00:00:00Z")
  })

  it("seller_id numérico se normaliza a texto", () => {
    expect(mapCrmProspect({ id: 1, name: "x", seller_id: 7 }).seller_id).toBe("7")
  })

  it("tags siempre es un array, aunque la columna no exista todavía", () => {
    expect(mapCrmProspect({ id: 1, name: "x" }).tags).toEqual([])
    expect(mapCrmProspect({ id: 1, name: "x", tags: ["vip", " vip ", ""] }).tags).toEqual([
      "vip",
    ])
  })

  it("id se normaliza a número aunque PostgREST lo mande como texto", () => {
    // `id` es BIGSERIAL y llega como número, pero también es la clave de React
    // en las listas: si se colara un string, la reconciliación se degradaría
    // sin ningún error visible.
    expect(mapCrmProspect({ id: "42", name: "x" }).id).toBe(42)
  })
})

describe("readTags", () => {
  it("recorta, deduplica exactos y descarta vacíos", () => {
    // La caja se conserva a propósito: la etiqueta se muestra tal cual la
    // escribió quien la puso ("VIP", no "vip"); la canonicalización es cosa de
    // `crm-tags.ts` al escribir, no del lector.
    expect(readTags([" VIP ", "VIP", "vip", "", "  ", "Mayoreo"])).toEqual([
      "VIP",
      "vip",
      "Mayoreo",
    ])
  })

  it("tolera cualquier basura de PostgREST", () => {
    expect(readTags(null)).toEqual([])
    expect(readTags(undefined)).toEqual([])
    expect(readTags("vip")).toEqual([])
    expect(readTags({ vip: true })).toEqual([])
    expect(readTags([1, "vip", null])).toEqual(["vip"])
  })
})

describe("alcance del prospecto", () => {
  it("el admin ve el pozo sin asignar (seller_id IS NULL)", () => {
    expect(isProspectInScope({ seller_id: null }, ADMIN_SCOPE)).toBe(true)
    expect(isProspectInScope({ seller_id: "otro-vendedor" }, ADMIN_SCOPE)).toBe(true)
  })

  it("el vendedor nunca ve el pozo sin asignar", () => {
    const scope = sellerScope("seller-1")
    expect(isProspectInScope({ seller_id: null }, scope)).toBe(false)
    expect(isProspectInScope({ seller_id: "seller-2" }, scope)).toBe(false)
    expect(isProspectInScope({ seller_id: "seller-1" }, scope)).toBe(true)
  })

  it("un prospecto fuera de alcance da «no encontrado», no «acceso denegado»", () => {
    // El mensaje importa: revelar que el recurso existe filtra el catálogo.
    const scope = sellerScope("seller-1")
    expect(() => assertProspectInScope({ seller_id: "seller-2" }, scope)).toThrow(
      "Prospecto no encontrado"
    )
    expect(() => assertProspectInScope({ seller_id: null }, scope)).toThrow(
      "Prospecto no encontrado"
    )
    expect(() => assertProspectInScope({ seller_id: "seller-1" }, scope)).not.toThrow()
  })

  it("applyCrmScope no filtra nada para el admin", () => {
    const calls: Array<[string, string]> = []
    const query = {
      eq(column: string, value: string) {
        calls.push([column, value])
        return this
      },
    }
    applyCrmScope(query, ADMIN_SCOPE)
    expect(calls).toEqual([])
  })

  it("applyCrmScope filtra por seller_id para el vendedor", () => {
    const calls: Array<[string, string]> = []
    const query = {
      eq(column: string, value: string) {
        calls.push([column, value])
        return this
      },
    }
    applyCrmScope(query, sellerScope("seller-1"))
    expect(calls).toEqual([["seller_id", "seller-1"]])
  })
})

describe("escalera de columnas", () => {
  it("degrada de la más completa a la más antigua", () => {
    expect(CRM_PROSPECT_COLUMN_SETS).toHaveLength(4)
    const [full, withTier, withLead, base] = CRM_PROSPECT_COLUMN_SETS
    expect(withTier!.length).toBeGreaterThan(withLead!.length)
    expect(withLead!.length).toBeGreaterThan(base!.length)
    expect(full!.length).toBeGreaterThan(withTier!.length)
  })

  it("cada escalón es superconjunto del anterior", () => {
    for (let i = 1; i < CRM_PROSPECT_COLUMN_SETS.length; i += 1) {
      const more = CRM_PROSPECT_COLUMN_SETS[i - 1]!
      const less = CRM_PROSPECT_COLUMN_SETS[i]!
      for (const column of less) expect(more).toContain(column)
    }
  })

  it("CRM_PROSPECT_COLUMNS es el escalón más completo y trae tags", () => {
    expect(CRM_PROSPECT_COLUMNS).toBe(CRM_PROSPECT_COLUMN_SETS[0]!.join(", "))
    expect(CRM_PROSPECT_COLUMNS).toContain("tags")
  })

  it("CRM_PROSPECT_COLUMNS_WITHOUT_TAGS es el escalón previo a 00140", () => {
    expect(CRM_PROSPECT_COLUMNS_WITHOUT_TAGS).toBe(CRM_PROSPECT_COLUMN_SETS[1]!.join(", "))
    expect(CRM_PROSPECT_COLUMNS_WITHOUT_TAGS).not.toContain("tags")
    expect(CRM_PROSPECT_COLUMNS_WITHOUT_TAGS).toContain("lead_id")
  })

  it("withCityJoin añade el nombre de la ciudad una sola vez", () => {
    const joined = withCityJoin(CRM_PROSPECT_COLUMN_SETS[0]!)
    expect(joined).toContain("cities(name)")
    expect(joined.match(/cities\(name\)/g)).toHaveLength(1)
  })
})

describe("filtro de estados múltiple", () => {
  // El módulo `agente` necesita "los cinco estados vivos" en una sola consulta
  // (la cola diaria). Antes eso se resolvía con un `.in()` suelto en su propio
  // archivo, que era la cuarta definición de "prospecto vivo".
  it("sin `statuses` no filtra nada", () => {
    const rows = [crmProspect({ status: "nuevo" }), crmProspect({ status: "perdido" })]
    expect(filterProspects(rows, {})).toHaveLength(2)
  })

  it("`statuses` deja pasar solo los estados listados", () => {
    const rows = [
      crmProspect({ id: 1, status: "nuevo" }),
      crmProspect({ id: 2, status: "perdido" }),
      crmProspect({ id: 3, status: "inactivo" }),
    ]
    const result = filterProspects(rows, { statuses: ["nuevo", "inactivo"] })
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  it("un arreglo vacío no filtra nada", () => {
    const rows = [crmProspect({ status: "perdido" })]
    expect(matchesProspectFilters(rows[0]!, { statuses: [] })).toBe(true)
  })

  it("`status` y `statuses` son independientes: el singular se aplica antes", () => {
    // `readCrmProspects` manda los dos al servidor y los vuelve a aplicar en
    // memoria. Es idempotente, pero solo si ambos son la misma regla.
    const prospect = crmProspect({ status: "contactado" })
    expect(matchesProspectFilters(prospect, { status: "contactado" })).toBe(true)
    expect(matchesProspectFilters(prospect, { statuses: ["contactado", "nuevo"] })).toBe(true)
    expect(matchesProspectFilters(prospect, { status: "nuevo" })).toBe(false)
    expect(matchesProspectFilters(prospect, { statuses: ["nuevo", "perdido"] })).toBe(false)
  })
})

describe("fábrica de pruebas", () => {
  it("produce una fila que cumple el contrato completo", () => {
    const row = crmProspect()
    expect(Object.keys(row)).toHaveLength(22)
    expect(row.tags).toEqual([])
    expect(row.status).toBe("nuevo")
  })

  it("las sobreescrituras pisan el valor por defecto", () => {
    expect(crmProspect({ status: "perdido", tags: ["vip"] })).toMatchObject({
      status: "perdido",
      tags: ["vip"],
    })
  })
})
