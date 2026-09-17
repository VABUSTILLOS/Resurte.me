import { beforeEach, describe, expect, it, vi } from "vitest"

// `createFoodosOrder` es el productor único de pedidos: lo consumen el
// micrositio público y el Mesero IA de WhatsApp. Estos tests fijan el
// invariante que más caro sale si se rompe: el cliente nunca fija un precio.

const mocks = vi.hoisted(() => ({ dispatchOrderCreated: vi.fn() }))

vi.mock("@/lib/foodos-webhooks", () => ({
  dispatchOrderCreated: mocks.dispatchOrderCreated,
}))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createFoodosOrder, type FoodosOrderBody } from "./foodos-order-create"

const RESTAURANT_ID = "rest-1"
const BRANCH_ID = "branch-1"

interface TableConfig {
  [table: string]: unknown
}

interface FakeCalls {
  rpcs: { name: string; args: unknown }[]
  inserts: { table: string; payload: Record<string, unknown> }[]
  updates: { table: string; payload: Record<string, unknown> }[]
}

/** Cliente falso con respuestas por tabla; registra escrituras y RPC. */
function fakeClient(config: TableConfig) {
  const calls: FakeCalls = { rpcs: [], inserts: [], updates: [] }
  const client = {
    from(table: string) {
      let mode: "read" | "insert" | "update" = "read"
      const builder: Record<string, unknown> = {}
      for (const method of [
        "select",
        "eq",
        "neq",
        "gte",
        "lte",
        "in",
        "order",
        "limit",
        "ilike",
        "is",
        "filter",
      ]) {
        builder[method] = () => builder
      }
      builder.insert = (payload: Record<string, unknown>) => {
        mode = "insert"
        calls.inserts.push({ table, payload })
        return builder
      }
      builder.update = (payload: Record<string, unknown>) => {
        mode = "update"
        calls.updates.push({ table, payload })
        return builder
      }
      // "cero o una fila": sin configuración explícita, no hay fila.
      builder.maybeSingle = async () => ({ data: config[table] ?? null, error: null })
      builder.single = async () => {
        if (table === "foodos_orders" && mode === "insert") {
          return {
            data: config.__orderInsert ?? {
              id: "order-1",
              total: 0,
              restaurant_id: RESTAURANT_ID,
              slug: "mi-restaurante",
            },
            error: config.__orderInsertError ?? null,
          }
        }
        return { data: config[table] ?? null, error: null }
      }
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: config[table] ?? [], error: null }).then(resolve)
      return builder
    },
    rpc: async (name: string, args: unknown) => {
      calls.rpcs.push({ name, args })
      return { data: null, error: null }
    },
  }
  return { client: client as never, calls }
}

/** Restaurante activo + sucursal que ofrece todo. */
function baseConfig(overrides: TableConfig = {}): TableConfig {
  return {
    foodos_restaurants: { id: RESTAURANT_ID, timezone: "America/Mexico_City" },
    foodos_branches: {
      id: BRANCH_ID,
      pickup_active: true,
      delivery_active: true,
      dine_in_active: true,
      delivery_fee: 45,
      scheduled_orders_active: true,
      lead_minutes: 30,
    },
    foodos_branch_hours: [],
    foodos_menu_items: [{ id: "item-1", price: 100 }],
    foodos_item_option_groups: [],
    foodos_item_option_values: [],
    foodos_branch_menu_overrides: [],
    ...overrides,
  }
}

function body(overrides: Partial<FoodosOrderBody> = {}): FoodosOrderBody {
  return {
    restaurant_id: RESTAURANT_ID,
    branch_id: BRANCH_ID,
    items: [{ item_id: "item-1", name: "Tacos", price: 1, qty: 2 }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.dispatchOrderCreated.mockResolvedValue(undefined)
})

describe("validación de entrada", () => {
  it("exige restaurante e items", async () => {
    const { client } = fakeClient(baseConfig())
    await expect(createFoodosOrder(client, { restaurant_id: "", items: [] })).resolves.toMatchObject({
      ok: false,
      status: 400,
    })
  })

  it("rechaza un restaurante inactivo", async () => {
    const { client } = fakeClient(baseConfig({ foodos_restaurants: null }))
    await expect(createFoodosOrder(client, body())).resolves.toMatchObject({
      ok: false,
      status: 404,
    })
  })

  it("rechaza una sucursal que no ofrece entrega", async () => {
    const { client } = fakeClient(
      baseConfig({ foodos_branches: { ...(baseConfig().foodos_branches as object), delivery_active: false } })
    )
    await expect(createFoodosOrder(client, body({ fulfillment: "delivery" }))).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: "Esta sucursal no ofrece entrega",
    })
  })

  it("rechaza un pedido programado sin sucursal", async () => {
    const { client } = fakeClient(baseConfig())
    await expect(
      createFoodosOrder(client, body({ branch_id: null, scheduled_for: new Date(Date.now() + 3_600_000).toISOString() }))
    ).resolves.toMatchObject({ ok: false, status: 400 })
  })

  it("rechaza más de 20 líneas", async () => {
    const { client } = fakeClient(baseConfig())
    const items = Array.from({ length: 21 }, () => ({ item_id: "item-1", name: "Tacos", price: 1, qty: 1 }))
    await expect(createFoodosOrder(client, body({ items }))).resolves.toMatchObject({
      ok: false,
      status: 400,
    })
  })
})

