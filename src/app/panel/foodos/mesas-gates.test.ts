import { beforeEach, describe, expect, it, vi } from "vitest"

// El comandero es la superficie donde el dinero se cobra **al final** de un
// proceso largo y con varios dispositivos tocando la misma mesa, así que esta
// suite defiende los invariantes que no se ven en la pantalla:
//
//   1. Nivel suficiente verificado en el servidor, antes de la sesión. Las
//      ESCRITURAS lanzan; las LECTURAS degradan.
//   2. **Una fila por ronda enviada a cocina, una sola al cobrar.** Mandar
//      platillos no es una venta: la comanda va sin folio y pendiente de pago.
//      Si cada envío reservara folio, la numeración tendría un hueco por ronda.
//   3. **El folio se reserva al cerrar, y al final del cierre.** Si se pidiera
//      antes de validar el turno o la forma de pago, cada intento fallido
//      quemaría un número consecutivo.
//   4. **Cobrar exige turno de caja abierto.** Una venta sin turno no tiene
//      dónde colgarse y desaparece del arqueo del día. Mandar a cocina, en
//      cambio, no lo exige: la cocina no puede esperar a que abran la caja.
//   5. **Una mesa no puede tener dos cuentas abiertas**, y el 23505 del índice
//      único parcial se traduce a un mensaje entendible, nunca a un error crudo.
//   6. **Nunca se manda el teléfono del cliente** desde una mesa: el disparador
//      `foodos_upsert_customer_on_order` daría de alta un cliente por ronda.

const mocks = vi.hoisted(() => ({
  requireFoodosFeature: vi.fn(),
  requireAuth: vi.fn(),
  requireFoodosAuth: vi.fn(),
  getOperatingContext: vi.fn(),
  assertOwnRestaurant: vi.fn(),
  createFoodosOrder: vi.fn(),
  requireOpenShift: vi.fn(),
  findOpenShift: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth, getCurrentUser: vi.fn() }))
