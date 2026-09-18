import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  ADMIN_SCOPE,
  CRM_CLOSED_STATUSES,
  CRM_LOSS_REASONS,
  CRM_LOSS_REASON_LABEL,
  CRM_PROSPECT_COLUMNS,
  CRM_PROSPECT_COLUMNS_WITHOUT_TAGS,
  CRM_PROSPECT_COLUMN_SETS,
  CRM_STATUSES,
  CRM_STATUS_LABEL,
  applyCrmScope,
  assertProspectInScope,
  crmStatusPatch,
  filterProspects,
  isCrmClosed,
  isCrmLossReason,
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
 * 5. El vocabulario de cierre (motivos de pérdida, estados cerrados) es el de
 *    los `CHECK` de la migración 00184 — y `crmStatusPatch` limpia exactamente
 *    lo que esos `CHECK` obligan a limpiar.
 */

const MIGRATION_00052 = join(
  process.cwd(),
  "supabase",
  "migrations",
  "00052_comercializacion.sql"
)

const MIGRATION_00184 = join(
  process.cwd(),
  "supabase",
  "migrations",
  "00184_crm_deal_closure.sql"
)

const sql = readFileSync(MIGRATION_00052, "utf8")
const sql184 = readFileSync(MIGRATION_00184, "utf8")

/** Los 6 valores del `CHECK (status IN (...))` de `crm_prospects`. */
function checkStatuses(): string[] {
  const match = /status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'[^']+'\s+CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)/i.exec(
    sql
  )
  expect(match?.[1], "no se encontró el CHECK de status en 00052").toBeTruthy()
  return [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].flatMap((m) => (m[1] ? [m[1]] : []))
}

/** Los motivos del `CHECK (loss_reason IS NULL OR loss_reason IN (...))` de 00184. */
function checkLossReasons(): string[] {
  const match = /loss_reason\s+IS\s+NULL\s+OR\s+loss_reason\s+IN\s*\(([^)]*)\)/i.exec(sql184)
  expect(match?.[1], "no se encontró el CHECK de loss_reason en 00184").toBeTruthy()
  return [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].flatMap((m) => (m[1] ? [m[1]] : []))
}

