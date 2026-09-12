import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return {
    ...actual,
    after: (fn: () => void) => fn(),
  }
})
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/repurchase-coupon", () => ({
  issuePersonalCoupon: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/workflows", () => ({
  runNewOrderWorkflows: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn().mockResolvedValue({ allowed: true }),
  clientIp: vi.fn(() => "127.0.0.1"),
  rateLimitResponse: vi.fn(),
}))
vi.mock("@/lib/orders-address", () => ({
  insertAddressResilient: vi.fn().mockResolvedValue({ data: { id: 5 }, error: null }),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { NextRequest } from "next/server"
import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"

interface TableResult {
  data?: unknown
  error?: unknown
}

/**
 * Builder PostgREST chainable y "awaitable": todos los métodos devuelven el
 * mismo builder; la resolución configurada se usa tanto al awaitar la cadena
 * como en single/maybeSingle.
 */
function tableBuilder(result: TableResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "in", "is", "not", "update", "insert", "order", "limit", "ilike"]) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  builder.single = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder as Record<string, ReturnType<typeof vi.fn>> & {
    single: ReturnType<typeof vi.fn>
    maybeSingle: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
  }
}

function mockSupabase(tables: Record<string, ReturnType<typeof tableBuilder>>) {
  const from = vi.fn((table: string) => tables[table] ?? tableBuilder())
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return from
}

function orderReq(body: unknown) {
  return new NextRequest("https://resurte.me/api/orders", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const validBody = {
  city_id: 1,
  address: {
    label: "Casa",
    street: "Av. Siempre Viva",
    number: "123",
    interior: "",
    neighborhood: "Centro",
    zip_code: "76000",
    references: "",
  },
  schedule: { date: "2026-09-13", time: "10:00 AM - 12:00 PM" },
  payment_method: "cash_on_delivery",
  subtotal: 100,
  delivery_fee: 0,
  total: 100,
  items: [{ product_id: 1, quantity: 1, unit_price: 100, name: "Producto" }],
}

function mockValidOrderFlow() {
  return mockSupabase({
    products: tableBuilder({
      data: [{ id: 1, price: 100, sale_price: null, stock_status: "in_stock" }],
      error: null,
    }),
    stores: tableBuilder({ data: { id: 1 }, error: null }),
    cities: tableBuilder({ data: { name: "Querétaro", state: "Querétaro" }, error: null }),
    addresses: tableBuilder({ data: null, error: null }),
    orders: tableBuilder({
      data: { id: 7, cashback_credits: 5, cashback_tier: "Verde", total: 100, restore_token: "tok" },
      error: null,
    }),
    order_items: tableBuilder({ data: null, error: null }),
  })
}

describe("/api/orders validación zod", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("un body válido pasa la validación y crea el pedido", async () => {
    const from = mockValidOrderFlow()

    const res = await POST(orderReq(validBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orderId).toBe(7)
    expect(from).toHaveBeenCalledWith("orders")
  })

  it("rechaza 400 con field errors cuando faltan campos requeridos", async () => {
    const { items: _items, ...sinItems } = validBody
    const res = await POST(orderReq(sinItems))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.fields.items).toBeDefined()
    // La validación falla antes de tocar la BD.
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza 400 un item con quantity inválida", async () => {
    const res = await POST(
      orderReq({
        ...validBody,
        items: [{ product_id: 1, quantity: 0, unit_price: 100, name: "Producto" }],
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.fields["items.0.quantity"]).toBeDefined()
  })

  it("rechaza 400 un item_type fuera del enum", async () => {
    const res = await POST(
      orderReq({
        ...validBody,
        items: [{ product_id: 1, quantity: 1, unit_price: 100, name: "Producto", item_type: "gratis" }],
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.fields["items.0.item_type"]).toBeDefined()
  })

  it("rechaza 400 cuando address no es un objeto válido", async () => {
    const res = await POST(orderReq({ ...validBody, address: { street: "x" } }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.fields["address.neighborhood"]).toBeDefined()
  })
})