vi.mock("@/lib/foodos-operating", () => ({
  requireFoodosAuth: mocks.requireFoodosAuth,
  getOperatingContext: mocks.getOperatingContext,
}))
vi.mock("@/lib/foodos-tier", () => ({ requireFoodosFeature: mocks.requireFoodosFeature }))
vi.mock("@/lib/foodos-owner", () => ({ assertOwnRestaurant: mocks.assertOwnRestaurant }))
vi.mock("@/lib/foodos-order-create", () => ({ createFoodosOrder: mocks.createFoodosOrder }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
// `NoOpenShiftError` e `isNoOpenShiftError` se conservan reales: el predicado de
// tipo usa `instanceof`, así que un doble los desconectaría en silencio.
vi.mock("@/lib/foodos-shift", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/foodos-shift")>()
  return {
    ...actual,
    requireOpenShift: mocks.requireOpenShift,
    findOpenShift: mocks.findOpenShift,
  }
})

import type { SupabaseClient } from "@supabase/supabase-js"

import { NoOpenShiftError } from "@/lib/foodos-shift"

import {
  cancelTicket,
  closeTable,
  deleteTable,
  deleteZone,
  getMesasData,
  mergeTables,
  moveTable,
  openTable,
  requestBill,
  saveZone,
  sendToKitchen,
  setGuests,
  transferTable,
} from "./mesas-actions"

const RESTAURANT_ID = "rest-1"
const SHIFT_ID = "shift-1"
const TICKET_ID = "ticket-1"
const TABLE_ID = "table-1"
const USER = { id: "user-1", email: "mesero@example.com" }

/**
 * Respuesta del seam de operación para el caso normal (sin impersonación):
 * `supabase` es el cliente de sesión que cada test fabrica, así que el
 * camino que ejecuta la acción es exactamente el de siempre.
 */
function operating(supabase: unknown) {
  const ctx = {
    restaurantId: RESTAURANT_ID,
    ownerUserId: USER.id,
    client: supabase,
    impersonating: false,
    actorUserId: USER.id,
    actorEmail: USER.email ?? null,
  }
  mocks.getOperatingContext.mockResolvedValue(ctx as never)
  return { supabase, user: USER, ownerUserId: USER.id, ctx } as never
}

const RESTAURANT_ROW = {
  id: RESTAURANT_ID,
  name: "Taquería Centro",
  slug: "taqueria-centro",
  timezone: "America/Mexico_City",
}

const OPEN_SHIFT = {
  id: SHIFT_ID,
  restaurant_id: RESTAURANT_ID,
  branch_id: null,
  status: "open",
  opening_float: 500,
  opened_by: USER.id,
  opened_at: "2026-09-17T14:00:00.000Z",
  closed_by: null,
  closed_at: null,
  declared_cash: null,
  expected_cash: null,
  difference: null,
  notes: null,
  created_at: "2026-09-17T14:00:00.000Z",
}

const OPEN_TICKET = {
  id: TICKET_ID,
  restaurant_id: RESTAURANT_ID,
  branch_id: null,
  table_id: TABLE_ID,
  status: "open",
  guests: 4,
  opened_by: USER.id,
  opened_at: "2026-09-17T14:05:00.000Z",
  closed_by: null,
  closed_at: null,
  closed_order_id: null,
  billing_requested_at: null,
  note: null,
}

const TABLE_ROW = { id: TABLE_ID, label: "Mesa 7", branch_id: null, is_active: true }

const ITEMS = [{ item_id: "item-1", name: "Taco al pastor", price: 22, qty: 3 }]

type Call = { table: string; method: string; args: unknown[] }

interface Response {
  data?: unknown
  error?: unknown
  count?: number | null
}

/**
 * Respuesta de una tabla para un método terminal. Un arreglo se consume en
 * orden y el último valor se repite, porque `loadOpenTicket` y
 * `openTicketForTable` golpean la misma tabla esperando cosas distintas.
 */
interface TableConfig {
  rows?: Response | Response[]
  maybeSingle?: Response | Response[]
  single?: Response | Response[]
}

/** Builder encadenable y "awaitable", como el de supabase-js. */
function fakeClient(tables: Record<string, TableConfig>, rpcResponse?: Response) {
  const calls: Call[] = []
  const cursors = new Map<string, number>()

  function take(table: string, config: TableConfig, key: keyof TableConfig): Response {
    const value = config[key]
    if (value === undefined) return { data: null, error: null }
    if (!Array.isArray(value)) return value
    const cursorKey = `${table}:${key}`
    const index = cursors.get(cursorKey) ?? 0
    cursors.set(cursorKey, index + 1)
    return value[Math.min(index, value.length - 1)] ?? { data: null, error: null }
  }

  const client = {
    from(table: string) {
      const config = tables[table] ?? {}
      const builder: Record<string, unknown> = {}
      for (const method of [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "is",
        "in",
        "order",
        "limit",
      ]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          return builder
        }
      }
      builder.maybeSingle = async () => {
        calls.push({ table, method: "maybeSingle", args: [] })
        const response = take(table, config, "maybeSingle")
        return { data: response.data ?? null, error: response.error ?? null }
      }
      builder.single = async () => {
        calls.push({ table, method: "single", args: [] })
        const response = take(table, config, "single")
        return { data: response.data ?? null, error: response.error ?? null }
      }
      builder.then = (resolve: (value: unknown) => unknown) => {
        const response = take(table, config, "rows")
        return Promise.resolve({
          data: response.data ?? [],
          error: response.error ?? null,
          count: response.count ?? null,
        }).then(resolve)
      }
      return builder
    },
    rpc: (...args: unknown[]) => {
      mocks.rpc(...args)
      calls.push({ table: "rpc", method: "rpc", args })
      return Promise.resolve(rpcResponse ?? { data: "260917-0001", error: null })
    },
  }
  return { supabase: client as unknown as SupabaseClient, calls }
}