describe("precios: el cliente nunca los fija", () => {
  it("ignora el precio del cliente y usa el de la base", async () => {
    const { client, calls } = fakeClient(baseConfig())
    const result = await createFoodosOrder(
      client,
      body({ items: [{ item_id: "item-1", name: "Tacos", price: 1, qty: 2 }] })
    )

    expect(result).toMatchObject({ ok: true })
    const payload = calls.inserts[0]?.payload
    expect(payload?.subtotal).toBe(200)
    expect(payload?.total).toBe(200)
  })

  it("ignora el delivery_fee del cliente y usa el de la sucursal", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(
      client,
      body({
        fulfillment: "delivery",
        delivery_fee: 0,
        items: [{ item_id: "item-1", name: "Tacos", price: 1, qty: 1 }],
      })
    )

    const payload = calls.inserts[0]?.payload
    expect(payload?.delivery_fee).toBe(45)
    expect(payload?.total).toBe(145)
  })

  it("suma los modificadores validados al precio base", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        foodos_item_option_groups: [
          { id: "grp-1", item_id: "item-1", name: "Salsa", is_required: true, min_select: 1, max_select: 2 },
        ],
        foodos_item_option_values: [
          { id: "val-1", group_id: "grp-1", name: "Habanero", price_delta: 15, is_available: true },
        ],
      })
    )
    await createFoodosOrder(
      client,
      body({
        items: [
          {
            item_id: "item-1",
            name: "Tacos",
            price: 1,
            qty: 1,
            modifiers: [{ group_id: "grp-1", group_name: "Salsa", value_id: "val-1", value_name: "Habanero", price_delta: 9999 }],
          },
        ],
      })
    )

    const payload = calls.inserts[0]?.payload
    // 100 + 15 (delta real de la BD), no 100 + 9999 (lo que mandó el cliente).
    expect(payload?.subtotal).toBe(115)
  })

  it("usa el precio del combo de la base", async () => {
    const { client, calls } = fakeClient(baseConfig({ foodos_combos: [{ id: "combo-1", price: 250 }] }))
    await createFoodosOrder(
      client,
      body({ items: [{ item_id: "combo-1", name: "Combo", price: 5, qty: 1, combo_id: "combo-1" }] })
    )

    expect(calls.inserts[0]?.payload.subtotal).toBe(250)
  })

  it("aplica el override de precio de la sucursal", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ foodos_branch_menu_overrides: [{ item_id: "item-1", price: 130, is_available: true }] })
    )
    await createFoodosOrder(client, body({ items: [{ item_id: "item-1", name: "Tacos", price: 1, qty: 1 }] }))

    expect(calls.inserts[0]?.payload.subtotal).toBe(130)
  })

  it("rechaza un platillo deshabilitado en la sucursal", async () => {
    const { client } = fakeClient(
      baseConfig({ foodos_branch_menu_overrides: [{ item_id: "item-1", price: null, is_available: false }] })
    )
    await expect(createFoodosOrder(client, body())).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: "Un platillo no está disponible en esta sucursal",
    })
  })

  it("rechaza un platillo que no existe", async () => {
    const { client } = fakeClient(baseConfig({ foodos_menu_items: [] }))
    await expect(createFoodosOrder(client, body())).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: "Platillo no válido en el pedido",
    })
  })

  it("limita la cantidad por línea a 50", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(client, body({ items: [{ item_id: "item-1", name: "Tacos", price: 1, qty: 999 }] }))

    const payload = calls.inserts[0]?.payload
    expect((payload?.items as { qty: number }[])[0]?.qty).toBe(50)
  })
})