/** Los estados cerrados del índice parcial `idx_crm_prospects_open_pipeline`. */
function checkClosedStatuses(): string[] {
  const match = /WHERE\s+status\s+NOT\s+IN\s*\(([^)]*)\)/i.exec(sql184)
  expect(match?.[1], "no se encontró el índice parcial de pipeline abierto en 00184").toBeTruthy()
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

  it("la segmentación de 00059 entra al contrato con las convenciones de null", () => {
    const vacio = mapCrmProspect({ id: 1, name: "x" })
    expect(vacio.employees).toBeNull()
    expect(vacio.instagram).toBeNull()
    expect(vacio.weekly_volume_min).toBeNull()
    expect(vacio.weekly_volume_max).toBeNull()

    const lleno = mapCrmProspect({
      id: 1,
      name: "x",
      employees: 8,
      instagram: "@ana",
      weekly_volume_min: 0,
      weekly_volume_max: "12000.50",
    })
    expect(lleno.employees).toBe(8)
    expect(lleno.instagram).toBe("@ana")
    // Un mínimo de 0 es una medición, no un hueco.
    expect(lleno.weekly_volume_min).toBe(0)
    expect(lleno.weekly_volume_max).toBe(12000.5)
  })

  it("el cierre de 00184 entra al contrato sin inventar valores", () => {
    const vacio = mapCrmProspect({ id: 1, name: "x" })
    expect(vacio.estimated_value).toBeNull()
    expect(vacio.loss_reason).toBeNull()
    expect(vacio.closed_at).toBeNull()

    const lleno = mapCrmProspect({
      id: 1,
      name: "x",
      estimated_value: "3500.25",
      loss_reason: "precio",
      closed_at: "2026-09-02T10:00:00Z",
    })
    expect(lleno.estimated_value).toBe(3500.25)
    expect(lleno.loss_reason).toBe("precio")
    expect(lleno.closed_at).toBe("2026-09-02T10:00:00Z")
  })

  it("un motivo de pérdida fuera del vocabulario se normaliza a null", () => {
    // El `CHECK` de 00184 lo hace imposible en la base; esto cubre un entorno
    // sin la migración aplicada y un valor escrito a mano por `psql`. Se
    // normaliza para que el tipo del motivo sea total y ningún consumidor
    // necesite una rama de respaldo que se acabaría olvidando.
    expect(mapCrmProspect({ id: 1, name: "x", loss_reason: "porque_si" }).loss_reason).toBeNull()
    expect(mapCrmProspect({ id: 1, name: "x", loss_reason: "" }).loss_reason).toBeNull()
    expect(mapCrmProspect({ id: 1, name: "x", loss_reason: 7 }).loss_reason).toBeNull()
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

describe("cierre del trato (vocabulario de 00184)", () => {
  it("el CHECK de 00184 sigue teniendo los 7 motivos", () => {
    expect(checkLossReasons()).toEqual([
      "precio",
      "competencia",
      "sin_presupuesto",
      "no_contesta",
      "cerro_negocio",
      "fuera_de_zona",
      "otro",
    ])
  })

  it("CRM_LOSS_REASONS es exactamente el CHECK de la migración", () => {
    // Si los dos se separan, la base rechaza un motivo que la UI ofrece y el
    // usuario ve un error de constraint en vez de una lista válida.
    expect([...CRM_LOSS_REASONS]).toEqual(checkLossReasons())
  })

  it("CRM_CLOSED_STATUSES es exactamente el índice parcial de la migración", () => {
    // El índice decide qué filas son "pipeline abierto". Si `isCrmClosed` y el
    // índice no dicen lo mismo, el tablero y la base cuentan tratos distintos.
    expect([...CRM_CLOSED_STATUSES]).toEqual(checkClosedStatuses())
    for (const status of CRM_CLOSED_STATUSES) expect(CRM_STATUSES).toContain(status)
  })

  it("cada motivo tiene etiqueta legible y distinta", () => {
    const labels = CRM_LOSS_REASONS.map((reason) => CRM_LOSS_REASON_LABEL[reason])
    for (const label of labels) expect(label).toBeTruthy()
    expect(new Set(labels).size).toBe(labels.length)
  })

  it("isCrmLossReason acepta solo el vocabulario cerrado", () => {
    for (const reason of CRM_LOSS_REASONS) expect(isCrmLossReason(reason)).toBe(true)
    for (const bad of ["", "PRECIO", "porque_si", null, undefined, 3, {}]) {
      expect(isCrmLossReason(bad)).toBe(false)
    }
  })

  it("isCrmClosed marca solo cliente_activo y perdido", () => {
    for (const status of CRM_STATUSES) {
      expect(isCrmClosed(status)).toBe(status === "cliente_activo" || status === "perdido")
    }
  })
})

describe("crmStatusPatch", () => {
  // Los dos `CHECK` de coherencia de 00184 hacen imposible guardar un motivo de
  // pérdida sobre un trato abierto o un `closed_at` sobre uno no cerrado. Por
  // eso cada ruta que escriba `status` tiene que limpiar los campos que dejan
  // de ser ciertos **en el mismo UPDATE**: si no, la base rechaza la escritura.
  it("al reabrir limpia motivo y fecha", () => {
    expect(crmStatusPatch("nuevo")).toEqual({ loss_reason: null, closed_at: null })
    expect(crmStatusPatch("contactado")).toEqual({ loss_reason: null, closed_at: null })
    expect(crmStatusPatch("en_seguimiento")).toEqual({ loss_reason: null, closed_at: null })
    expect(crmStatusPatch("inactivo")).toEqual({ loss_reason: null, closed_at: null })
  })

  it("al ganar limpia el motivo pero conserva la fecha de cierre", () => {
    // `cliente_activo` está cerrado: `closed_at` sigue siendo cierto. Lo que
    // deja de serlo es un motivo de pérdida previo.
    expect(crmStatusPatch("cliente_activo")).toEqual({ loss_reason: null })
  })

  it("al pasar a perdido no limpia nada: el cierre lo escribe closeCrmProspect", () => {
    // Un cambio de estado suelto a `perdido` no debe borrar un motivo ya
    // escrito; quien cierra el trato es `closeCrmProspect(id, "perdido", motivo)`.
    expect(crmStatusPatch("perdido")).toEqual({})
  })

  it("el parche nunca contradice los CHECK que dice respetar", () => {
    for (const status of CRM_STATUSES) {
      const patch = crmStatusPatch(status)
      // Un motivo solo se limpia (nunca se escribe) desde aquí.
      if ("loss_reason" in patch) expect(patch.loss_reason).toBeNull()
      // `closed_at` solo se limpia si el estado destino no está cerrado.
      if ("closed_at" in patch) {
        expect(patch.closed_at).toBeNull()
        expect(isCrmClosed(status)).toBe(false)
      }
    }
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
    expect(CRM_PROSPECT_COLUMN_SETS).toHaveLength(5)
    const [full, withTags, withLead, withTier, base] = CRM_PROSPECT_COLUMN_SETS
    expect(full!.length).toBeGreaterThan(withTags!.length)
    expect(withTags!.length).toBeGreaterThan(withLead!.length)
    expect(withLead!.length).toBeGreaterThan(withTier!.length)
    expect(withTier!.length).toBeGreaterThan(base!.length)
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
    // `[1]` es 00140 (con tags); el escalón sin tags es el siguiente.
    expect(CRM_PROSPECT_COLUMNS_WITHOUT_TAGS).toBe(CRM_PROSPECT_COLUMN_SETS[2]!.join(", "))
    expect(CRM_PROSPECT_COLUMNS_WITHOUT_TAGS).not.toContain("tags")
    expect(CRM_PROSPECT_COLUMNS_WITHOUT_TAGS).toContain("lead_id")
  })

  it("el escalón más completo pide las tres columnas de cierre de 00184", () => {
    // Sin esto, un entorno con 00184 aplicada seguiría leyendo sin valor
    // estimado ni motivo de pérdida, y el CRM los mostraría vacíos.
    for (const column of ["estimated_value", "loss_reason", "closed_at"]) {
      expect(CRM_PROSPECT_COLUMN_SETS[0]).toContain(column)
    }
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
    expect(Object.keys(row)).toHaveLength(29)
    expect(row.tags).toEqual([])
    expect(row.status).toBe("nuevo")
    // La fábrica tiene que cubrir el contrato entero: si le falta una columna,
    // `satisfies CrmProspectRow` no compila, pero un campo de más se colaría.
    expect(Object.keys(row)).toEqual(Object.keys(mapCrmProspect({ id: 1, name: "x" })))
  })

  it("las sobreescrituras pisan el valor por defecto", () => {
    expect(crmProspect({ status: "perdido", tags: ["vip"] })).toMatchObject({
      status: "perdido",
      tags: ["vip"],
    })
  })
})
