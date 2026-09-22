import { beforeEach, describe, expect, it, vi } from "vitest"

// El mostrador es la primera superficie que cobra dinero en el panel, así que
// esta suite defiende cuatro invariantes que no se ven en la pantalla:
//
//   1. Nivel suficiente verificado en el servidor, antes de la sesión. Las
//      ESCRITURAS lanzan; las LECTURAS degradan.
//   2. **Sin turno de caja abierto no hay venta.** Una venta sin turno no tiene
//      dónde colgarse y desaparece del arqueo del día.
//   3. **El folio se reserva al final.** Si se pidiera antes de validar el
//      turno, la forma de pago o la dirección, cada intento fallido quemaría un
//      número consecutivo.
//   4. **Forma de pago y cobro combinado son excluyentes**, y el desglose
//      viaja en `options` —nunca en el `body`— porque el `body` lo controla el
//      navegador.

const mocks = vi.hoisted(() => ({
  requireFoodosFeature: vi.fn(),
  requireAuth: vi.fn(),
  requireFoodosAuth: vi.fn(),
  getOperatingContext: vi.fn(),
  assertOwnRestaurant: vi.fn(),
  createFoodosOrder: vi.fn(),
  quoteDelivery: vi.fn(),
  requireOpenShift: vi.fn(),
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
vi.mock("@/lib/flotilla/deliveries", () => ({ quoteDelivery: mocks.quoteDelivery }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: vi.fn() }))
// El menú se lee con el cliente de servicio desde 00193 (`foodos_menu_items.cost`
// dejó de ser legible con la sesión); el doble de abajo lo apunta al mismo
// cliente falso que usa la sesión.
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
// `NoOpenShiftError` e `isNoOpenShiftError` se conservan reales: el predicado de
// tipo usa `instanceof`, así que un doble los desconectaría en silencio.
vi.mock("@/lib/foodos-shift", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/foodos-shift")>()
  return { ...actual, requireOpenShift: mocks.requireOpenShift }
})

import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"

import { NoOpenShiftError } from "@/lib/foodos-shift"

import { createMostradorSale, getMostradorData, quoteMostradorDelivery } from "./mostrador-actions"

const RESTAURANT_ID = "rest-1"
const BRANCH_ID = "branch-1"
const SHIFT_ID = "shift-1"
const USER = { id: "user-1", email: "cajero@example.com" }

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
  vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
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

const ITEMS = [{ item_id: "item-1", name: "Taco al pastor", price: 22, qty: 3 }]

type Call = { table: string; method: string; args: unknown[] }
type TableConfig = { rows?: unknown; maybeSingle?: unknown }

/** Builder encadenable y "awaitable", como el de supabase-js. */
function fakeClient(tables: Record<string, TableConfig>) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const config = tables[table] ?? {}
      const builder: Record<string, unknown> = {}
      for (const method of ["select", "insert", "update", "delete", "eq", "is", "order", "limit"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          return builder
        }
      }
      builder.maybeSingle = async () => {
        calls.push({ table, method: "maybeSingle", args: [] })
        return "maybeSingle" in config ? config.maybeSingle : { data: null, error: null }
      }
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: config.rows ?? [], error: null }).then(resolve)
      return builder
    },
    rpc: (...args: unknown[]) => {
      mocks.rpc(...args)
      calls.push({ table: "rpc", method: "rpc", args })
      return Promise.resolve({ data: "260917-0001", error: null })
    },
  }
  return { supabase: client as unknown as SupabaseClient, calls }
}

function defaultClient() {
  return fakeClient({
    foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
    foodos_branches: { rows: [] },
    foodos_menu_categories: { rows: [] },
    foodos_menu_items: { rows: [] },
    foodos_combos: { rows: [] },
    foodos_item_option_groups: { rows: [] },
    foodos_item_option_values: { rows: [] },
    foodos_branch_menu_overrides: { rows: [] },
  })
}

function folioCalls(calls: Call[]): Call[] {
  return calls.filter((c) => c.table === "rpc" && c.args[0] === "foodos_next_folio")
}

beforeEach(() => {
  vi.clearAllMocks()
  const { supabase } = defaultClient()
  mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
  mocks.assertOwnRestaurant.mockResolvedValue(undefined)
  mocks.requireOpenShift.mockResolvedValue(OPEN_SHIFT)
  mocks.createFoodosOrder.mockResolvedValue({ ok: true, orderId: "order-1", total: 101, slug: "taqueria-centro" })
})