describe("modificadores", () => {
  const withGroup = baseConfig({
    foodos_item_option_groups: [
      { id: "grp-1", item_id: "item-1", name: "Salsa", is_required: true, min_select: 1, max_select: 1 },
    ],
    foodos_item_option_values: [
      { id: "val-1", group_id: "grp-1", name: "Habanero", price_delta: 0, is_available: true },
      { id: "val-2", group_id: "grp-1", name: "Agotada", price_delta: 0, is_available: false },
    ],
  })

  it("exige los grupos obligatorios", async () => {
    const { client } = fakeClient(withGroup)
    await expect(createFoodosOrder(client, body())).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: 'Falta elegir "Salsa" en un platillo',
    })
  })

  it("rechaza un modificador de otro platillo", async () => {
    const { client } = fakeClient(
      baseConfig({
        foodos_item_option_groups: [],
        foodos_item_option_values: [
          { id: "val-9", group_id: "grp-otro", name: "Ajeno", price_delta: 0, is_available: true },
        ],
      })
    )
    await expect(
      createFoodosOrder(
        client,
        body({
          items: [
            {
              item_id: "item-1",
              name: "Tacos",
              price: 100,
              qty: 1,
              modifiers: [{ group_id: "grp-otro", group_name: "Otro", value_id: "val-9", value_name: "Ajeno", price_delta: 0 }],
            },
          ],
        })
      )
    ).resolves.toMatchObject({ ok: false, status: 400, error: "Modificador no pertenece al platillo" })
  })

  it("rechaza un modificador no disponible", async () => {
    const { client } = fakeClient(withGroup)
    await expect(
      createFoodosOrder(
        client,
        body({
          items: [
            {
              item_id: "item-1",
              name: "Tacos",
              price: 100,
              qty: 1,
              modifiers: [{ group_id: "grp-1", group_name: "Salsa", value_id: "val-2", value_name: "Agotada", price_delta: 0 }],
            },
          ],
        })
      )
    ).resolves.toMatchObject({ ok: false, status: 400, error: "Modificador no válido en el pedido" })
  })

  it("rechaza más opciones que el máximo del grupo", async () => {
    const { client } = fakeClient(
      baseConfig({
        foodos_item_option_groups: [
          { id: "grp-1", item_id: "item-1", name: "Salsa", is_required: false, min_select: 0, max_select: 1 },
        ],
        foodos_item_option_values: [
          { id: "val-1", group_id: "grp-1", name: "Roja", price_delta: 0, is_available: true },
          { id: "val-2", group_id: "grp-1", name: "Verde", price_delta: 0, is_available: true },
        ],
      })
    )
    await expect(
      createFoodosOrder(
        client,
        body({
          items: [
            {
              item_id: "item-1",
              name: "Tacos",
              price: 100,
              qty: 1,
              modifiers: [
                { group_id: "grp-1", group_name: "Salsa", value_id: "val-1", value_name: "Roja", price_delta: 0 },
                { group_id: "grp-1", group_name: "Salsa", value_id: "val-2", value_name: "Verde", price_delta: 0 },
              ],
            },
          ],
        })
      )
    ).resolves.toMatchObject({ ok: false, status: 400, error: 'Demasiadas opciones en "Salsa"' })
  })
})

