import { beforeEach, describe, expect, it, vi } from "vitest"

const { sendTextMessage, sendTemplate } = vi.hoisted(() => ({
  sendTextMessage: vi.fn(
    async (..._args: unknown[]) => ({ messaging_product: "whatsapp", messages: [{ id: "w1" }] })
  ),
  sendTemplate: vi.fn(
    async (..._args: unknown[]) => ({ messaging_product: "whatsapp", messages: [{ id: "w2" }] })
  ),
}))

vi.mock("@/lib/whatsapp", () => ({ sendTextMessage, sendTemplate }))

import {
  normalizeMxPhoneForApi,
  planBackInStock,
  planLowStockAction,
  processStockNotifications,
  type StockProductSnapshot,
} from "./stock-notifications"

const product = (partial: Partial<StockProductSnapshot>): StockProductSnapshot => ({
  id: 1,
  name: "Arroz 1 kg",
  slug: "arroz-1-kg",
  stock_quantity: 10,
  low_stock_threshold: null,
  ...partial,
})

// ── Fake mínimo de Supabase (solo las cadenas que usa el módulo) ──
interface FakeDb {
  products: Array<Record<string, unknown>>
  low_stock_alert_state: Array<Record<string, unknown>>
  stock_notifications: Array<Record<string, unknown>>
  missingTables?: Set<string>
}

function fakeSupabase(db: FakeDb) {
  const missing = (table: string) =>
    db.missingTables?.has(table)
      ? { code: "42P01", message: `relation "${table}" does not exist` }
      : null

  function builder(table: keyof FakeDb) {
    const rows = () => db[table] as Array<Record<string, unknown>>
    const filters: Array<[string, unknown]> = []
    let nullColumn: string | null = null
    const applyFilters = () =>
      rows().filter(
        (r) =>
          filters.every(([col, val]) =>
            Array.isArray(val) ? val.includes(r[col]) : r[col] === val
          ) && (nullColumn === null || r[nullColumn] === null || r[nullColumn] === undefined)
      )
    const b = {
      select: () => b,
      in: (col: string, vals: unknown[]) => {
        filters.push([col, vals])
        return b
      },
      eq: (col: string, val: unknown) => {
        filters.push([col, val])
        return Promise.resolve({ data: null, error: missing(table) ?? null })
      },
      is: (col: string, val: unknown) => {
        if (val === null) nullColumn = col
        return b
      },
      insert: (row: Record<string, unknown>) => {
        const err = missing(table)
        if (!err) rows().push({ ...row })
        return Promise.resolve({ data: null, error: err })
      },
      update: (patch: Record<string, unknown>) => ({
        in: (_col: string, vals: unknown[]) => {
          const err = missing(table)
          if (!err) {
            for (const r of rows()) {
              if (vals.includes(r.id)) Object.assign(r, patch)
            }
          }
          return Promise.resolve({ data: null, error: err })
        },
      }),
      delete: () => b,
      then: (
        resolve: (v: { data: unknown; error: unknown }) => unknown,
        reject?: (e: unknown) => unknown
      ) => {
        const err = missing(table)
        return Promise.resolve({
          data: err ? null : applyFilters(),
          error: err,
        }).then(resolve, reject)
      },
    }
    return b
  }

  // delete().eq(...) necesita aplicar el borrado: el builder de arriba
  // resuelve eq como lectura; para el fake basta registrar el borrado
  // reimplementando delete con su propia cadena.
  function from(table: keyof FakeDb) {
    const base = builder(table)
    return {
      ...base,
      delete: () => ({
        eq: (col: string, val: unknown) => {
          const err = missing(table)
          if (!err) {
            const arr = db[table] as Array<Record<string, unknown>>
            const idx = arr.findIndex((r) => r[col] === val)
            if (idx >= 0) arr.splice(idx, 1)
          }
          return Promise.resolve({ data: null, error: err })
        },
      }),
    }
  }

  return { from }
}

describe("planLowStockAction", () => {
  it("stock sobre el umbral sin alerta: nada", () => {
    expect(planLowStockAction(product({ stock_quantity: 10 }), false)).toEqual({
      type: "none",
      productId: 1,
    })
  })

  it("cruce bajo el umbral (default 5): alertar", () => {
    expect(planLowStockAction(product({ stock_quantity: 5 }), false)).toEqual({
      type: "alert",
      productId: 1,
      threshold: 5,
      stock: 5,
    })
  })

  it("ya avisado y sigue bajo: nada (sin spam)", () => {
    expect(planLowStockAction(product({ stock_quantity: 2 }), true)).toEqual({
      type: "none",
      productId: 1,
    })
  })

  it("reposición sobre el umbral con alerta activa: rearmar", () => {
    expect(planLowStockAction(product({ stock_quantity: 20 }), true)).toEqual({
      type: "rearm",
      productId: 1,
    })
  })

  it("umbral por producto manda sobre el global", () => {
    expect(
      planLowStockAction(product({ stock_quantity: 8, low_stock_threshold: 10 }), false)
    ).toEqual({ type: "alert", productId: 1, threshold: 10, stock: 8 })
  })

  it("stock desconocido (null): nada", () => {
    expect(planLowStockAction(product({ stock_quantity: null }), true)).toEqual({
      type: "none",
      productId: 1,
    })
  })
})

