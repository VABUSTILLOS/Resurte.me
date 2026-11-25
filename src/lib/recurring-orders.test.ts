import { describe, expect, it, vi } from "vitest"

// Los canales externos y los módulos hermanos se sustituyen:
// la generación se prueba contra el fake de Supabase por colas,
// como en whatsapp-orders.test.ts.
vi.mock("@/lib/workflows", () => ({
  runNewOrderWorkflows: vi.fn(async () => {}),
}))
vi.mock("@/lib/whatsapp", () => ({
  sendTextMessage: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/stock-notifications", () => ({
  processStockNotifications: vi.fn(async () => {}),
}))
vi.mock("@/lib/product-variants", () => ({
  fetchOrderVariantData: vi.fn(async () => ({
    byId: new Map(),
    productIdsWithVariants: new Set(),
    tableAvailable: true,
  })),
}))
vi.mock("@/lib/product-quantity-limits", () => ({
  fetchQuantityLimits: vi.fn(async () => new Map()),
  validateQuantityLimits: vi.fn(() => []),
  describeQuantityViolation: vi.fn(() => ""),
}))
vi.mock("@/lib/customer-prices", () => ({
  fetchCustomerPrices: vi.fn(async () => new Map()),
}))
vi.mock("@/lib/order-stock", () => ({
  callStockRpc: vi.fn(async () => null),
  describeStockConflicts: vi.fn(() => "sin existencia"),
}))

import {
  advanceNextRun,
  computeInitialNextRun,
  generateRecurringOrder,
  nextRunAfterRun,
  runDueRecurringOrders,
  validateRecurringItems,
  validateRecurringTemplateInput,
  type RecurringOrderRow,
} from "./recurring-orders"

// ── Calendario ──────────────────────────────────────────────
// 2026-11-25 es miércoles; 2026-11-23 lunes; 2026-11-29 domingo.

describe("computeInitialNextRun", () => {
  it("semanal: hoy si el día coincide, si no el próximo", () => {
    expect(
      computeInitialNextRun({ frequency: "weekly", weekday: 3, day_of_month: null }, "2026-11-25")
    ).toBe("2026-11-25")
    expect(
      computeInitialNextRun({ frequency: "weekly", weekday: 1, day_of_month: null }, "2026-11-25")
    ).toBe("2026-11-30")
    expect(
      computeInitialNextRun({ frequency: "weekly", weekday: 0, day_of_month: null }, "2026-11-25")
    ).toBe("2026-11-29")
  })

  it("mensual: este mes si el día no pasó, si no el siguiente", () => {
    expect(
      computeInitialNextRun({ frequency: "monthly", weekday: null, day_of_month: 28 }, "2026-11-25")
    ).toBe("2026-11-28")
    expect(
      computeInitialNextRun({ frequency: "monthly", weekday: null, day_of_month: 25 }, "2026-11-25")
    ).toBe("2026-11-25")
    expect(
      computeInitialNextRun({ frequency: "monthly", weekday: null, day_of_month: 10 }, "2026-11-25")
    ).toBe("2026-12-10")
    expect(
      computeInitialNextRun({ frequency: "monthly", weekday: null, day_of_month: 5 }, "2026-12-30")
    ).toBe("2027-01-05")
  })
})

describe("advanceNextRun / nextRunAfterRun", () => {
  it("avanza 7, 14 o un mes", () => {
    expect(advanceNextRun("2026-11-25", "weekly")).toBe("2026-12-02")
    expect(advanceNextRun("2026-11-25", "biweekly")).toBe("2026-12-09")
    expect(advanceNextRun("2026-11-25", "monthly")).toBe("2026-12-25")
    expect(advanceNextRun("2026-12-28", "monthly")).toBe("2027-01-28")
  })

  it("tras correr tarde, salta al primer ciclo futuro sin ráfaga", () => {
    // Programado el lunes 23, el cron corre el miércoles 25:
    // el siguiente es el lunes 30, no otro pedido el 25.
    expect(nextRunAfterRun("2026-11-23", "weekly", "2026-11-25")).toBe("2026-11-30")
    expect(nextRunAfterRun("2026-11-25", "weekly", "2026-11-25")).toBe("2026-12-02")
  })
})

