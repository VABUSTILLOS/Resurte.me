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
  for (const method of ["select", "eq", "in", "is", "not", "update", "insert", "delete", "order", "limit", "ilike"]) {
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

function mockSupabase(
  tables: Record<string, ReturnType<typeof tableBuilder>>,
  rpcImpl?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
) {
  const from = vi.fn((table: string) => tables[table] ?? tableBuilder())
  // RPC de inventario (migración 00143): por defecto reserva/libera con éxito.
  const rpc = vi.fn(
    rpcImpl ?? (async () => ({ data: { ok: true, reason: "reserved" }, error: null }))
  )
  vi.mocked(createServiceClient).mockResolvedValue({ from, rpc } as never)
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
      data: [{ id: 1, price: 100, sale_price: null, stock_status: "in_stock", stock_quantity: 10 }],
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
function mockFlow(
  extra: Record<string, ReturnType<typeof tableBuilder>> = {},
  rpcImpl?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
) {
  return mockSupabase({
    products: tableBuilder({
      data: [{ id: 1, price: 100, sale_price: null, stock_status: "in_stock", stock_quantity: 10 }],
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
  }, rpcImpl)
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
    expect(logger.warn).toHaveBeenCalledWith(
      "orders.utm_source no existe; insertando el pedido sin esa columna"
    )
  })

  it("fallback 42703: el cupón se aplica aunque coupon_code falte en el esquema", async () => {
    // Regresión: antes el insert fallaba en 500 y el cliente perdía el pedido.
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
    coupons.then = ((resolve: (v: unknown) => void) =>
      resolve({ data: [{ id: 1 }], error: null })) as unknown as (typeof coupons)["then"]
    const orders = tableBuilder()
    orders.single
      .mockResolvedValueOnce({
        data: null,
        error: { message: "column orders.coupon_code does not exist", code: "42703" },
      })
      .mockResolvedValueOnce({
        data: { id: 7, cashback_credits: 5, cashback_tier: "Verde", total: 215, restore_token: "tok" },
        error: null,
      })
    mockFlow({ coupons, orders })

    const res = await POST(orderReq({ ...validBody, coupon_code: "DIEZ", delivery_fee: 125, total: 215 }))

    expect(res.status).toBe(200)
    expect(orders.insert).toHaveBeenCalledTimes(2)
    expect(orders.insert.mock.calls[0]![0]).toHaveProperty("coupon_code", "DIEZ")
    expect(orders.insert.mock.calls[1]![0]).not.toHaveProperty("coupon_code")
    // El descuento se conserva: solo se descarta la columna ausente.
    expect(orders.insert.mock.calls[1]![0]).toHaveProperty("discount", 10)
    expect(logger.warn).toHaveBeenCalledWith(
      "orders.coupon_code no existe; insertando el pedido sin esa columna"
    )
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
    coupons.then = ((resolve: (v: unknown) => void) =>
      resolve({ data: [{ id: 1 }], error: null })) as unknown as (typeof coupons)["then"]
    const orders = tableBuilder({
      data: { id: 7, cashback_credits: 5, cashback_tier: "Verde", total: 215, restore_token: "tok" },
      error: null,
    })
    mockFlow({ coupons, orders })

    // subtotal 100 − 10% = 90 + envío 125 = 215
    const res = await POST(
      orderReq({ ...validBody, coupon_code: "diez", delivery_fee: 125, total: 215 })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(215)
    expect(body.trackingToken).toBe("tok")
    // El descuento y el código real del cupón se persisten en la orden
    expect(orders.insert).toHaveBeenCalledWith(
      expect.objectContaining({ discount: 10, coupon_code: "DIEZ", subtotal: 100, delivery_fee: 125, total: 215 })
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

  it("aplica un cupón de envío gratis: descuento 0 y envío 0", async () => {
    const couponRow = {
      id: 1,
      code: "GRATIS",
      discount_type: "free_shipping",
      discount_value: 0,
      min_order: 0,
      max_uses: 10,
      used_count: 3,
      expires_at: null,
      user_id: null,
    }
    const coupons = tableBuilder({ data: couponRow, error: null })
    coupons.then = ((resolve: (v: unknown) => void) =>
      resolve({ data: [{ id: 1 }], error: null })) as unknown as (typeof coupons)["then"]
    const orders = tableBuilder({
      data: { id: 7, cashback_credits: 0, cashback_tier: null, total: 100, restore_token: "tok" },
      error: null,
    })
    mockFlow({ coupons, orders })

    // subtotal 100, envío solicitado 125 → el cupón lo regala: total 100.
    const res = await POST(
      orderReq({ ...validBody, coupon_code: "gratis", delivery_fee: 125, total: 100 })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(100)
    expect(orders.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        discount: 0,
        coupon_code: "GRATIS",
        subtotal: 100,
        delivery_fee: 0,
        total: 100,
      })
    )
  })
})

describe("/api/orders prioridad por transferencia (migración 00220)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("marca prioritario el pedido pagado por SPEI", async () => {
    // La marca la deriva el SERVIDOR del método de pago: es el respaldo real
    // del incentivo "desbloquea envío prioritario al pagar con transferencia".
    const orders = tableBuilder({
      data: { id: 7, cashback_credits: 0, cashback_tier: null, total: 100, restore_token: "tok" },
      error: null,
    })
    mockFlow({ orders })

    const res = await POST(orderReq({ ...validBody, payment_method: "spei" }))

    expect(res.status).toBe(200)
    expect(orders.insert).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: "spei", priority: true })
    )
  })

  it("no marca prioritario un pedido con tarjeta", async () => {
    const orders = tableBuilder({
      data: { id: 7, cashback_credits: 0, cashback_tier: null, total: 100, restore_token: "tok" },
      error: null,
    })
    mockFlow({ orders })

    const res = await POST(orderReq({ ...validBody, payment_method: "card" }))

    expect(res.status).toBe(200)
    expect(orders.insert).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: "card", priority: false })
    )
  })

  it("42703: crea el pedido sin la marca si la columna aún no existe", async () => {
    // Desplegar código antes que esquema no puede tumbar el checkout.
    const orders = tableBuilder()
    orders.single
      .mockResolvedValueOnce({
        data: null,
        error: { message: "column orders.priority does not exist", code: "42703" },
      })
      .mockResolvedValueOnce({
        data: { id: 7, cashback_credits: 0, cashback_tier: null, total: 100, restore_token: "tok" },
        error: null,
      })
    mockFlow({ orders })

    const res = await POST(orderReq({ ...validBody, payment_method: "spei" }))

    expect(res.status).toBe(200)
    expect(orders.insert).toHaveBeenCalledTimes(2)
    expect(orders.insert.mock.calls[0]![0]).toHaveProperty("priority", true)
    expect(orders.insert.mock.calls[1]![0]).not.toHaveProperty("priority")
    expect(logger.warn).toHaveBeenCalledWith(
      "orders.priority no existe; insertando el pedido sin esa columna"
    )
  })
})

