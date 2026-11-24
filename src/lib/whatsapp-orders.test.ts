import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/catalog-cache", () => ({
  getCachedVisibleProducts: vi.fn(),
  getCachedCategories: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import {
  captureWhatsAppOrderAddress,
  createWhatsAppOrder,
  parseWhatsAppAddressText,
} from "@/lib/whatsapp-orders"
import { getCachedCategories, getCachedVisibleProducts } from "@/lib/catalog-cache"
import type { createServiceClient } from "@/lib/supabase/service"
import type { Category, Product } from "@/types"

/**
 * Creación de pedidos de WhatsApp con Supabase mockeado.
 *
 * Lo que estas pruebas protegen:
 *   · Que el pedido nazca con el contrato del checkout web (source
 *     "whatsapp", precios de BD, envío de validDeliveryFee, reserva
 *     de stock por RPC) y ligado al wamid en whatsapp_messages.
 *   · La idempotencia: un reintento de Meta no crea un segundo pedido.
 *   · Las decisiones de producto: método contra entrega por defecto
 *     y NO crear por debajo del mínimo de $500.
 *   · Que un faltante de stock revierta el pedido, como en la web.
 */

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

const CATEGORIES: Category[] = [
  { id: 1, name: "Abarrotes", slug: "abarrotes", icon: "", parent_id: null },
]

function product(partial: Partial<Product> & { id: number; slug: string }): Product {
  return {
    name: partial.slug,
    description: "",
    image_url: "",
    brand: "",
    category_id: 1,
    price: 100,
    sale_price: null,
    stock_status: "in_stock",
    show_in_whatsapp: true,
    whatsapp_product_id: null,
    ...partial,
  }
}

const CURCUMA = product({ id: 101, slug: "curcuma", name: "Cúrcuma", price: 203 })
const PRODUCTS = [CURCUMA]

const DB_CURCUMA = {
  id: 101,
  price: 203,
  sale_price: null,
  stock_status: "in_stock",
  stock_quantity: 50,
}

interface Row {
  data?: unknown
  error?: { code?: string; message?: string } | null
}

interface RecordedCall {
  table: string
  op: "insert" | "update" | "delete"
  payload?: unknown
}

/**
 * Cliente Supabase falso: cada `from(tabla)` consume el siguiente
 * resultado encolado para esa tabla (las cadenas se resuelven igual
 * al awaitarlas que con single/maybeSingle) y registra los inserts,
 * updates y deletes para poder afirmarlos.
 */
function mockSupabase(queues: Record<string, Row[]>, rpcResult: Row = { data: { ok: true, reason: "reserved" }, error: null }) {
  const calls: RecordedCall[] = []
  const client = {
    from: vi.fn((table: string) => {
      const result: Row = queues[table]?.shift() ?? { data: null, error: null }
      const b: Record<string, unknown> = {}
      for (const m of ["select", "eq", "ilike", "in", "is", "not", "order", "limit", "gte", "neq"]) {
        b[m] = vi.fn(() => b)
      }
      b.insert = vi.fn((payload: unknown) => {
        calls.push({ table, op: "insert", payload })
        return b
      })
      b.update = vi.fn((payload: unknown) => {
        calls.push({ table, op: "update", payload })
        return b
      })
      b.delete = vi.fn(() => {
        calls.push({ table, op: "delete" })
        return b
      })
      b.maybeSingle = vi.fn(() => Promise.resolve(result))
      b.single = vi.fn(() => Promise.resolve(result))
      b.then = (resolve: (v: Row) => void) => resolve(result)
      return b
    }),
    rpc: vi.fn(async () => rpcResult),
  }
  return { client: client as unknown as ServiceClient, calls, rpc: client.rpc }
}