describe("mostrador: bloqueado sin el nivel suficiente", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockRejectedValue(new Error("FOODOS_FEATURE_LOCKED"))
  })

  it("rechaza cada cobro antes de tocar la base", async () => {
    await expect(
      createMostradorSale({ restaurant_id: RESTAURANT_ID, items: ITEMS, service: "takeaway", payment_method: "cash" })
    ).rejects.toThrow()
    await expect(
      quoteMostradorDelivery({ restaurant_id: RESTAURANT_ID, branch_id: BRANCH_ID, subtotal: 100 })
    ).rejects.toThrow()

    // Ni siquiera se resuelve la sesión ni se reserva un folio: el gate corre primero.
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
    expect(mocks.requireOpenShift).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("pos_mostrador")
  })

  it("la lectura degrada en vez de romper la pantalla", async () => {
    await expect(getMostradorData(RESTAURANT_ID)).resolves.toBeNull()
  })
})

describe("mostrador: caja cerrada", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("la lectura devuelve el menú con el turno en null, no una pantalla rota", async () => {
    const data = await getMostradorData(RESTAURANT_ID)

    expect(data?.shift).toBeNull()
    expect(data?.restaurant.name).toBe("Taquería Centro")
    expect(data?.items).toEqual([])
  })

  it("sin turno abierto no cobra y explica por qué", async () => {
    mocks.requireOpenShift.mockRejectedValue(new NoOpenShiftError())

    const result = await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_method: "cash",
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Abre la caja/)
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
  })

  it("no quema un folio cuando la venta se cae por falta de turno", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
    mocks.requireOpenShift.mockRejectedValue(new NoOpenShiftError())

    await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_method: "cash",
    })

    expect(folioCalls(calls)).toHaveLength(0)
  })
})

describe("mostrador: validaciones antes del folio", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("rechaza un ticket vacío", async () => {
    const result = await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: [],
      service: "takeaway",
      payment_method: "cash",
    })

    expect(result).toEqual({ ok: false, error: "El ticket está vacío." })
    expect(mocks.requireOpenShift).not.toHaveBeenCalled()
  })

  it("exige una forma de pago", async () => {
    const result = await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/forma de pago/)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rechaza una forma de pago suelta junto al cobro combinado", async () => {
    const result = await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_method: "cash",
      payment_breakdown: {
        parts: [{ method: "cash", amount: 60 }, { method: "card", amount: 41 }],
        received: 100,
        change: 40,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/combinado/)
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
  })

  it("rechaza una forma de pago que no existe en el vocabulario", async () => {
    const result = await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_method: "bitcoin",
    })

    expect(result.ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("la entrega a domicilio sin dirección no se cobra", async () => {
    const result = await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "delivery",
      payment_method: "cash",
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/dirección/)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("un folio que la base no puede reservar no se inventa en el cliente", async () => {
    const { supabase } = defaultClient()
    supabase.rpc = (() => Promise.resolve({ data: null, error: { message: "boom" } })) as never
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_method: "cash",
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/folio/)
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
  })
})

describe("mostrador: cobro", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("delega los totales en el productor único y devuelve folio, total y cambio", async () => {
    const result = await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_method: "cash",
      tip: 10,
    })

    expect(result).toEqual({
      ok: true,
      orderId: "order-1",
      folio: "260917-0001",
      total: 101,
      change: null,
    })

    const body = mocks.createFoodosOrder.mock.calls[0]?.[1]
    expect(body.channel).toBe("mostrador")
    expect(body.fulfillment).toBe("pickup")
    expect(body.payment_method).toBe("cash")
    expect(body.tip).toBe(10)
    // La lista de precios la rehace el productor; el mostrador sólo la propone.
    expect(body.items).toEqual(ITEMS)
  })

  it("manda el folio, el cajero y el turno en `options`, nunca en el body", async () => {
    await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_method: "cash",
    })

    const body = mocks.createFoodosOrder.mock.calls[0]?.[1]
    const options = mocks.createFoodosOrder.mock.calls[0]?.[2]

    expect(body.folio).toBeUndefined()
    expect(body.cashier_user_id).toBeUndefined()
    expect(body.pos_shift_id).toBeUndefined()
    expect(options.pos).toEqual({
      folio: "260917-0001",
      cashierUserId: USER.id,
      shiftId: SHIFT_ID,
      settled: true,
    })
    // Nadie cierra una venta de mostrador sin haber cobrado.
    expect(options.pos.settled).toBe(true)
  })

  it("mapea cada tipo de servicio a su fulfillment", async () => {
    await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_method: "cash",
    })
    expect(mocks.createFoodosOrder.mock.calls[0]?.[1].fulfillment).toBe("pickup")

    mocks.createFoodosOrder.mockClear()

    await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "delivery",
      payment_method: "cash",
      delivery_address: "Calle Hidalgo 12, Centro",
    })
    expect(mocks.createFoodosOrder.mock.calls[0]?.[1].fulfillment).toBe("delivery")

    mocks.createFoodosOrder.mockClear()

    await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "dine_in",
      payment_method: "cash",
      table_number: "7",
    })
    expect(mocks.createFoodosOrder.mock.calls[0]?.[1].fulfillment).toBe("dine_in")
  })

  it("el cobro combinado viaja en `options.paymentBreakdown` y su cambio se devuelve", async () => {
    mocks.createFoodosOrder.mockResolvedValue({ ok: true, orderId: "order-2", total: 101, slug: "taqueria-centro" })

    const result = await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_breakdown: {
        parts: [{ method: "cash", amount: 60 }, { method: "card", amount: 41 }],
        received: 100,
        change: 40,
      },
    })

    const body = mocks.createFoodosOrder.mock.calls[0]?.[1]
    const options = mocks.createFoodosOrder.mock.calls[0]?.[2]

    expect(body.payment_method).toBeNull()
    expect(options.paymentBreakdown.parts).toEqual([
      { method: "cash", amount: 60 },
      { method: "card", amount: 41 },
    ])
    expect(result.change).toBe(40)
  })

  it("una venta rechazada por el productor se reporta como fallo, sin folio", async () => {
    mocks.createFoodosOrder.mockResolvedValue({
      ok: false,
      status: 400,
      error: "El platillo ya no está disponible.",
    })

    const result = await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_method: "cash",
    })

    expect(result.ok).toBe(false)
    expect(result.folio).toBeUndefined()
    expect(result.error).toMatch(/ya no está disponible/)
    // El corte del día y la lista de pedidos tienen que ver la venta.
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("revalida el mostrador, la caja y los pedidos tras cobrar", async () => {
    await createMostradorSale({
      restaurant_id: RESTAURANT_ID,
      items: ITEMS,
      service: "takeaway",
      payment_method: "cash",
    })

    expect(mocks.revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      "/panel/foodos/mostrador",
      "/panel/foodos/caja",
      "/panel/foodos/pedidos",
    ])
  })
})

