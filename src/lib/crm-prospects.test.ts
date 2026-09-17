import { describe, expect, test } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { ADMIN_SCOPE, sellerScope, CRM_PROSPECT_COLUMN_SETS, withCityJoin } from "./crm-core"
import { CRM_SEARCH_SCAN_LIMIT, readCrmProspects } from "./crm-prospects"

/**
 * Pruebas de comportamiento del lector único de `crm_prospects`.
 *
 * `crm-reader.contract.test.ts` vigila que no aparezca un cuarto lector; este
 * archivo comprueba que el lector que queda hace lo que promete. Sin un cliente
 * falso no habría forma de verificar las tres decisiones que más fácil se
 * rompen sin que nada avise:
 *
 *  - el **alcance** viaja como filtro de código (`seller_id = userId`), porque
 *    las server actions usan `createServiceClient()` y RLS no protege nada;
 *  - la **escalera de columnas** degrada ante una migración sin aplicar y solo
 *    ante eso — un error de otro tipo debe reventar, no degradar en silencio;
 *  - `null` sigue siendo `null` al salir del lector (`null` ≠ `0`).
 */

type Call = { op: string; args: unknown[] }

/**
 * Cliente falso que registra la cadena de PostgREST y responde con el guion dado.
 *
 * `respond` recibe el número de intento (0 = escalón más completo) y las
 * llamadas acumuladas, y devuelve lo que el cliente real devolvería.
 */
function stubClient(
  respond: (attempt: number, calls: Call[]) => { data: unknown[] | null; error: unknown },
) {
  const calls: Call[] = []
  let attempt = 0

  const builder: Record<string, unknown> = {}
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args })
    return builder
  }

  for (const op of ["select", "order", "eq", "in", "is", "not", "lte", "range", "limit"]) {
    builder[op] = record(op)
  }

  builder.then = (resolve: (value: unknown) => unknown) => {
    const result = respond(attempt, calls)
    attempt += 1
    return Promise.resolve(result).then(resolve)
  }

  const client = { from: (table: string) => (calls.push({ op: "from", args: [table] }), builder) }
  return { client: client as unknown as SupabaseClient, calls, attempts: () => attempt }
}

/** Fila cruda con los valores por omisión del contrato. */
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    user_id: null,
    seller_id: null,
    lead_id: null,
    name: "Taquería Ana",
    restaurant_name: "Ana",
    phone: "5512345678",
    whatsapp: null,
    email: null,
    status: "nuevo",
    source: "manual",
    notes: null,
    next_follow_up_at: null,
    last_contact_at: null,
    duration_seconds: null,
    days_since_order: null,
    tier: null,
    zone: null,
    city_id: null,
    tags: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    cities: null,
    ...overrides,
  }
}

/** Última llamada de una operación concreta. */
function last(calls: Call[], op: string): Call | undefined {
  return [...calls].reverse().find((call) => call.op === op)
}

describe("readCrmProspects — alcance", () => {
  test("el vendedor filtra por su seller_id y nunca por el pozo sin asignar", async () => {
    const { client, calls } = stubClient(() => ({ data: [], error: null }))

    await readCrmProspects(client, { scope: sellerScope("seller-1") })

    expect(last(calls, "eq")).toEqual({ op: "eq", args: ["seller_id", "seller-1"] })
    // El pozo sin asignar es invisible para el vendedor por diseño: añadir este
    // filtro expondría los prospectos web que aún no tienen dueño.
    expect(calls.some((call) => call.op === "is")).toBe(false)
  })

  test("el admin no recibe filtro de alcance y sigue viendo el pozo sin asignar", async () => {
    const { client, calls } = stubClient(() => ({
      data: [row({ id: 7, seller_id: null })],
      error: null,
    }))

    const result = await readCrmProspects(client, { scope: ADMIN_SCOPE })

    expect(calls.some((call) => call.op === "eq")).toBe(false)
    expect(result.map((p) => p.id)).toEqual([7])
  })
})