/** Cliente con una respuesta sensata para todo lo que el comandero consulta. */
function defaultClient(overrides: Record<string, TableConfig> = {}) {
  return fakeClient({
    foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW } },
    foodos_branches: { rows: { data: [] } },
    foodos_table_zones: { rows: { data: [] } },
    foodos_tables: { rows: { data: [] }, maybeSingle: { data: TABLE_ROW } },
    foodos_table_tickets: { rows: { data: [] }, maybeSingle: { data: OPEN_TICKET } },
    foodos_orders: { rows: { data: [] } },
    foodos_menu_categories: { rows: { data: [] } },
    foodos_menu_items: { rows: { data: [] } },
    foodos_combos: { rows: { data: [] } },
    foodos_item_option_groups: { rows: { data: [] } },
    foodos_item_option_values: { rows: { data: [] } },
    foodos_branch_menu_overrides: { rows: { data: [] } },
    ...overrides,
  })
}

function folioCalls(calls: Call[]): Call[] {
  return calls.filter((c) => c.table === "rpc" && c.args[0] === "foodos_next_folio")
}

/** Payload de la primera escritura sobre una tabla (insert o update). */
function writePayload(calls: Call[], table: string): Record<string, unknown> {
  const call = calls.find(
    (c) => c.table === table && (c.method === "insert" || c.method === "update")
  )
  return (call?.args[0] ?? {}) as Record<string, unknown>
}

function orderBody() {
  return mocks.createFoodosOrder.mock.calls[0]?.[1]
}

function orderOptions() {
  return mocks.createFoodosOrder.mock.calls[0]?.[2]
}

beforeEach(() => {
  vi.clearAllMocks()
  const { supabase } = defaultClient()
  mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
  mocks.assertOwnRestaurant.mockResolvedValue(undefined)
  mocks.requireOpenShift.mockResolvedValue(OPEN_SHIFT)
  mocks.findOpenShift.mockResolvedValue(OPEN_SHIFT)
  mocks.createFoodosOrder.mockResolvedValue({
    ok: true,
    orderId: "order-1",
    total: 66,
    slug: "taqueria-centro",
  })
})

describe("mesas: bloqueado sin el nivel suficiente", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockRejectedValue(new Error("FOODOS_FEATURE_LOCKED"))
  })

  it("rechaza cada escritura antes de tocar la base", async () => {
    await expect(saveZone({ restaurant_id: RESTAURANT_ID, name: "Salón" })).rejects.toThrow()
    await expect(
      openTable({ restaurant_id: RESTAURANT_ID, table_id: TABLE_ID, guests: 2 })
    ).rejects.toThrow()
    await expect(
      sendToKitchen({ restaurant_id: RESTAURANT_ID, ticket_id: TICKET_ID, items: ITEMS })
    ).rejects.toThrow()
    await expect(
      closeTable({
        restaurant_id: RESTAURANT_ID,
        ticket_id: TICKET_ID,
        items: ITEMS,
        payment_method: "cash",
      })
    ).rejects.toThrow()
    await expect(
      cancelTicket({ restaurant_id: RESTAURANT_ID, ticket_id: TICKET_ID })
    ).rejects.toThrow()

    // Ni siquiera se resuelve la sesión ni se reserva un folio: el gate corre primero.
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
    expect(mocks.requireOpenShift).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("comandero")
  })

  it("la lectura degrada en vez de romper el mapa de mesas", async () => {
    await expect(getMesasData(RESTAURANT_ID)).resolves.toBeNull()
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
  })
})