/** Colas del camino feliz; cada prueba muta lo que necesita. */
function happyQueues(): Record<string, Row[]> {
  return {
    whatsapp_messages: [
      { data: [], error: null }, // dedupe: sin pedido previo
      { data: null, error: null }, // update que liga el order_id
    ],
    products: [{ data: [DB_CURCUMA], error: null }],
    profiles: [{ data: [{ id: "user-1", full_name: "Ana", phone: "6141047021" }], error: null }],
    stores: [{ data: { id: 1 }, error: null }],
    store_cities: [{ data: { city_id: 7 }, error: null }],
    orders: [{ data: { id: 555, total: 609 }, error: null }],
    order_items: [{ data: null, error: null }],
  }
}

const FROM = "5216141261296"
const THREE_CURCUMA = [{ product_retailer_id: "abarrotes-curcuma", quantity: 3, item_price: 1 }]

beforeEach(() => {
  vi.mocked(getCachedVisibleProducts).mockResolvedValue(PRODUCTS)
  vi.mocked(getCachedCategories).mockResolvedValue(CATEGORIES)
})

describe("createWhatsAppOrder", () => {
  it("crea el pedido con perfil, precios de BD y el contrato del checkout", async () => {
    const { client, calls, rpc } = mockSupabase(happyQueues())

    const result = await createWhatsAppOrder(client, {
      from: FROM,
      waMessageId: "wamid.1",
      productItems: THREE_CURCUMA,
    })

    // 3 × $203 de la BD = $609 (el item_price de $1 de Meta se ignora);
    // ≥ $500 → envío gratis.
    expect(result).toEqual({
      kind: "created",
      orderId: 555,
      subtotal: 609,
      deliveryFee: 0,
      total: 609,
      unresolved: [],
    })

    const orderInsert = calls.find((c) => c.table === "orders" && c.op === "insert")
    expect(orderInsert?.payload).toMatchObject({
      user_id: "user-1",
      city_id: 7,
      store_id: 1,
      address_id: null,
      status: "pending",
      payment_status: "pending",
      payment_method: "cash_on_delivery",
      priority: false,
      scheduled_for: null,
      source: "whatsapp",
      customer_phone: FROM,
      subtotal: 609,
      delivery_fee: 0,
      total: 609,
    })

    const itemsInsert = calls.find((c) => c.table === "order_items" && c.op === "insert")
    expect(itemsInsert?.payload).toEqual([
      { order_id: 555, product_id: 101, quantity: 3, unit_price: 203, item_type: "standard" },
    ])

    expect(rpc).toHaveBeenCalledWith("reserve_order_stock", { p_order_id: 555 })

    const link = calls.find((c) => c.table === "whatsapp_messages" && c.op === "update")
    expect(link?.payload).toEqual({ order_id: 555 })
  })

  it("crea como invitado cuando el teléfono no mapea a un perfil", async () => {
    const queues = happyQueues()
    queues.profiles = [{ data: [], error: null }]
    const { client, calls } = mockSupabase(queues)

    const result = await createWhatsAppOrder(client, {
      from: FROM,
      waMessageId: "wamid.2",
      productItems: THREE_CURCUMA,
    })

    expect(result.kind).toBe("created")
    const orderInsert = calls.find((c) => c.table === "orders" && c.op === "insert")
    expect(orderInsert?.payload).toMatchObject({ user_id: null })
  })

  it("un reintento de Meta (mismo wamid) no crea un segundo pedido", async () => {
    const queues = happyQueues()
    queues.whatsapp_messages = [{ data: [{ id: 9, order_id: 777 }], error: null }]
    const { client, calls, rpc } = mockSupabase(queues)

    const result = await createWhatsAppOrder(client, {
      from: FROM,
      waMessageId: "wamid.1",
      productItems: THREE_CURCUMA,
    })

    expect(result).toEqual({ kind: "duplicate", orderId: 777 })
    expect(calls.some((c) => c.table === "orders" && c.op === "insert")).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("por debajo del mínimo de $500 NO crea el pedido y dice cuánto falta", async () => {
    const { client, calls } = mockSupabase(happyQueues())

    const result = await createWhatsAppOrder(client, {
      from: FROM,
      waMessageId: "wamid.3",
      productItems: [{ product_retailer_id: "abarrotes-curcuma", quantity: 1 }],
    })

    expect(result).toEqual({
      kind: "below_minimum",
      subtotal: 203,
      minimum: 500,
      missingAmount: 297,
      unresolved: [],
    })
    expect(calls.some((c) => c.table === "orders" && c.op === "insert")).toBe(false)
  })

  it("sin ítems resolubles no crea nada (los 7 sin página no tumban el flujo)", async () => {
    const { client, calls } = mockSupabase(happyQueues())

    const result = await createWhatsAppOrder(client, {
      from: FROM,
      waMessageId: "wamid.4",
      productItems: [{ product_retailer_id: "frutas-y-verduras-aguacate-hass", quantity: 2 }],
    })

    expect(result.kind).toBe("no_resolvable_items")
    if (result.kind === "no_resolvable_items") {
      expect(result.unresolved).toEqual([
        { retailer_id: "frutas-y-verduras-aguacate-hass", name: null, reason: "unknown" },
      ])
    }
    expect(calls.some((c) => c.table === "orders" && c.op === "insert")).toBe(false)
  })

  it("tolera ítems irresolubles y crea el pedido con los que sí resuelven", async () => {
    const { client } = mockSupabase(happyQueues())

    const result = await createWhatsAppOrder(client, {
      from: FROM,
      waMessageId: "wamid.5",
      productItems: [
        ...THREE_CURCUMA,
        { product_retailer_id: "frutas-y-verduras-aguacate-hass", quantity: 1 },
      ],
    })

    expect(result.kind).toBe("created")
    if (result.kind === "created") {
      expect(result.unresolved).toEqual([
        { retailer_id: "frutas-y-verduras-aguacate-hass", name: null, reason: "unknown" },
      ])
    }
  })

  it("si la RPC reporta existencia insuficiente, revierte el pedido", async () => {
    const queues = happyQueues()
    queues.products = [{ data: [{ ...DB_CURCUMA, stock_quantity: null }], error: null }]
    queues.orders = [
      { data: { id: 555, total: 609 }, error: null }, // insert
      { data: null, error: null }, // delete (rollback)
    ]
    const { client, calls } = mockSupabase(queues, {
      data: {
        ok: false,
        reason: "insufficient_stock",
        conflicts: [{ product_id: 101, requested: 3, available: 1 }],
      },
      error: null,
    })

    const result = await createWhatsAppOrder(client, {
      from: FROM,
      waMessageId: "wamid.6",
      productItems: THREE_CURCUMA,
    })

    expect(result.kind).toBe("insufficient_stock")
    if (result.kind === "insufficient_stock") {
      expect(result.detail).toContain("Cúrcuma")
    }
    expect(calls.some((c) => c.table === "orders" && c.op === "delete")).toBe(true)
  })

  it("usa la ciudad del catálogo cuando el catalog_id es una fila de whatsapp_catalogs", async () => {
    const queues = happyQueues()
    queues.whatsapp_catalogs = [{ data: { city_id: 42 }, error: null }]
    const { client, calls } = mockSupabase(queues)

    const result = await createWhatsAppOrder(client, {
      from: FROM,
      waMessageId: "wamid.7",
      catalogId: "999888777",
      productItems: THREE_CURCUMA,
    })

    expect(result.kind).toBe("created")
    const orderInsert = calls.find((c) => c.table === "orders" && c.op === "insert")
    expect(orderInsert?.payload).toMatchObject({ city_id: 42 })
  })
})

describe("parseWhatsAppAddressText", () => {
  it("extrae calle, número, colonia y CP de una dirección típica", () => {
    const parsed = parseWhatsAppAddressText(
      "Calle Roble 123, Col. Centro, CP 31000, casa blanca de portón negro"
    )
    expect(parsed.street).toBe("Calle Roble")
    expect(parsed.number).toBe("123")
    expect(parsed.neighborhood).toBe("Centro")
    expect(parsed.zip_code).toBe("31000")
    // El texto íntegro siempre sobrevive en references.
    expect(parsed.references).toContain("casa blanca de portón negro")
    expect(parsed.references).toContain("CP 31000")
  })

  it("sin CP ni número no inventa datos: CP vacío y número S/N", () => {
    const parsed = parseWhatsAppAddressText("Av. Universidad, Col. Santo Niño")
    expect(parsed.street).toBe("Av. Universidad")
    expect(parsed.number).toBe("S/N")
    expect(parsed.neighborhood).toBe("Santo Niño")
    expect(parsed.zip_code).toBe("")
  })
})

describe("captureWhatsAppOrderAddress", () => {
  const ADDRESS_TEXT = "Calle Roble 123, Col. Centro, CP 31000, casa blanca"

  function captureQueues(awaiting: unknown[]): Record<string, Row[]> {
    return {
      profiles: [{ data: [{ id: "user-1", full_name: "Ana", phone: "6141047021" }], error: null }],
      orders: [
        { data: awaiting, error: null }, // pedidos en espera de dirección
        { data: [{ id: 555 }], error: null }, // update que liga la dirección
      ],
      cities: [{ data: { name: "Chihuahua", state: "Chihuahua" }, error: null }],
      addresses: [{ data: { id: 42 }, error: null }],
    }
  }

  it("con UN pedido en espera, guarda la dirección y la liga al pedido", async () => {
    const { client, calls } = mockSupabase(
      captureQueues([
        { id: 555, total: 609, city_id: 7, user_id: "user-1", customer_phone: FROM },
      ])
    )

    const result = await captureWhatsAppOrderAddress(client, { from: FROM, text: ADDRESS_TEXT })

    expect(result).toEqual({
      kind: "captured",
      orderId: 555,
      total: 609,
      addressText: ADDRESS_TEXT,
    })

    const addrInsert = calls.find((c) => c.table === "addresses" && c.op === "insert")
    expect(addrInsert?.payload).toMatchObject({
      user_id: "user-1",
      label: "WhatsApp",
      street: "Calle Roble",
      number: "123",
      neighborhood: "Centro",
      city: "Chihuahua",
      state: "Chihuahua",
      zip_code: "31000",
      references: ADDRESS_TEXT,
    })

    const link = calls.find((c) => c.table === "orders" && c.op === "update")
    expect(link?.payload).toEqual({ address_id: 42 })
  })

  it("matchea por el perfil cuando el pedido no trae customer_phone", async () => {
    const { client } = mockSupabase(
      captureQueues([{ id: 556, total: 700, city_id: 7, user_id: "user-1", customer_phone: null }])
    )

    const result = await captureWhatsAppOrderAddress(client, { from: FROM, text: ADDRESS_TEXT })
    expect(result.kind).toBe("captured")
  })

  it("con DOS pedidos en espera no captura: el destino sería ambiguo", async () => {
    const { client, calls } = mockSupabase(
      captureQueues([
        { id: 555, total: 609, city_id: 7, user_id: "user-1", customer_phone: FROM },
        { id: 556, total: 700, city_id: 7, user_id: "user-1", customer_phone: FROM },
      ])
    )

    const result = await captureWhatsAppOrderAddress(client, { from: FROM, text: ADDRESS_TEXT })

    expect(result).toEqual({ kind: "none" })
    expect(calls.some((c) => c.table === "addresses" && c.op === "insert")).toBe(false)
  })

  it("sin pedidos en espera devuelve none y no escribe nada", async () => {
    const { client, calls } = mockSupabase(captureQueues([]))

    const result = await captureWhatsAppOrderAddress(client, { from: FROM, text: ADDRESS_TEXT })

    expect(result).toEqual({ kind: "none" })
    expect(calls.some((c) => c.op === "insert")).toBe(false)
  })
})