describe("cupón, propina y lealtad", () => {
  const coupon = {
    code: "VERANO",
    type: "percent",
    value: 10,
    min_order: 0,
    max_uses: 100,
    usage_count: 3,
    is_active: true,
    expires_at: null,
  }

  it("aplica el cupón y registra su uso", async () => {
    const { client, calls } = fakeClient(baseConfig({ foodos_coupons: coupon }))
    const result = await createFoodosOrder(
      client,
      body({ coupon_code: "verano", items: [{ item_id: "item-1", name: "Tacos", price: 1, qty: 1 }] })
    )

    expect(result).toMatchObject({ ok: true })
    const payload = calls.inserts[0]?.payload
    expect(payload?.discount).toBe(10)
    expect(payload?.total).toBe(90)
    expect(payload?.coupon_code).toBe("VERANO")
    expect(calls.rpcs).toContainEqual({
      name: "increment_foodos_coupon_usage",
      args: { p_restaurant_id: RESTAURANT_ID, p_code: "VERANO" },
    })
  })

  it("rechaza un cupón inactivo", async () => {
    const { client } = fakeClient(baseConfig({ foodos_coupons: { ...coupon, is_active: false } }))
    await expect(createFoodosOrder(client, body({ coupon_code: "VERANO" }))).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: "Este cupón está desactivado",
    })
  })

  it("rechaza un cupón inexistente", async () => {
    const { client } = fakeClient(baseConfig())
    await expect(createFoodosOrder(client, body({ coupon_code: "NADA" }))).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: "Cupón no válido",
    })
  })

  it("recorta la propina al subtotal", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(
      client,
      body({ tip: 9999, items: [{ item_id: "item-1", name: "Tacos", price: 1, qty: 1 }] })
    )

    const payload = calls.inserts[0]?.payload
    expect(payload?.tip).toBe(100)
    expect(payload?.total).toBe(200)
  })

  it("canjea puntos y descuenta el saldo del cliente", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        foodos_loyalty_programs: { points_per_100: 1, point_value: 1, is_active: true },
        foodos_customers: { id: "cust-1", loyalty_points: 50, store_credit: 0 },
      })
    )
    await createFoodosOrder(
      client,
      body({
        redeem_points: true,
        customer_phone: "+52 55 1234 5678",
        items: [{ item_id: "item-1", name: "Tacos", price: 1, qty: 1 }],
      })
    )

    const payload = calls.inserts[0]?.payload
    expect(payload?.loyalty_points_redeemed).toBe(50)
    expect(payload?.discount).toBe(50)
    expect(payload?.total).toBe(50)

    const update = calls.updates.find((u) => u.table === "foodos_customers")
    expect(update?.payload).toMatchObject({ loyalty_points: 0, store_credit: 0 })
  })

  it("no canjea nada sin teléfono de cliente", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        foodos_loyalty_programs: { points_per_100: 1, point_value: 1, is_active: true },
        foodos_customers: { id: "cust-1", loyalty_points: 50, store_credit: 0 },
      })
    )
    await createFoodosOrder(
      client,
      body({ redeem_points: true, items: [{ item_id: "item-1", name: "Tacos", price: 1, qty: 1 }] })
    )

    expect(calls.inserts[0]?.payload.loyalty_points_redeemed).toBe(0)
    expect(calls.updates).toHaveLength(0)
  })
})

describe("persistencia", () => {
  it("marca el pago pendiente solo para tarjeta y transferencia", async () => {
    for (const [method, expected] of [
      ["card", "pending"],
      ["transfer", "pending"],
      ["cash", "paid"],
      [null, "paid"],
    ] as const) {
      const { client, calls } = fakeClient(baseConfig())
      await createFoodosOrder(client, body({ payment_method: method }))
      expect(calls.inserts[0]?.payload.payment_status).toBe(expected)
    }
  })

  it("guarda table_number solo en dine_in", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(client, body({ fulfillment: "pickup", table_number: "7" }))
    expect(calls.inserts[0]?.payload.table_number).toBeNull()

    const mesa = fakeClient(baseConfig())
    await createFoodosOrder(mesa.client, body({ fulfillment: "dine_in", table_number: "7" }))
    expect(mesa.calls.inserts[0]?.payload.table_number).toBe("7")
  })

  it("dispara order.created con el pedido creado", async () => {
    const { client } = fakeClient(baseConfig())
    await createFoodosOrder(client, body({ channel: "whatsapp" }))

    expect(mocks.dispatchOrderCreated).toHaveBeenCalledWith(
      client,
      RESTAURANT_ID,
      expect.objectContaining({ id: "order-1", channel: "whatsapp" })
    )
  })

  it("devuelve el error de la base sin filtrarlo al cliente", async () => {
    const { client } = fakeClient(
      baseConfig({ __orderInsertError: { message: "duplicate key", code: "23505" } })
    )
    const result = await createFoodosOrder(client, body())

    expect(result).toMatchObject({ ok: false, status: 500, error: "Error al crear el pedido" })
    expect(mocks.dispatchOrderCreated).not.toHaveBeenCalled()
  })

  it("expone el slug para el enlace de seguimiento", async () => {
    const { client } = fakeClient(baseConfig())
    await expect(createFoodosOrder(client, body())).resolves.toMatchObject({
      ok: true,
      orderId: "order-1",
      slug: "mi-restaurante",
    })
  })
})