describe("/api/orders inventario (migración 00143)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reserva el inventario del pedido recién creado", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    mockFlow({}, async (fn, args) => {
      calls.push({ fn, args })
      return { data: { ok: true, reason: "reserved" }, error: null }
    })

    const res = await POST(orderReq(validBody))

    expect(res.status).toBe(200)
    expect(calls).toEqual([{ fn: "reserve_order_stock", args: { p_order_id: 7 } }])
  })

  it("rechaza 409 y revierte el pedido cuando la RPC reporta existencia insuficiente", async () => {
    const orders = tableBuilder({
      data: { id: 7, cashback_credits: 5, cashback_tier: "Verde", total: 100, restore_token: "tok" },
      error: null,
    })
    mockFlow({ orders }, async () => ({
      data: {
        ok: false,
        reason: "insufficient_stock",
        conflicts: [{ product_id: 1, requested: 4, available: 1 }],
      },
      error: null,
    }))

    const res = await POST(
      orderReq({
        ...validBody,
        subtotal: 400,
        total: 400,
        items: [{ product_id: 1, quantity: 4, unit_price: 100, name: "Jitomate" }],
      })
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe("insufficient_stock")
    // El mensaje usa el nombre del carrito, no el id.
    expect(body.error).toContain("Jitomate")
    expect(body.error).toContain("pediste 4")
    expect(body.conflicts).toHaveLength(1)
    // El pedido recién creado se borra (el cascade se lleva sus items).
    expect(orders.delete).toHaveBeenCalled()
  })

  it("no tumba el checkout si la RPC de inventario no está desplegada", async () => {
    mockFlow({}, async () => ({
      data: null,
      error: { message: "function public.reserve_order_stock(bigint) does not exist", code: "42883" },
    }))

    const res = await POST(orderReq(validBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orderId).toBe(7)
    expect(logger.error).toHaveBeenCalled()
  })

  it("rechaza 409 sin crear pedido cuando el carrito pide más de lo disponible", async () => {
    const from = mockFlow({
      products: tableBuilder({
        data: [{ id: 1, price: 100, sale_price: null, stock_status: "in_stock", stock_quantity: 2 }],
        error: null,
      }),
    })

    const res = await POST(
      orderReq({ ...validBody, items: [{ product_id: 1, quantity: 5, unit_price: 100, name: "Jitomate" }] })
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe("insufficient_stock")
    expect(body.error).toContain("pediste 5")
    expect(body.error).toContain("hay 2")
    // El rechazo ocurre antes de tocar `orders`.
    expect(from).not.toHaveBeenCalledWith("orders")
  })

  it("no bloquea productos sin control de inventario (stock_quantity null)", async () => {
    mockFlow({
      products: tableBuilder({
        data: [{ id: 1, price: 100, sale_price: null, stock_status: "in_stock", stock_quantity: null }],
        error: null,
      }),
    })

    const res = await POST(
      orderReq({
        ...validBody,
        subtotal: 9900,
        total: 9900,
        items: [{ product_id: 1, quantity: 99, unit_price: 100, name: "Servilletas" }],
      })
    )

    expect(res.status).toBe(200)
  })
})

/** Productos cuyo read de límites (00229) devuelve min/max configurados. */
function productsWithLimits(min: number | null, max: number | null) {
  const main = {
    data: [{ id: 1, price: 100, sale_price: null, stock_status: "in_stock", stock_quantity: 50 }],
    error: null,
  }
  const limits = { data: [{ id: 1, min_order_qty: min, max_order_qty: max }], error: null }
  const b = tableBuilder(main)
  let current: typeof main | typeof limits = main
  b.select = vi.fn((cols: unknown) => {
    current = typeof cols === "string" && cols.includes("min_order_qty") ? limits : main
    return b
  }) as unknown as ReturnType<typeof vi.fn>
  b.then = ((resolve: (v: unknown) => void) =>
    resolve(current)) as unknown as ReturnType<typeof vi.fn>
  return b
}

describe("/api/orders cantidad mínima/máxima por producto (migración 00229)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rechaza 400 cuando la cantidad queda bajo el mínimo del producto", async () => {
    const from = mockFlow({ products: productsWithLimits(5, null) })

    const res = await POST(
      orderReq({
        ...validBody,
        subtotal: 200,
        total: 200,
        items: [{ product_id: 1, quantity: 2, unit_price: 100, name: "Arroz 1 kg" }],
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("quantity_limit")
    expect(body.error).toContain("Arroz 1 kg")
    expect(body.error).toContain("mínimo por pedido es 5")
    expect(body.violations).toHaveLength(1)
    // El rechazo ocurre antes de crear el pedido.
    expect(from).not.toHaveBeenCalledWith("orders")
  })

  it("rechaza 400 cuando la cantidad supera el máximo del producto", async () => {
    mockFlow({ products: productsWithLimits(null, 3) })

    const res = await POST(
      orderReq({
        ...validBody,
        subtotal: 400,
        total: 400,
        items: [{ product_id: 1, quantity: 4, unit_price: 100, name: "Arroz 1 kg" }],
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("quantity_limit")
    expect(body.error).toContain("máximo por pedido es 3")
  })

  it("acepta una cantidad exactamente en el mínimo", async () => {
    mockFlow({ products: productsWithLimits(5, null) })

    const res = await POST(
      orderReq({
        ...validBody,
        subtotal: 500,
        total: 500,
        items: [{ product_id: 1, quantity: 5, unit_price: 100, name: "Arroz 1 kg" }],
      })
    )

    expect(res.status).toBe(200)
  })

  it("sin la migración (la lectura de límites no trae columnas) vende como antes", async () => {
    // El builder estándar devuelve las filas de precios para cualquier
    // select: sin min_order_qty/max_order_qty no hay límites que forzar.
    mockFlow()

    const res = await POST(orderReq(validBody))

    expect(res.status).toBe(200)
  })
})

describe("/api/orders descuentos automáticos (migración 00231)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const bundleRule = {
    id: "rule-1",
    name: "Paquete: 2 piezas -$30",
    rule_type: "bundle",
    is_active: true,
    config: {
      items: [{ product_id: 1, qty: 2 }],
      discount_type: "fixed_amount",
      discount_value: 30,
    },
  }

  it("aplica el descuento automático recalculado en servidor y lo persiste", async () => {
    const orders = tableBuilder({
      data: { id: 7, cashback_credits: 0, cashback_tier: null, total: 295, restore_token: "tok" },
      error: null,
    })
    mockFlow({
      orders,
      automatic_discount_rules: tableBuilder({ data: [bundleRule], error: null }),
    })

    // 2 × $100 = $200 − $30 automático = $170 + envío $125 = $295.
    const res = await POST(
      orderReq({
        ...validBody,
        subtotal: 200,
        delivery_fee: 125,
        total: 295,
        items: [{ product_id: 1, quantity: 2, unit_price: 100, name: "Arroz 1 kg" }],
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(295)
    expect(body.automaticDiscount.amount).toBe(30)
    expect(body.automaticDiscount.applied).toHaveLength(1)
    expect(orders.insert).toHaveBeenCalledWith(
      expect.objectContaining({ discount: 30, subtotal: 200, delivery_fee: 125, total: 295 })
    )
  })

  it("rechaza el pedido si el cliente NO incluyó el descuento automático en su total", async () => {
    // El servidor otorga el descuento siempre que la regla aplica: un
    // total «sin descuento» no coincide con el recalculado y se rechaza
    // (nunca se confía en el total del cliente).
    mockFlow({
      automatic_discount_rules: tableBuilder({ data: [bundleRule], error: null }),
    })

    const res = await POST(
      orderReq({
        ...validBody,
        subtotal: 200,
        delivery_fee: 125,
        total: 325,
        items: [{ product_id: 1, quantity: 2, unit_price: 100, name: "Arroz 1 kg" }],
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("total no coincide")
  })

  it("sin reglas activas el total es el de siempre", async () => {
    mockFlow({
      automatic_discount_rules: tableBuilder({ data: [], error: null }),
    })

    const res = await POST(orderReq(validBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.automaticDiscount.amount).toBe(0)
  })
})

describe("/api/orders presentaciones (00232)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const variantRow = {
    id: 50,
    product_id: 1,
    name: "Bolsa 5 kg",
    price: 80,
    sale_price: null,
    stock_status: "in_stock",
    stock_quantity: 5,
    is_active: true,
  }

  it("cobra el precio de la variante y la guarda en la línea", async () => {
    const orderItems = tableBuilder({ data: null, error: null })
    mockFlow({
      product_variants: tableBuilder({ data: [variantRow], error: null }),
      order_items: orderItems,
    })

    const res = await POST(
      orderReq({
        ...validBody,
        subtotal: 80,
        total: 80,
        items: [
          {
            product_id: 1,
            quantity: 1,
            unit_price: 100,
            name: "Producto (Bolsa 5 kg)",
            variant_id: 50,
          },
        ],
      })
    )

    expect(res.status).toBe(200)
    const inserted = orderItems.insert.mock.calls[0]?.[0] as Array<Record<string, unknown>>
    expect(inserted[0]).toMatchObject({
      product_id: 1,
      unit_price: 80,
      variant_id: 50,
      variant_label: "Bolsa 5 kg",
    })
  })

  it("un producto con presentaciones no se vende sin elegir una", async () => {
    mockFlow({
      product_variants: tableBuilder({ data: [variantRow], error: null }),
    })

    const res = await POST(orderReq(validBody))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("variant_required")
  })

  it("una variante de otro producto se rechaza", async () => {
    mockFlow({
      product_variants: tableBuilder({
        data: [{ ...variantRow, product_id: 2 }],
        error: null,
      }),
    })

    const res = await POST(
      orderReq({
        ...validBody,
        items: [
          { product_id: 1, quantity: 1, unit_price: 100, name: "Producto", variant_id: 50 },
        ],
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("ya no está disponible")
  })

  it("la existencia que manda es la de la variante, no la del producto", async () => {
    mockFlow({
      product_variants: tableBuilder({
        data: [{ ...variantRow, stock_quantity: 1 }],
        error: null,
      }),
    })

    const res = await POST(
      orderReq({
        ...validBody,
        subtotal: 160,
        total: 160,
        items: [
          { product_id: 1, quantity: 2, unit_price: 80, name: "Producto (Bolsa 5 kg)", variant_id: 50 },
        ],
      })
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe("insufficient_stock")
  })
})