describe("readCrmProspects — filtros que sí viajan al servidor", () => {
  test("un solo status usa eq y varios usan in", async () => {
    const one = stubClient(() => ({ data: [], error: null }))
    await readCrmProspects(one.client, { scope: ADMIN_SCOPE, filters: { status: "contactado" } })
    expect(last(one.calls, "eq")).toEqual({ op: "eq", args: ["status", "contactado"] })
    expect(last(one.calls, "in")).toBeUndefined()

    const many = stubClient(() => ({ data: [], error: null }))
    await readCrmProspects(many.client, {
      scope: ADMIN_SCOPE,
      filters: { statuses: ["nuevo", "en_seguimiento", "inactivo"] },
    })
    expect(last(many.calls, "in")).toEqual({
      op: "in",
      args: ["status", ["nuevo", "en_seguimiento", "inactivo"]],
    })
  })

  test('status "todos" no añade filtro', async () => {
    const { client, calls } = stubClient(() => ({ data: [], error: null }))
    await readCrmProspects(client, { scope: ADMIN_SCOPE, filters: { status: "todos" } })
    expect(last(calls, "eq")).toBeUndefined()
  })

  test("los ids del reparto y la presencia de vendedor se traducen a la consulta", async () => {
    const { client, calls } = stubClient(() => ({ data: [], error: null }))

    await readCrmProspects(client, {
      scope: ADMIN_SCOPE,
      ids: [4, 5],
      sellerPresence: "unassigned",
    })

    expect(last(calls, "in")).toEqual({ op: "in", args: ["id", [4, 5]] })
    expect(last(calls, "is")).toEqual({ op: "is", args: ["seller_id", null] })
  })
})

describe("readCrmProspects — paginación y búsqueda", () => {
  test("sin búsqueda se pagina en el servidor con el límite pedido", async () => {
    const { client, calls } = stubClient(() => ({ data: [], error: null }))

    await readCrmProspects(client, { scope: ADMIN_SCOPE, limit: 50, offset: 100 })

    expect(last(calls, "range")).toEqual({ op: "range", args: [100, 149] })
  })

  test("con búsqueda se escanea una ventana acotada y se recorta en memoria", async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ id: i + 1, name: i === 4 ? "Cafetería Central" : `Otro ${i}` }),
    )
    const { client, calls } = stubClient(() => ({ data: rows, error: null }))

    // "cafeteria" sin acento tiene que encontrar "Cafetería": es exactamente el
    // caso que divergía entre el panel del admin y la cartera del vendedor.
    const result = await readCrmProspects(client, {
      scope: ADMIN_SCOPE,
      filters: { q: "cafeteria" },
      limit: 10,
    })

    expect(last(calls, "range")).toEqual({ op: "range", args: [0, CRM_SEARCH_SCAN_LIMIT - 1] })
    expect(result.map((p) => p.id)).toEqual([5])
  })

  test("la búsqueda respeta el offset sobre el resultado ya filtrado", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => row({ id: i + 1, name: "Cafetería" }))
    const { client } = stubClient(() => ({ data: rows, error: null }))

    const result = await readCrmProspects(client, {
      scope: ADMIN_SCOPE,
      filters: { q: "cafeteria" },
      limit: 2,
      offset: 1,
    })

    expect(result.map((p) => p.id)).toEqual([2, 3])
  })
})

describe("readCrmProspects — escalera de columnas", () => {
  test("arranca en el escalón más completo y pide el join de ciudades", async () => {
    const { client, calls } = stubClient(() => ({ data: [], error: null }))

    await readCrmProspects(client, { scope: ADMIN_SCOPE })

    const select = last(calls, "select")
    expect(select?.args[0]).toBe(withCityJoin(CRM_PROSPECT_COLUMN_SETS[0]!))
  })

  test("ante una columna ausente reintenta con el escalón anterior", async () => {
    const { client, attempts } = stubClient((attempt) =>
      attempt === 0
        ? { data: null, error: { code: "42703", message: 'column "tags" does not exist' } }
        : { data: [row({ id: 9 })], error: null },
    )

    const result = await readCrmProspects(client, { scope: ADMIN_SCOPE })

    expect(attempts()).toBe(2)
    expect(result.map((p) => p.id)).toEqual([9])
  })

  test("un error que no es de columnas no degrada: falla", async () => {
    // Ojo: `isMissingColumnError` también acepta el texto "does not exist", así
    // que "relation does not exist" degradaría. Se usa un error de permisos,
    // que no tiene nada que ver con una migración sin aplicar.
    const { client, attempts } = stubClient(() => ({
      data: null,
      error: { code: "42501", message: "permission denied for table crm_prospects" },
    }))

    await expect(readCrmProspects(client, { scope: ADMIN_SCOPE })).rejects.toThrow(
      "Error al cargar los prospectos",
    )
    // Degradar aquí escondería un fallo real detrás de una lista corta.
    expect(attempts()).toBe(1)
  })
})