describe("mesas: carga del salón", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("trae el mapa, las cuentas y el menú en una sola carga", async () => {
    const zone = { id: "zone-1", restaurant_id: RESTAURANT_ID, branch_id: null, name: "Salón" }
    const table = { ...TABLE_ROW, zone_id: "zone-1" }
    const { supabase } = defaultClient({
      foodos_table_zones: { rows: { data: [zone] } },
      foodos_tables: { rows: { data: [table] }, maybeSingle: { data: TABLE_ROW } },
      foodos_table_tickets: { rows: { data: [OPEN_TICKET] }, maybeSingle: { data: OPEN_TICKET } },
      foodos_menu_items: { rows: { data: [{ id: "item-1", name: "Taco al pastor" }] } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const data = await getMesasData(RESTAURANT_ID)

    expect(data?.restaurant.name).toBe("Taquería Centro")
    expect(data?.zones).toHaveLength(1)
    expect(data?.tickets).toHaveLength(1)
    // El mesero necesita el menú para agregar platillos sin un segundo viaje.
    expect(data?.items).toHaveLength(1)
    expect(data?.shiftId).toBe(SHIFT_ID)
  })

  it("la caja cerrada se reporta como turno nulo, no como pantalla rota", async () => {
    mocks.findOpenShift.mockResolvedValue(null)

    const data = await getMesasData(RESTAURANT_ID)

    expect(data?.shiftId).toBeNull()
    expect(data?.restaurant.name).toBe("Taquería Centro")
  })
})

describe("mesas: abrir una cuenta", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("abre la cuenta con los comensales y la sucursal de la mesa", async () => {
    const { supabase, calls } = defaultClient({
      foodos_table_tickets: { single: { data: { id: TICKET_ID } } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await openTable({ restaurant_id: RESTAURANT_ID, table_id: TABLE_ID, guests: 4 })

    expect(result).toEqual({ ok: true, id: TICKET_ID })
    const payload = writePayload(calls, "foodos_table_tickets")
    expect(payload.table_id).toBe(TABLE_ID)
    expect(payload.guests).toBe(4)
    expect(payload.opened_by).toBe(USER.id)
  })

  it("traduce el índice único parcial a un mensaje entendible", async () => {
    const { supabase } = defaultClient({
      foodos_table_tickets: { single: { error: { code: "23505", message: "dup" } } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await openTable({ restaurant_id: RESTAURANT_ID, table_id: TABLE_ID, guests: 2 })

    expect(result.ok).toBe(false)
    // Dos dispositivos abriendo la misma mesa a la vez: el segundo merece una
    // frase, no el código de error de Postgres.
    expect(result.error).toBe("Esa mesa ya tiene una cuenta abierta.")
  })

  it("no abre una cuenta en una mesa fuera de servicio", async () => {
    const { supabase } = defaultClient({
      foodos_tables: { maybeSingle: { data: { ...TABLE_ROW, is_active: false } } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await openTable({ restaurant_id: RESTAURANT_ID, table_id: TABLE_ID, guests: 2 })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/fuera de servicio/)
  })

  it("acota los comensales al tope del salón", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await setGuests({ restaurant_id: RESTAURANT_ID, ticket_id: TICKET_ID, guests: 999 })

    expect(writePayload(calls, "foodos_table_tickets").guests).toBe(50)
  })

  it("la señal de la cuenta viaja a la base para que el cajero la vea", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await requestBill({ restaurant_id: RESTAURANT_ID, ticket_id: TICKET_ID, requested: true })

    expect(typeof writePayload(calls, "foodos_table_tickets").billing_requested_at).toBe("string")
  })
})

describe("mesas: enviar una ronda a cocina", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("la comanda viaja como pedido de mesero, en mesa y sin cobrar", async () => {
    await sendToKitchen({ restaurant_id: RESTAURANT_ID, ticket_id: TICKET_ID, items: ITEMS })

    const body = orderBody()
    expect(body.channel).toBe("mesero")
    expect(body.fulfillment).toBe("dine_in")
    expect(body.table_number).toBe("Mesa 7")
    expect(body.payment_method).toBeNull()
  })

  it("no da de alta un cliente por cada ronda de mesa", async () => {
    await sendToKitchen({ restaurant_id: RESTAURANT_ID, ticket_id: TICKET_ID, items: ITEMS })

    // El disparador `foodos_upsert_customer_on_order` sólo actúa con teléfono:
    // mandarlo desde una mesa llenaría el CRM de clientes fantasma.
    expect(orderBody().customer_phone).toBeUndefined()
  })

  it("manda la comanda pendiente de pago y sin folio", async () => {
    await sendToKitchen({ restaurant_id: RESTAURANT_ID, ticket_id: TICKET_ID, items: ITEMS })

    const options = orderOptions()
    expect(options.pos.settled).toBe(false)
    expect(options.pos.sendToKitchen).toBe(true)
    expect(options.pos.tableTicketId).toBe(TICKET_ID)
    // El folio se reserva al cerrar: una cadena vacía chocaría con el índice
    // único en el segundo envío de la misma mesa.
    expect(options.pos.folio).toBeNull()
  })

  it("no quema un folio por mandar platillos a cocina", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await sendToKitchen({ restaurant_id: RESTAURANT_ID, ticket_id: TICKET_ID, items: ITEMS })

    expect(folioCalls(calls)).toHaveLength(0)
  })

  it("deja trabajar a la cocina aunque la caja siga cerrada", async () => {
    mocks.findOpenShift.mockResolvedValue(null)

    const result = await sendToKitchen({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
    })

    expect(result.ok).toBe(true)
    // Sellar un turno inexistente haría que la comanda no se pudiera cobrar.
    expect(orderOptions().pos.shiftId).toBeNull()
    expect(mocks.requireOpenShift).not.toHaveBeenCalled()
  })

  it("una ronda vacía no llega a cocina", async () => {
    const result = await sendToKitchen({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: [],
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/platillos/)
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
  })

  it("una cuenta ya cerrada no recibe más platillos", async () => {
    const { supabase } = defaultClient({
      foodos_table_tickets: { maybeSingle: { data: { ...OPEN_TICKET, status: "closed" } } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await sendToKitchen({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ya no está abierta/)
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
  })

  it("un rechazo del productor se reporta sin revalidar la pantalla", async () => {
    mocks.createFoodosOrder.mockResolvedValue({
      ok: false,
      status: 400,
      error: "El platillo ya no está disponible.",
    })

    const result = await sendToKitchen({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ya no está disponible/)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe("mesas: cobrar la cuenta", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("sin turno de caja abierto no cobra y explica por qué", async () => {
    mocks.requireOpenShift.mockRejectedValue(new NoOpenShiftError())

    const result = await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
      payment_method: "cash",
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Abre la caja/)
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
  })

  it("no quema un folio cuando la mesa se cae por falta de turno", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
    mocks.requireOpenShift.mockRejectedValue(new NoOpenShiftError())

    await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
      payment_method: "cash",
    })

    expect(folioCalls(calls)).toHaveLength(0)
  })

  it("exige una forma de pago", async () => {
    const result = await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/forma de pago/)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rechaza una forma de pago suelta junto al cobro combinado", async () => {
    const result = await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
      payment_method: "cash",
      payment_breakdown: {
        parts: [
          { method: "cash", amount: 30 },
          { method: "card", amount: 36 },
        ],
        received: 50,
        change: 20,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/combinado/)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
  })

  it("una cuenta vacía no se cobra", async () => {
    const result = await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: [],
      payment_method: "cash",
    })

    expect(result.ok).toBe(false)
    expect(mocks.requireOpenShift).not.toHaveBeenCalled()
  })

  it("un folio que la base no puede reservar no se inventa en el cliente", async () => {
    const { supabase } = fakeClient(
      {
        foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW } },
        foodos_tables: { maybeSingle: { data: TABLE_ROW } },
        foodos_table_tickets: { maybeSingle: { data: OPEN_TICKET } },
      },
      { data: null, error: { message: "boom" } }
    )
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
      payment_method: "cash",
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/folio/)
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
  })

  it("cobra con folio, turno y cajero, y la cuenta nace fuera de cocina", async () => {
    const result = await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
      payment_method: "cash",
      tip: 10,
    })

    expect(result).toEqual({
      ok: true,
      orderId: "order-1",
      folio: "260917-0001",
      total: 66,
    })

    const body = orderBody()
    expect(body.channel).toBe("mesero")
    expect(body.fulfillment).toBe("dine_in")
    expect(body.table_number).toBe("Mesa 7")
    expect(body.tip).toBe(10)

    const options = orderOptions()
    expect(options.pos).toEqual({
      folio: "260917-0001",
      cashierUserId: USER.id,
      shiftId: SHIFT_ID,
      tableTicketId: TICKET_ID,
      settled: true,
      sendToKitchen: false,
    })
    // La comida ya salió en las comandas: la cuenta no es trabajo nuevo.
    expect(options.pos.sendToKitchen).toBe(false)
  })

  it("divide la cuenta con un solo cobro de varias formas de pago", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
      payment_breakdown: {
        parts: [
          { method: "cash", amount: 30 },
          { method: "card", amount: 36 },
        ],
        received: 50,
        change: 20,
      },
    })

    const options = orderOptions()
    expect(options.paymentBreakdown.parts).toHaveLength(2)
    expect(orderBody().payment_method).toBeNull()
    // Un solo folio: varias filas por la misma mesa contarían la mesa dos veces.
    expect(folioCalls(calls)).toHaveLength(1)
  })

  it("cierra la cuenta apuntando a la venta que la saldó", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
      payment_method: "cash",
    })

    const payload = writePayload(calls, "foodos_table_tickets")
    expect(payload.status).toBe("closed")
    expect(payload.closed_order_id).toBe("order-1")
    expect(payload.billing_requested_at).toBeNull()
  })

  it("avisa si la venta se cobró pero la mesa no se pudo liberar", async () => {
    const { supabase } = defaultClient({
      // `maybeSingle` resuelve la cuenta; el `then` del update del cierre falla.
      foodos_table_tickets: {
        maybeSingle: { data: OPEN_TICKET },
        rows: { data: null, error: { message: "boom" } },
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
      payment_method: "cash",
    })

    // El cobro no se deshace: deshacerlo dejaría la mesa cobrable dos veces.
    expect(result.ok).toBe(true)
    expect(result.orderId).toBe("order-1")
    expect(result.error).toMatch(/sigue marcada como ocupada/)
  })

  it("un rechazo del productor no reserva folio ni cierra la cuenta", async () => {
    mocks.createFoodosOrder.mockResolvedValue({
      ok: false,
      status: 400,
      error: "El platillo ya no está disponible.",
    })

    const result = await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
      payment_method: "cash",
    })

    expect(result.ok).toBe(false)
    expect(result.folio).toBeUndefined()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("revalida el comandero, los pedidos y la caja tras cobrar", async () => {
    await closeTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      items: ITEMS,
      payment_method: "cash",
    })

    expect(mocks.revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      "/panel/foodos/mesas",
      "/panel/foodos/pedidos",
      "/panel/foodos/caja",
    ])
  })
})