describe("planBackInStock", () => {
  const subs = [{ id: "s1", phone: "5216140000000" }]
  it("stock positivo: avisar a los pendientes", () => {
    expect(planBackInStock(product({ stock_quantity: 3 }), subs)).toEqual(subs)
  })
  it("stock en 0 o desconocido: nadie", () => {
    expect(planBackInStock(product({ stock_quantity: 0 }), subs)).toEqual([])
    expect(planBackInStock(product({ stock_quantity: null }), subs)).toEqual([])
  })
})

describe("normalizeMxPhoneForApi", () => {
  it("normaliza variantes mexicanas a 521 + 10 dígitos", () => {
    expect(normalizeMxPhoneForApi("614 104 7021")).toBe("5216141047021")
    expect(normalizeMxPhoneForApi("+52 614 104 7021")).toBe("5216141047021")
    expect(normalizeMxPhoneForApi("5216141047021")).toBe("5216141047021")
    expect(normalizeMxPhoneForApi("12345")).toBeNull()
    expect(normalizeMxPhoneForApi(null)).toBeNull()
    expect(normalizeMxPhoneForApi("")).toBeNull()
  })
})

describe("processStockNotifications", () => {
  beforeEach(() => {
    sendTextMessage.mockClear()
    sendTemplate.mockClear()
  })

  it("alerta una sola vez por cruce y se rearma al reponer", async () => {
    const db: FakeDb = {
      products: [{ id: 1, name: "Arroz 1 kg", slug: "arroz-1-kg", stock_quantity: 3, low_stock_threshold: null }],
      low_stock_alert_state: [],
      stock_notifications: [],
    }
    const supabase = fakeSupabase(db) as never

    const first = await processStockNotifications(supabase, [1])
    expect(first.lowStockAlerted).toEqual([1])
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
    expect(db.low_stock_alert_state).toHaveLength(1)

    // Segundo procesamiento con el stock aún bajo: sin nuevo aviso.
    const second = await processStockNotifications(supabase, [1])
    expect(second.lowStockAlerted).toEqual([])
    expect(sendTextMessage).toHaveBeenCalledTimes(1)

    // Reposición: se rearma (se borra el estado), sin avisar.
    ;(db.products[0] as Record<string, unknown>).stock_quantity = 40
    const third = await processStockNotifications(supabase, [1])
    expect(third.lowStockRearmed).toEqual([1])
    expect(db.low_stock_alert_state).toHaveLength(0)

    // Nuevo cruce tras el rearme: vuelve a avisar.
    ;(db.products[0] as Record<string, unknown>).stock_quantity = 1
    const fourth = await processStockNotifications(supabase, [1])
    expect(fourth.lowStockAlerted).toEqual([1])
    expect(sendTextMessage).toHaveBeenCalledTimes(2)
  })

  it("back in stock: avisa a suscriptores pendientes y los marca", async () => {
    const db: FakeDb = {
      products: [{ id: 7, name: "Huevo 30 pzas", slug: "huevo-30", stock_quantity: 5, low_stock_threshold: null }],
      low_stock_alert_state: [],
      stock_notifications: [
        { id: "s1", product_id: 7, phone: "5216140000001", notified_at: null },
        { id: "s2", product_id: 7, phone: "5216140000002", notified_at: "2026-01-01T00:00:00Z" },
      ],
    }
    const supabase = fakeSupabase(db) as never
    const summary = await processStockNotifications(supabase, [7])
    expect(summary.backInStockNotified).toBe(1)
    expect(db.stock_notifications[0]?.notified_at).toBeTruthy()
    // Solo el pendiente recibió mensaje (el staff también recibe el de
    // inventario si aplica; aquí el stock 5 con umbral 5 SÍ alerta).
    const customerCalls = sendTextMessage.mock.calls.filter((c) =>
      String((c[0] as { to: string }).to).startsWith("5216140000")
    )
    expect(customerCalls).toHaveLength(1)
  })

  it("back in stock: si el envío falla, la suscripción queda pendiente", async () => {
    sendTextMessage.mockRejectedValueOnce(new Error("outside window"))
    // La primera llamada es el aviso al staff? No: stock 9 > umbral 5,
    // no hay alerta de staff; la única llamada es la del cliente.
    const db: FakeDb = {
      products: [{ id: 7, name: "Huevo 30 pzas", slug: "huevo-30", stock_quantity: 9, low_stock_threshold: null }],
      low_stock_alert_state: [],
      stock_notifications: [{ id: "s1", product_id: 7, phone: "5216140000001", notified_at: null }],
    }
    const supabase = fakeSupabase(db) as never
    const summary = await processStockNotifications(supabase, [7])
    expect(summary.backInStockNotified).toBe(0)
    expect(db.stock_notifications[0]?.notified_at).toBeNull()
  })

  it("degrada sin lanzar si las tablas de 00230 no existen", async () => {
    const db: FakeDb = {
      products: [{ id: 1, name: "Arroz", slug: "arroz", stock_quantity: 1, low_stock_threshold: null }],
      low_stock_alert_state: [],
      stock_notifications: [],
      missingTables: new Set(["low_stock_alert_state", "stock_notifications"]),
    }
    const supabase = fakeSupabase(db) as never
    const summary = await processStockNotifications(supabase, [1])
    expect(summary).toEqual({ lowStockAlerted: [], lowStockRearmed: [], backInStockNotified: 0 })
    expect(sendTextMessage).not.toHaveBeenCalled()
  })
})