describe("readCrmProspects — contrato de salida", () => {
  test("null se mantiene null y un 0 real sobrevive", async () => {
    const { client } = stubClient(() => ({
      data: [
        row({ id: 1, tier: null, city_id: null, lead_id: null }),
        row({ id: 2, tier: 0, city_id: 0, lead_id: 0 }),
      ],
      error: null,
    }))

    const [sinDatos, conCero] = await readCrmProspects(client, { scope: ADMIN_SCOPE })

    // "No medido" y "cero" no son lo mismo en ningún indicador del CRM.
    expect(sinDatos?.tier).toBeNull()
    expect(sinDatos?.city_id).toBeNull()
    expect(sinDatos?.lead_id).toBeNull()
    expect(conCero?.tier).toBe(0)
    expect(conCero?.city_id).toBe(0)
    expect(conCero?.lead_id).toBe(0)
  })

  test("sin seller_id la fila sale con null, nunca con la cadena \"null\"", async () => {
    const { client } = stubClient(() => ({ data: [row({ seller_id: null })], error: null }))
    const [prospect] = await readCrmProspects(client, { scope: ADMIN_SCOPE })
    expect(prospect?.seller_id).toBeNull()
  })

  test("city_name se rescata del join y es null sin join", async () => {
    const { client } = stubClient(() => ({
      data: [
        row({ id: 1, cities: { name: "Puebla" } }),
        row({ id: 2, cities: null }),
        row({ id: 3, cities: { name: null } }),
      ],
      error: null,
    }))

    const result = await readCrmProspects(client, { scope: ADMIN_SCOPE })

    expect(result.map((p) => p.city_name)).toEqual(["Puebla", null, null])
  })

  test("tags siempre es un arreglo, aunque la columna no exista todavía", async () => {
    const { client } = stubClient(() => ({
      data: [row({ id: 1, tags: undefined })],
      error: null,
    }))
    const [prospect] = await readCrmProspects(client, { scope: ADMIN_SCOPE })
    expect(prospect?.tags).toEqual([])
  })
})

describe("readCrmProspects — columnas extra (módulo agente)", () => {
  test("sin extraColumns la fila no carga el objeto extra", async () => {
    const { client, calls } = stubClient(() => ({ data: [row({ id: 1 })], error: null }))

    const [prospect] = await readCrmProspects(client, { scope: ADMIN_SCOPE })

    expect(prospect?.extra).toBeUndefined()
    expect(last(calls, "select")?.args[0]).not.toContain("employees")
  })

  test("con extraColumns las pide en el select y las deja en extra", async () => {
    const extraColumns = ["employees", "instagram", "weekly_volume_min"] as const
    const { client, calls } = stubClient(() => ({
      data: [
        row({
          id: 1,
          employees: 12,
          instagram: "@ana",
          weekly_volume_min: 0,
          weekly_volume_max: null,
        }),
      ],
      error: null,
    }))

    const [prospect] = await readCrmProspects(client, {
      scope: ADMIN_SCOPE,
      extraColumns: [...extraColumns],
    })

    expect(last(calls, "select")?.args[0]).toContain("employees, instagram, weekly_volume_min")
    expect(prospect?.extra).toEqual({
      employees: 12,
      instagram: "@ana",
      weekly_volume_min: 0,
    })
    // `extra` es pasamanos: no entra al contrato, así que el CRM no lo ve.
    expect(prospect).not.toHaveProperty("employees")
  })

  test("una columna extra ausente se normaliza a null, no a undefined", async () => {
    const { client } = stubClient(() => ({ data: [row({ id: 1 })], error: null }))

    const [prospect] = await readCrmProspects(client, {
      scope: ADMIN_SCOPE,
      extraColumns: ["employees"],
    })

    expect(prospect?.extra).toEqual({ employees: null })
  })
})