// El contexto de punto de venta es la única entrada de `createFoodosOrder` que
// no viene del navegador. Estos tests fijan dos cosas: que se persista tal cual
// y que un pedido en línea jamás pueda fabricarse uno.
describe("contexto de punto de venta", () => {
  const POS = {
    folio: "260917-0001",
    cashierUserId: "user-caja",
    shiftId: "shift-1",
  }

  it("sella folio, cajero y turno en el pedido", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(client, body({ channel: "mostrador" }), { pos: POS })

    expect(calls.inserts[0]?.payload).toMatchObject({
      folio: "260917-0001",
      cashier_user_id: "user-caja",
      pos_shift_id: "shift-1",
      table_ticket_id: null,
    })
  })

  it("sin contexto de punto de venta no inventa folio ni turno", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(client, body())

    expect(calls.inserts[0]?.payload).toMatchObject({
      folio: null,
      cashier_user_id: null,
      pos_shift_id: null,
      table_ticket_id: null,
    })
  })

  it("el mostrador vende aunque el horario publicado esté cerrado", async () => {
    const hours = [
      {
        branch_id: BRANCH_ID,
        day_of_week: 0,
        open_time: "00:00",
        close_time: "00:01",
        is_closed: true,
      },
    ]
    const { client } = fakeClient(baseConfig({ foodos_branch_hours: hours }))

    await expect(
      createFoodosOrder(client, body({ channel: "mostrador" }), { pos: POS })
    ).resolves.toMatchObject({ ok: true })

    await expect(createFoodosOrder(client, body())).resolves.toMatchObject({ ok: false, status: 400 })
  })

  it("el cajero cierra la venta como pagada aunque sea con tarjeta", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(client, body({ payment_method: "card" }), { pos: POS })

    expect(calls.inserts[0]?.payload).toMatchObject({
      payment_method: "card",
      payment_status: "paid",
    })
  })

  it("una cuenta de mesa abierta queda pendiente", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(
      client,
      body({ payment_method: "cash" }),
      { pos: { ...POS, tableTicketId: "ticket-1", settled: false } }
    )

    expect(calls.inserts[0]?.payload).toMatchObject({
      payment_status: "pending",
      table_ticket_id: "ticket-1",
    })
  })

  it("en línea la tarjeta sigue pendiente de confirmar", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(client, body({ payment_method: "card" }))

    expect(calls.inserts[0]?.payload).toMatchObject({ payment_status: "pending" })
  })
})

describe("cobro combinado", () => {
  const POS = {
    folio: "260917-0001",
    cashierUserId: "user-caja",
    shiftId: "shift-1",
  }
  const parts = (pairs: [string, number][]) => ({
    parts: pairs.map(([method, amount]) => ({ method, amount })),
  })

  it("persiste el desglose y resume el método como mixed", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(client, body(), {
      pos: POS,
      paymentBreakdown: parts([["cash", 120], ["card", 80]]),
    })

    expect(calls.inserts[0]?.payload).toMatchObject({
      payment_method: "mixed",
      payment_status: "paid",
      payment_breakdown: { parts: [{ method: "cash", amount: 120 }, { method: "card", amount: 80 }] },
    })
  })

  it("con una sola forma de pago no lo marca como combinado", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(client, body(), { pos: POS, paymentBreakdown: parts([["transfer", 200]]) })

    expect(calls.inserts[0]?.payload).toMatchObject({
      payment_method: "transfer",
      payment_status: "paid",
    })
  })

  it("rechaza un desglose que no cuadra con el total recalculado", async () => {
    const { client, calls } = fakeClient(baseConfig())
    const result = await createFoodosOrder(client, body(), {
      pos: POS,
      paymentBreakdown: parts([["cash", 150]]),
    })

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(calls.inserts).toHaveLength(0)
  })

  it("rechaza un desglose con una forma de pago inventada", async () => {
    const { client, calls } = fakeClient(baseConfig())
    const result = await createFoodosOrder(client, body(), {
      pos: POS,
      paymentBreakdown: parts([["bitcoin", 200]]),
    })

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(calls.inserts).toHaveLength(0)
  })

  it("recalcula el cambio en servidor: el navegador no lo fija", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(client, body(), {
      pos: POS,
      paymentBreakdown: { ...parts([["cash", 200]]), received: 500, change: 999 },
    })

    expect(calls.inserts[0]?.payload).toMatchObject({
      payment_breakdown: { received: 500, change: 300 },
    })
  })

  it("sin desglose no escribe la columna", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await createFoodosOrder(client, body(), { pos: POS })

    expect(calls.inserts[0]?.payload.payment_breakdown).toBeNull()
  })
})