describe("validateRecurringItems", () => {
  it("sanea, fusiona duplicados con tope 99 y descarta basura", () => {
    const items = validateRecurringItems([
      { product_id: 10, variant_id: null, quantity: 2 },
      { product_id: 10, variant_id: null, quantity: 3 },
      { product_id: 10, variant_id: 5, quantity: 1 },
      { product_id: -1, quantity: 1 },
      { product_id: 12, quantity: 0 },
      { product_id: 13, quantity: 500 },
      "basura",
      null,
    ])
    expect(items).toEqual([
      { product_id: 10, variant_id: null, quantity: 5 },
      { product_id: 10, variant_id: 5, quantity: 1 },
      { product_id: 13, variant_id: null, quantity: 99 },
    ])
  })

  it("lo que no es arreglo es vacío", () => {
    expect(validateRecurringItems(undefined)).toEqual([])
    expect(validateRecurringItems({})).toEqual([])
  })
})

describe("validateRecurringTemplateInput", () => {
  it("acepta una semanal completa y normaliza", () => {
    const r = validateRecurringTemplateInput({
      name: "  Pedido semanal  ",
      items: [{ product_id: 1, quantity: 2 }],
      frequency: "weekly",
      weekday: 1,
      payment_method: "spei",
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.name).toBe("Pedido semanal")
      expect(r.value.weekday).toBe(1)
      expect(r.value.day_of_month).toBeNull()
    }
  })

  it("la mensual exige día 1–28 y la semanal día 0–6", () => {
    expect(
      validateRecurringTemplateInput({ items: [{ product_id: 1, quantity: 1 }], frequency: "monthly", day_of_month: 31 }).ok
    ).toBe(false)
    expect(
      validateRecurringTemplateInput({ items: [{ product_id: 1, quantity: 1 }], frequency: "weekly", weekday: 7 }).ok
    ).toBe(false)
  })

  it("sin artículos válidos no hay plantilla", () => {
    expect(
      validateRecurringTemplateInput({ items: [], frequency: "weekly", weekday: 1 }).ok
    ).toBe(false)
  })

  it("card no es método habitual: la recurrencia no cobra sola", () => {
    const r = validateRecurringTemplateInput({
      items: [{ product_id: 1, quantity: 1 }],
      frequency: "weekly",
      weekday: 1,
      payment_method: "card",
    })
    expect(r.ok).toBe(false)
  })
})

// ── Generación con fake por colas ───────────────────────────

type Row = { data: unknown; error: unknown }

function mockSupabase(queues: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: string; payload: unknown }> = []
  const supabase = {
    from(table: string) {
      const result: Row = queues[table]?.shift() ?? { data: null, error: null }
      const chain: Record<string, unknown> = {}
      const passthrough = () => chain
      for (const m of ["select", "eq", "in", "is", "order", "limit", "lte"]) {
        chain[m] = passthrough
      }
      for (const m of ["insert", "update", "delete"]) {
        chain[m] = (payload: unknown) => {
          writes.push({ table, op: m, payload })
          return chain
        }
      }
      chain.single = async () => result
      chain.maybeSingle = async () => result
      chain.then = (resolve: (v: Row) => void) => resolve(result)
      return chain
    },
  }
  return { supabase: supabase as never, writes }
}

