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
import { createClient } from "@/lib/supabase/server"
import { issuePersonalCoupon } from "@/lib/repurchase-coupon"
import { logger } from "@/lib/logger"

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

/** Flujo válido parametrizable: igual que mockValidOrderFlow pero admite overrides por tabla. */
function mockFlow(extra: Record<string, ReturnType<typeof tableBuilder>> = {}) {
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
    ...extra,
  })
}

/** Simula una sesión activa para esta llamada (createClient viene del mock global con user null). */
function mockSessionUser(id: string) {
  vi.mocked(createClient).mockResolvedValueOnce({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id } } })) },
  } as never)
}

describe("/api/orders POST sesión, cupón y fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("checkout anónimo: devuelve trackingToken, guestToken y repurchaseCoupon null", async () => {
    mockFlow()

    const res = await POST(orderReq(validBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orderId).toBe(7)
    expect(body.trackingToken).toBe("tok") // restore_token del pedido
    expect(typeof body.guestToken).toBe("string") // token de checkout anónimo generado
    expect(body.repurchaseCoupon).toBeNull()
    // El cupón de recompra es solo para usuarios logueados
    expect(issuePersonalCoupon).not.toHaveBeenCalled()
  })

  it("checkout con sesión: emite cupón de recompra y no genera guestToken", async () => {
    mockSessionUser("user-1")
    const issued = { code: "RECOMPRA-ABC", discount_type: "percentage", discount_value: 15 }
    vi.mocked(issuePersonalCoupon).mockResolvedValueOnce(issued as never)
    const from = mockFlow()

    const res = await POST(orderReq(validBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.trackingToken).toBe("tok")
    expect(body.guestToken).toBeNull()
    expect(body.repurchaseCoupon).toEqual(issued)
    expect(issuePersonalCoupon).toHaveBeenCalledWith(expect.anything(), "user-1", "post_purchase")
    // El pedido queda vinculado al usuario autenticado
    const ordersBuilder = from("orders")
    expect(ordersBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-1" }))
  })

  it("fallback 42703: reintenta el insert de orders sin columnas utm_*", async () => {
    const orders = tableBuilder()
    orders.single
      .mockResolvedValueOnce({
        data: null,
        error: { message: "column orders.utm_source does not exist", code: "42703" },
      })
      .mockResolvedValueOnce({
        data: { id: 7, cashback_credits: 5, cashback_tier: "Verde", total: 100, restore_token: "tok" },
        error: null,
      })
    mockFlow({ orders })

    const res = await POST(orderReq({ ...validBody, utm: { utm_source: "facebook" } }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orderId).toBe(7)
    expect(body.trackingToken).toBe("tok")
    // Primer intento con utm_source; reintento sin atribución UTM
    expect(orders.insert).toHaveBeenCalledTimes(2)
    expect(orders.insert.mock.calls[0]![0]).toMatchObject({ utm_source: "facebook" })
    expect(orders.insert.mock.calls[1]![0]).not.toHaveProperty("utm_source")
    expect(logger.warn).toHaveBeenCalledWith("orders.utm_* no existe; insertando sin atribución UTM")
  })

  it("aplica cupón porcentual y recalcula el total con descuento + envío", async () => {
    const couponRow = {
      id: 1,
      code: "DIEZ",
      discount_type: "percentage",
      discount_value: 10,
      min_order: 0,
      max_uses: 0,
      used_count: 0,
      expires_at: null,
      user_id: null,
    }
    const coupons = tableBuilder({ data: couponRow, error: null })
    // La reserva del cupón (update().eq().eq().select("id") awaitado) resuelve vía `then`:
    // debe devolver una fila para que la reserva se considere exitosa.
    coupons.then = (resolve: (v: unknown) => void) => resolve({ data: [{ id: 1 }], error: null })
    const orders = tableBuilder({
      data: { id: 7, cashback_credits: 5, cashback_tier: "Verde", total: 125, restore_token: "tok" },
      error: null,
    })
    mockFlow({ coupons, orders })

    // subtotal 100 − 10% = 90 + envío 35 = 125
    const res = await POST(
      orderReq({ ...validBody, coupon_code: "diez", delivery_fee: 35, total: 125 })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(125)
    expect(body.trackingToken).toBe("tok")
    // El descuento y el código real del cupón se persisten en la orden
    expect(orders.insert).toHaveBeenCalledWith(
      expect.objectContaining({ discount: 10, coupon_code: "DIEZ", subtotal: 100, delivery_fee: 35, total: 125 })
    )
    // El uso del cupón se reservó (used_count + 1 condicional)
    expect(coupons.update).toHaveBeenCalledWith({ used_count: 1 })
  })

  it("rechaza 400 un cupón que no existe", async () => {
    mockFlow({ coupons: tableBuilder({ data: null, error: null }) })

    const res = await POST(orderReq({ ...validBody, coupon_code: "FALSO" }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("cupón")
  })
})