describe("mostrador: cotización de entrega", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("sin sucursal no se puede cotizar", async () => {
    const result = await quoteMostradorDelivery({ restaurant_id: RESTAURANT_ID, subtotal: 100 })

    expect(result.ok).toBe(false)
    expect(mocks.quoteDelivery).not.toHaveBeenCalled()
  })

  it("una sucursal que no entrega a domicilio se rechaza antes de cotizar", async () => {
    const { supabase } = fakeClient({
      foodos_branches: {
        maybeSingle: { data: { delivery_active: false, delivery_fee: 45 }, error: null },
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await quoteMostradorDelivery({
      restaurant_id: RESTAURANT_ID,
      branch_id: BRANCH_ID,
      subtotal: 100,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no entrega/)
    expect(mocks.quoteDelivery).not.toHaveBeenCalled()
  })

  it("cotiza sin crear el pedido", async () => {
    const { supabase } = fakeClient({
      foodos_branches: {
        maybeSingle: { data: { delivery_active: true, delivery_fee: 45 }, error: null },
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
    mocks.quoteDelivery.mockResolvedValue({ fee: 45, reason: "ok", etaMinutes: 35 })

    const result = await quoteMostradorDelivery({
      restaurant_id: RESTAURANT_ID,
      branch_id: BRANCH_ID,
      subtotal: 100,
      delivery_lat: 20.6,
      delivery_lng: -103.4,
    })

    expect(result).toEqual({ ok: true, deliveryFee: 45, etaMinutes: 35 })
    // Cotizar es de sólo lectura: si creara el pedido, consumiría folio y
    // dispararía cocina por un total que el cliente todavía no acepta.
    expect(mocks.createFoodosOrder).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("una dirección fuera de zona no se cotiza con la tarifa base", async () => {
    const { supabase } = fakeClient({
      foodos_branches: {
        maybeSingle: { data: { delivery_active: true, delivery_fee: 45 }, error: null },
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
    mocks.quoteDelivery.mockResolvedValue({ fee: 0, reason: "unavailable" })

    const result = await quoteMostradorDelivery({
      restaurant_id: RESTAURANT_ID,
      branch_id: BRANCH_ID,
      subtotal: 100,
      delivery_lat: 20.6,
      delivery_lng: -103.4,
    })

    expect(result.ok).toBe(false)
    expect(result.deliveryFee).toBeUndefined()
  })

  it("por debajo del mínimo dice cuánto falta, no sólo que no se puede", async () => {
    const { supabase } = fakeClient({
      foodos_branches: {
        maybeSingle: { data: { delivery_active: true, delivery_fee: 45 }, error: null },
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
    mocks.quoteDelivery.mockResolvedValue({ fee: 45, reason: "below_minimum", minOrder: 150 })

    const result = await quoteMostradorDelivery({
      restaurant_id: RESTAURANT_ID,
      branch_id: BRANCH_ID,
      subtotal: 100,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/150/)
  })
})