const PROFILE = {
  data: { id: "user-1", full_name: "Restaurante Uno", phone: "5216140000000", default_city_id: 3 },
  error: null,
}
const ADDRESS = {
  data: [
    {
      id: 7,
      city_id: 3,
      is_default: true,
      last_used_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  error: null,
}
const STORE = { data: { id: 1 }, error: null }

function productRow(id: number, price: number) {
  return {
    id,
    name: `Producto ${id}`,
    price,
    sale_price: null,
    stock_status: "in_stock",
    stock_quantity: 100,
    is_visible: true,
  }
}

function template(items: unknown): RecurringOrderRow {
  return {
    id: "tpl-1",
    user_id: "user-1",
    name: "Pedido fijo",
    items: items as RecurringOrderRow["items"],
    frequency: "weekly",
    weekday: 3,
    day_of_month: null,
    address_id: null,
    payment_method: "cash_on_delivery",
    status: "active",
    next_run_on: "2026-11-25",
    last_run_on: null,
    last_order_id: null,
    last_result: null,
    created_by: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  }
}

describe("generateRecurringOrder", () => {
  it("crea el pedido con precios de la BD, source recurring y método habitual", async () => {
    const { supabase, writes } = mockSupabase({
      profiles: [PROFILE],
      addresses: [ADDRESS],
      products: [{ data: [productRow(10, 300)], error: null }],
      stores: [STORE],
      orders: [{ data: { id: 555, total: 600 }, error: null }],
      order_items: [{ data: null, error: null }],
    })

    const result = await generateRecurringOrder(
      supabase,
      template([{ product_id: 10, variant_id: null, quantity: 2 }]),
      "2026-11-25"
    )

    expect(result.kind).toBe("created")
    if (result.kind === "created") {
      expect(result.orderId).toBe(555)
      expect(result.subtotal).toBe(600)
    }
    const orderInsert = writes.find((w) => w.table === "orders" && w.op === "insert")
    expect(orderInsert).toBeDefined()
    const payload = orderInsert?.payload as Record<string, unknown>
    expect(payload.source).toBe("recurring")
    expect(payload.payment_method).toBe("cash_on_delivery")
    expect(payload.user_id).toBe("user-1")
    expect(payload.address_id).toBe(7)
    const itemInsert = writes.find((w) => w.table === "order_items" && w.op === "insert")
    const itemsPayload = itemInsert?.payload as Array<Record<string, unknown>>
    expect(itemsPayload[0]).toMatchObject({ product_id: 10, quantity: 2, unit_price: 300 })
    // Sin presentaciones en la plantilla, las claves de variante no viajan.
    expect(itemsPayload[0]).not.toHaveProperty("variant_id")
  })

  it("bajo el mínimo de $500 NO crea el pedido ni lo ajusta", async () => {
    const { supabase, writes } = mockSupabase({
      profiles: [PROFILE],
      addresses: [ADDRESS],
      products: [{ data: [productRow(10, 300)], error: null }],
    })

    const result = await generateRecurringOrder(
      supabase,
      template([{ product_id: 10, variant_id: null, quantity: 1 }]),
      "2026-11-25"
    )

    expect(result.kind).toBe("below_minimum")
    if (result.kind === "below_minimum") {
      expect(result.subtotal).toBe(300)
      expect(result.missingAmount).toBe(200)
    }
    expect(writes.find((w) => w.table === "orders")).toBeUndefined()
  })

  it("un producto que ya no se vende detiene el ciclo como invalid_items", async () => {
    const { supabase, writes } = mockSupabase({
      profiles: [PROFILE],
      addresses: [ADDRESS],
      products: [{ data: [{ ...productRow(10, 300), is_visible: false }], error: null }],
    })

    const result = await generateRecurringOrder(
      supabase,
      template([{ product_id: 10, variant_id: null, quantity: 2 }]),
      "2026-11-25"
    )

    expect(result.kind).toBe("invalid_items")
    expect(writes.find((w) => w.table === "orders")).toBeUndefined()
  })

  it("existencia insuficiente en la lectura temprana: insufficient_stock", async () => {
    const { supabase } = mockSupabase({
      profiles: [PROFILE],
      addresses: [ADDRESS],
      products: [
        { data: [{ ...productRow(10, 300), stock_quantity: 1 }], error: null },
      ],
    })

    const result = await generateRecurringOrder(
      supabase,
      template([{ product_id: 10, variant_id: null, quantity: 2 }]),
      "2026-11-25"
    )

    expect(result.kind).toBe("insufficient_stock")
  })
})

describe("runDueRecurringOrders", () => {
  it("sin la tabla responde available:false y no procesa nada", async () => {
    const { supabase } = mockSupabase({
      recurring_orders: [
        { data: null, error: { code: "42P01", message: "relation recurring_orders does not exist" } },
      ],
    })
    const summary = await runDueRecurringOrders(supabase, "2026-11-25")
    expect(summary.available).toBe(false)
    expect(summary.processed).toBe(0)
  })

  it("procesa la plantilla vencida, crea el pedido y avanza la fecha", async () => {
    const { supabase, writes } = mockSupabase({
      recurring_orders: [
        { data: [template([{ product_id: 10, variant_id: null, quantity: 2 }])], error: null },
        { data: null, error: null }, // el update final
      ],
      profiles: [PROFILE],
      addresses: [ADDRESS],
      products: [{ data: [productRow(10, 300)], error: null }],
      stores: [STORE],
      orders: [{ data: { id: 556, total: 600 }, error: null }],
      order_items: [{ data: null, error: null }],
    })

    const summary = await runDueRecurringOrders(supabase, "2026-11-25")
    expect(summary).toMatchObject({ available: true, processed: 1, created: 1 })

    const advance = writes.find((w) => w.table === "recurring_orders" && w.op === "update")
    expect(advance).toBeDefined()
    const payload = advance?.payload as Record<string, unknown>
    expect(payload.last_result).toBe("created")
    expect(payload.last_order_id).toBe(556)
    expect(payload.next_run_on).toBe("2026-12-02")
  })
})
