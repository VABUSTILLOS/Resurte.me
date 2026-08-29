import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/roles", () => ({ requireSellerOrAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import {
  createProspect,
  bulkCreateProspects,
  addActivity,
  createAssistedOrder,
} from "./actions"
import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"

const SELLER_ID = "seller-111"

type Result = { data?: unknown; error?: unknown }

function tableMock(results: Result[]) {
  const builder: Record<string, unknown> = {}
  const methods = [
    "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "in", "is", "or", "ilike",
    "order", "limit", "range", "gte", "lte",
    "single", "maybeSingle",
  ]
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder)
  builder.then = function (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    const r = results.length > 1 ? results.shift()! : (results[0] ?? { data: [], error: null })
    return Promise.resolve(r).then(resolve, reject)
  }
  return builder
}

function serviceWith(tables: Record<string, Result[]>) {
  const builders: Record<string, ReturnType<typeof tableMock>> = {}
  for (const [table, results] of Object.entries(tables)) {
    builders[table] = tableMock(results)
  }
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn((t: string) => builders[t] ?? tableMock([{ data: [], error: null }])),
  } as never)
  return builders
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireSellerOrAdminAction).mockResolvedValue({ userId: SELLER_ID } as never)
})

describe("createProspect", () => {
  it("rechaza nombre vacío", async () => {
    await expect(createProspect({ name: "   " })).rejects.toThrow(
      "El nombre del contacto es obligatorio"
    )
  })

  it("rechaza email con formato inválido", async () => {
    await expect(createProspect({ name: "Ana", email: "correo-malo" })).rejects.toThrow(
      "El correo no tiene un formato válido"
    )
  })

  it("rechaza teléfono y whatsapp fuera de rango", async () => {
    await expect(createProspect({ name: "Ana", phone: "123" })).rejects.toThrow(
      "El teléfono debe tener entre 8 y 15 dígitos"
    )
    await expect(
      createProspect({ name: "Ana", whatsapp: "1".repeat(16) })
    ).rejects.toThrow("El WhatsApp debe tener entre 8 y 15 dígitos")
  })

  it("crea el prospecto con datos saneados y estado por defecto", async () => {
    const inserted = {
      id: 1,
      seller_id: SELLER_ID,
      name: "Ana López",
      restaurant_name: "Tacos El Norte",
      phone: "5512345678",
      whatsapp: null,
      email: null,
      city_id: null,
      tier: null,
      zone: null,
      status: "nuevo",
      user_id: null,
      referral_code: null,
      last_contact_at: null,
      next_follow_up_at: null,
      notes: null,
      source: "manual",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    }
    const builders = serviceWith({ crm_prospects: [{ data: inserted, error: null }] })

    const prospect = await createProspect({
      name: "  Ana López  ",
      restaurant_name: " Tacos El Norte ",
      phone: "5512345678",
    })

    expect(prospect.name).toBe("Ana López")
    expect(prospect.status).toBe("nuevo")
    const insert = builders.crm_prospects?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ seller_id: SELLER_ID, name: "Ana López", status: "nuevo" })
    )
  })

  it("propaga error de base de datos como error genérico", async () => {
    serviceWith({ crm_prospects: [{ data: null, error: { message: "db down" } }] })
    await expect(createProspect({ name: "Ana" })).rejects.toThrow("Error al crear el prospecto")
  })
})

describe("bulkCreateProspects", () => {
  it("rechaza importaciones vacías o que exceden 200 filas", async () => {
    await expect(bulkCreateProspects([])).rejects.toThrow("No hay filas para importar")
    const many = Array.from({ length: 201 }, (_, i) => ({ name: `P${i}` }))
    await expect(bulkCreateProspects(many)).rejects.toThrow(
      "Máximo 200 prospectos por importación"
    )
  })

  it("reporta errores por fila y no inserta nada si alguna falla", async () => {
    const builders = serviceWith({
      cities: [{ data: [{ id: 1, name: "Ciudad de México" }], error: null }],
      crm_prospects: [{ data: null, error: null }],
    })
    const result = await bulkCreateProspects([
      { name: "Ana", city_name: "Ciudad de México" },
      { name: "Luis", email: "malo" },
      { name: "Sara", city_name: "Narnia" },
    ])
    expect(result.created).toBe(0)
    expect(result.errors).toEqual([
      { row: 2, message: "El correo no tiene un formato válido" },
      { row: 3, message: 'Ciudad "Narnia" no existe en el catálogo' },
    ])
    const insert = builders.crm_prospects?.insert as ReturnType<typeof vi.fn>
    expect(insert).not.toHaveBeenCalled()
  })

  it("inserta filas válidas con ciudad resuelta y source=import", async () => {
    const builders = serviceWith({
      cities: [{ data: [{ id: 7, name: "Guadalajara" }], error: null }],
      crm_prospects: [{ data: null, error: null }],
    })
    const result = await bulkCreateProspects([
      { name: "Ana", city_name: "guadalajara" },
      { name: "Luis" },
    ])
    expect(result).toEqual({ created: 2, errors: [] })
    const insert = builders.crm_prospects?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Ana", city_id: 7, source: "import", status: "nuevo" }),
      expect.objectContaining({ name: "Luis", city_id: null, source: "import" }),
    ])
  })
})