describe("mesas: transferir y unir", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("transferir reapunta las comandas para que la cocina no se equivoque de mesa", async () => {
    const { supabase, calls } = defaultClient({
      foodos_tables: { maybeSingle: { data: { ...TABLE_ROW, id: "table-2" } } },
      // `loadOpenTicket` devuelve la cuenta; `openTicketForTable` no encuentra otra.
      foodos_table_tickets: {
        maybeSingle: [{ data: OPEN_TICKET }, { data: null }],
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await transferTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      table_id: "table-2",
    })

    expect(result.ok).toBe(true)
    expect(writePayload(calls, "foodos_orders").table_number).toBe("Mesa 7")
    // Sólo lo pendiente se mueve: lo ya cobrado pertenece a la mesa anterior.
    expect(
      calls.some(
        (c) => c.table === "foodos_orders" && c.method === "eq" && c.args[0] === "payment_status"
      )
    ).toBe(true)
  })

  it("no mueve la cuenta a una mesa que ya tiene la suya", async () => {
    const { supabase } = defaultClient({
      foodos_tables: { maybeSingle: { data: { ...TABLE_ROW, id: "table-2" } } },
      // Las dos consultas encuentran una cuenta abierta: la de origen y la del destino.
      foodos_table_tickets: {
        maybeSingle: [{ data: OPEN_TICKET }, { data: { ...OPEN_TICKET, id: "ticket-2" } }],
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await transferTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      table_id: "table-2",
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ya tiene una cuenta abierta/)
  })

  it("no transfiere una cuenta a la misma mesa donde ya está", async () => {
    const result = await transferTable({
      restaurant_id: RESTAURANT_ID,
      ticket_id: TICKET_ID,
      table_id: TABLE_ID,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ya está en esa mesa/)
  })

  it("unir mueve las comandas a la cuenta destino", async () => {
    const { supabase, calls } = defaultClient({
      foodos_tables: { maybeSingle: { data: { ...TABLE_ROW, id: "table-2" } } },
      foodos_table_tickets: {
        maybeSingle: [
          { data: OPEN_TICKET },
          { data: { ...OPEN_TICKET, id: "ticket-2", table_id: "table-2" } },
        ],
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await mergeTables({
      restaurant_id: RESTAURANT_ID,
      source_ticket_id: TICKET_ID,
      target_ticket_id: "ticket-2",
    })

    expect(result.ok).toBe(true)
    expect(writePayload(calls, "foodos_orders").table_ticket_id).toBe("ticket-2")
    expect(writePayload(calls, "foodos_table_tickets").status).toBe("void")
  })

  it("no une una cuenta consigo misma", async () => {
    const result = await mergeTables({
      restaurant_id: RESTAURANT_ID,
      source_ticket_id: TICKET_ID,
      target_ticket_id: TICKET_ID,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/dos cuentas distintas/)
  })
})

describe("mesas: cancelar una cuenta", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("marca las comandas canceladas en vez de borrarlas", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await cancelTicket({ restaurant_id: RESTAURANT_ID, ticket_id: TICKET_ID })

    expect(result.ok).toBe(true)
    // Una comanda ya preparada deja rastro de qué se hizo y no se cobró.
    expect(writePayload(calls, "foodos_orders").status).toBe("cancelled")
    expect(writePayload(calls, "foodos_table_tickets").status).toBe("void")
  })
})

describe("mesas: acomodo del salón", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("acota la mesa al lienzo de su zona en el servidor", async () => {
    const { supabase, calls } = defaultClient({
      foodos_table_zones: { maybeSingle: { data: { width: 1000, height: 700 } } },
      foodos_tables: { maybeSingle: { data: { zone_id: "zone-1" } } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await moveTable({ restaurant_id: RESTAURANT_ID, id: TABLE_ID, pos_x: -500, pos_y: 99999 })

    // El acomodo se guarda desde varios dispositivos: una mesa fuera del
    // lienzo es una mesa que nadie vuelve a encontrar.
    const payload = writePayload(calls, "foodos_tables")
    expect(payload.pos_x).toBe(24)
    expect(payload.pos_y).toBe(676)
  })

  it("no borra una zona que todavía tiene mesas", async () => {
    const { supabase } = defaultClient({ foodos_tables: { rows: { count: 3 } } })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await deleteZone({ restaurant_id: RESTAURANT_ID, id: "zone-1" })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Mueve o borra las mesas/)
  })

  it("no borra una mesa con cuenta abierta", async () => {
    const { supabase } = defaultClient({ foodos_table_tickets: { rows: { count: 1 } } })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await deleteTable({ restaurant_id: RESTAURANT_ID, id: TABLE_ID })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/cuenta abierta/)
  })

  it("una zona sin nombre no se guarda", async () => {
    const result = await saveZone({ restaurant_id: RESTAURANT_ID, name: "   " })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/nombre/)
  })
})