describe("addActivity", () => {
  it("rechaza tipos de actividad inválidos", async () => {
    await expect(
      addActivity(1, { type: "paloma-mensajera" as never })
    ).rejects.toThrow("Tipo de actividad inválido")
  })

  it("rechaza duraciones inválidas", async () => {
    await expect(
      addActivity(1, { type: "llamada", duration_seconds: 0 })
    ).rejects.toThrow("La duración debe ser mayor a 0")
    await expect(
      addActivity(1, { type: "llamada", duration_seconds: -5 })
    ).rejects.toThrow("La duración debe ser mayor a 0")
  })

  it("falla si el prospecto no pertenece al vendedor", async () => {
    serviceWith({ crm_prospects: [{ data: null, error: { message: "not found" } }] })
    await expect(addActivity(99, { type: "llamada" })).rejects.toThrow("Prospecto no encontrado")
  })

  it("registra la actividad y promueve prospecto nuevo a contactado", async () => {
    const builders = serviceWith({
      crm_prospects: [
        { data: { id: 5, status: "nuevo" }, error: null },
        { data: null, error: null },
      ],
      crm_activities: [{ data: null, error: null }],
    })
    await addActivity(5, { type: "llamada", summary: " Platicamos  ", duration_seconds: 120 })

    const insert = builders.crm_activities?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        prospect_id: 5,
        seller_id: SELLER_ID,
        type: "llamada",
        direction: "saliente",
        summary: "Platicamos",
        duration_seconds: 120,
      })
    )
    const update = builders.crm_prospects?.update as ReturnType<typeof vi.fn>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "contactado", last_contact_at: expect.any(String) })
    )
  })
})

describe("createAssistedOrder", () => {
  it("exige al menos un producto", async () => {
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 1, items: [] })
    ).rejects.toThrow("El pedido debe tener al menos un producto")
  })

  it("rechaza cantidades no enteras o menores a 1", async () => {
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 1, items: [{ productId: 1, quantity: 0 }] })
    ).rejects.toThrow("Las cantidades deben ser enteros mayores a 0")
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 1, items: [{ productId: 1, quantity: 1.5 }] })
    ).rejects.toThrow("Las cantidades deben ser enteros mayores a 0")
  })

  it("exige prospecto vinculado a una cuenta", async () => {
    serviceWith({
      crm_prospects: [
        {
          data: { id: 1, name: "Ana", user_id: null, city_id: 1, whatsapp: null, phone: null, email: null, restaurant_name: null },
          error: null,
        },
      ],
    })
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 1, items: [{ productId: 1, quantity: 2 }] })
    ).rejects.toThrow("vinculado a una cuenta")
  })

  it("rechaza productos que no existen en el catálogo", async () => {
    serviceWith({
      crm_prospects: [
        {
          data: { id: 1, name: "Ana", user_id: "client-1", city_id: 1, whatsapp: null, phone: null, email: null, restaurant_name: null },
          error: null,
        },
      ],
      products: [{ data: [], error: null }],
    })
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 1, items: [{ productId: 999, quantity: 1 }] })
    ).rejects.toThrow("Producto inválido en el pedido (999)")
  })

  it("rechaza direcciones que no pertenecen al cliente", async () => {
    serviceWith({
      crm_prospects: [
        {
          data: { id: 1, name: "Ana", user_id: "client-1", city_id: 1, whatsapp: null, phone: null, email: null, restaurant_name: null },
          error: null,
        },
      ],
      products: [{ data: [{ id: 1, name: "Tortilla", price: 25, sale_price: null, stock_status: "in_stock" }], error: null }],
      addresses: [{ data: null, error: null }],
    })
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 42, items: [{ productId: 1, quantity: 1 }] })
    ).rejects.toThrow("La dirección seleccionada no pertenece al cliente")
  })

  it("crea el pedido con precios del catálogo y registra actividad", async () => {
    const builders = serviceWith({
      crm_prospects: [
        {
          data: { id: 1, name: "Ana", user_id: "client-1", city_id: 3, whatsapp: "5512345678", phone: null, email: "ana@x.mx", restaurant_name: null },
          error: null,
        },
      ],
      products: [
        {
          data: [
            { id: 1, name: "Tortilla", price: 25, sale_price: 20, stock_status: "in_stock" },
            { id: 2, name: "Salsa", price: 30, sale_price: null, stock_status: "in_stock" },
          ],
          error: null,
        },
      ],
      addresses: [{ data: { id: 9, city: "CDMX", state: "CDMX" }, error: null }],
      orders: [{ data: { id: 77 }, error: null }],
      order_items: [{ data: null, error: null }],
      crm_activities: [{ data: null, error: null }],
    })

    const result = await createAssistedOrder({
      prospectId: 1,
      addressId: 9,
      items: [
        { productId: 1, quantity: 2 }, // 20 × 2 = 40
        { productId: 2, quantity: 1 }, // 30 × 1 = 30
      ],
      note: "entrega lunes",
    })

    expect(result).toEqual({ orderId: 77 })
    const orderInsert = builders.orders?.insert as ReturnType<typeof vi.fn>
    expect(orderInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "client-1",
        seller_id: SELLER_ID,
        city_id: 3,
        address_id: 9,
        status: "pending",
        total: 70,
        subtotal: 70,
        customer_phone: "5512345678",
        customer_email: "ana@x.mx",
      })
    )
    const itemsInsert = builders.order_items?.insert as ReturnType<typeof vi.fn>
    expect(itemsInsert).toHaveBeenCalledWith([
      { order_id: 77, product_id: 1, quantity: 2, unit_price: 20 },
      { order_id: 77, product_id: 2, quantity: 1, unit_price: 30 },
    ])
    const activityInsert = builders.crm_activities?.insert as ReturnType<typeof vi.fn>
    expect(activityInsert).toHaveBeenCalledWith(
      expect.objectContaining({ prospect_id: 1, type: "pedido", outcome: "pedido_confirmado" })
    )
  })
})
