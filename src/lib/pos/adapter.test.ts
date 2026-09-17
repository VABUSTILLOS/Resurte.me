import { describe, expect, it } from "vitest"

import {
  normalizeMenuSnapshot,
  resolvePosAdapter,
  unimplementedPosAdapter,
} from "./adapter"
import {
  EXTERNAL_STATUS_MAP,
  ORDER_RANK,
  mapPosOrderStatus,
  planMenuSync,
  planOrderReconcile,
} from "./reconcile"
import { POS_PROVIDERS } from "./registry"

describe("normalizeMenuSnapshot", () => {
  it("devuelve vacío si no es un arreglo", () => {
    expect(normalizeMenuSnapshot(null)).toEqual([])
    expect(normalizeMenuSnapshot({})).toEqual([])
    expect(normalizeMenuSnapshot("menu")).toEqual([])
  })

  it("recorta el nombre y descarta lo que no lo tiene", () => {
    const items = normalizeMenuSnapshot([
      { name: "  Tacos al pastor  ", price: 45 },
      { name: "   ", price: 10 },
      { price: 10 },
      null,
      "basura",
    ])
    expect(items).toHaveLength(1)
    expect(items[0]!.name).toBe("Tacos al pastor")
  })

  it("deduplica por nombre sin distinguir mayúsculas", () => {
    const items = normalizeMenuSnapshot([
      { name: "Tacos", price: 45 },
      { name: "tacos", price: 50 },
    ])
    expect(items).toHaveLength(1)
    expect(items[0]!.price).toBe(45)
  })

  it("nunca deja un precio negativo ni no numérico", () => {
    const items = normalizeMenuSnapshot([
      { name: "A", price: -10 },
      { name: "B", price: "no es número" },
      { name: "C", price: "38.50" },
    ])
    expect(items.map((i) => i.price)).toEqual([0, 0, 38.5])
  })

  it("redondea el precio a dos decimales", () => {
    const items = normalizeMenuSnapshot([{ name: "A", price: 12.3456789 }])
    expect(items[0]!.price).toBe(12.35)
  })

  it("normaliza la descripción ausente a null", () => {
    const items = normalizeMenuSnapshot([{ name: "A", price: 1, description: "   " }])
    expect(items[0]!.description).toBeNull()
  })

  it("limita el número de etiquetas y descarta las vacías", () => {
    const items = normalizeMenuSnapshot([
      { name: "A", price: 1, tags: ["uno", "", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"] },
    ])
    expect(items[0]!.tags).toHaveLength(8)
    expect(items[0]!.tags).not.toContain("")
  })

  it("ignora etiquetas que no vienen como arreglo", () => {
    const items = normalizeMenuSnapshot([{ name: "A", price: 1, tags: "picante" }])
    expect(items[0]!.tags).toEqual([])
  })

  it("acota la longitud del nombre y de la descripción", () => {
    const items = normalizeMenuSnapshot([
      { name: "x".repeat(300), price: 1, description: "y".repeat(900), category: "z".repeat(300) },
    ])
    expect(items[0]!.name).toHaveLength(120)
    expect(items[0]!.description).toHaveLength(400)
    expect(items[0]!.category).toHaveLength(80)
  })

  it("corta en 500 platillos", () => {
    const raw = Array.from({ length: 600 }, (_, i) => ({ name: `Platillo ${i}`, price: 10 }))
    expect(normalizeMenuSnapshot(raw)).toHaveLength(500)
  })
})

describe("resolvePosAdapter", () => {
  it("resuelve para los seis proveedores", () => {
    for (const provider of POS_PROVIDERS) {
      const adapter = resolvePosAdapter(provider)
      expect(adapter.provider).toBe(provider)
      expect(adapter.label.length).toBeGreaterThan(0)
    }
  })

  it("valida credenciales contra el descriptor", () => {
    const adapter = resolvePosAdapter("toast")
    expect(adapter.validate({ apiKey: "a", apiSecret: "b", locationId: "c" }).ok).toBe(true)
    expect(adapter.validate({ apiKey: "a" }).missing).toEqual(["apiSecret", "locationId"])
  })

  it("no lanza al validar sin credenciales", () => {
    expect(() => resolvePosAdapter("clip").validate(null)).not.toThrow()
  })
})

describe("adaptador sin implementar", () => {
  it("reporta salud pendiente con el motivo del descriptor", async () => {
    const health = await resolvePosAdapter("parrot").health({ token: "t", locationId: "l" })
    expect(health.status).toBe("pending")
    expect(health.message).toContain("adaptador")
  })

  it("reporta salud pendiente aunque tenga credenciales completas", async () => {
    const health = await resolvePosAdapter("toast").health({
      apiKey: "a",
      apiSecret: "b",
      locationId: "c",
    })
    expect(health.status).toBe("pending")
  })

  it("no sincroniza el menú y lo dice", async () => {
    const result = await resolvePosAdapter("soft_restaurant").pullMenu({ apiKey: "k", locationId: "l" })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("no debería pasar")
    expect(result.code).toBe("not_implemented")
    expect(result.error.length).toBeGreaterThan(10)
  })

  it("no empuja pedidos y lo dice", async () => {
    const result = await resolvePosAdapter("clip").pushOrder(
      { apiKey: "k", apiSecret: "s" },
      {
        orderId: "o1",
        status: "confirmed",
        total: 250,
        items: [{ name: "Taco", qty: 2, price: 45 }],
        customerName: null,
        customerPhone: null,
        note: null,
      }
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("no debería pasar")
    expect(result.code).toBe("not_implemented")
  })

  it("el adaptador por omisión es estable para el mismo proveedor", () => {
    expect(unimplementedPosAdapter("toast").label).toBe(resolvePosAdapter("toast").label)
  })
})

describe("mapPosOrderStatus", () => {
  it("traduce el vocabulario de cada proveedor", () => {
    expect(mapPosOrderStatus("soft_restaurant", "in_kitchen")).toBe("preparing")
    expect(mapPosOrderStatus("parrot", "preparation")).toBe("preparing")
    expect(mapPosOrderStatus("ncr_aloha", "voided")).toBe("cancelled")
    expect(mapPosOrderStatus("toast", "COMPLETED")).toBe("delivered")
    expect(mapPosOrderStatus("clip", "approved")).toBe("confirmed")
    expect(mapPosOrderStatus("mercado_pago", "refunded")).toBe("cancelled")
  })

  it("no distingue mayúsculas", () => {
    expect(mapPosOrderStatus("clip", "APPROVED")).toBe("confirmed")
    expect(mapPosOrderStatus("toast", "completed")).toBe("delivered")
    expect(mapPosOrderStatus("toast", "Completed")).toBe("delivered")
    expect(mapPosOrderStatus("soft_restaurant", "IN_KITCHEN")).toBe("preparing")
  })

  it("ignora un estado desconocido en vez de adivinarlo", () => {
    expect(mapPosOrderStatus("toast", "SOMETHING_NEW")).toBeNull()
    expect(mapPosOrderStatus("clip", "pendiente_de_revision")).toBeNull()
  })

  it("ignora entradas que no son texto", () => {
    expect(mapPosOrderStatus("toast", null)).toBeNull()
    expect(mapPosOrderStatus("toast", 7)).toBeNull()
    expect(mapPosOrderStatus("toast", "  ")).toBeNull()
  })

  it("ningún vocabulario mapea a pending", () => {
    for (const provider of POS_PROVIDERS) {
      const values = Object.values(EXTERNAL_STATUS_MAP[provider])
      expect(values).not.toContain("pending")
    }
  })
})

describe("planOrderReconcile", () => {
  it("avanza cuando el POS reporta un estado posterior", () => {
    const plan = planOrderReconcile("confirmed", "preparing")
    expect(plan.action).toBe("advance")
    expect(plan.next).toBe("preparing")
  })

  it("ignora el mismo estado", () => {
    expect(planOrderReconcile("preparing", "preparing").action).toBe("ignore")
  })

  it("nunca retrocede un pedido", () => {
    const plan = planOrderReconcile("out_for_delivery", "preparing")
    expect(plan.action).toBe("ignore")
    expect(plan.next).toBeUndefined()
    expect(plan.reason).toContain("retrocede")
  })

  it("ignora un estado no reconocido", () => {
    const plan = planOrderReconcile("pending", null)
    expect(plan.action).toBe("ignore")
    expect(plan.reason).toContain("no reconocemos")
  })

  it("cancela desde cualquier estado no entregado", () => {
    for (const current of ["pending", "confirmed", "preparing", "out_for_delivery"] as const) {
      const plan = planOrderReconcile(current, "cancelled")
      expect(plan.action).toBe("cancel")
      expect(plan.next).toBe("cancelled")
    }
  })

  it("no cancela un pedido ya entregado", () => {
    const plan = planOrderReconcile("delivered", "cancelled")
    expect(plan.action).toBe("ignore")
    expect(plan.reason).toContain("entregado")
  })

  it("no reabre un pedido cancelado", () => {
    for (const incoming of ["confirmed", "preparing", "out_for_delivery", "delivered"] as const) {
      const plan = planOrderReconcile("cancelled", incoming)
      expect(plan.action).toBe("ignore")
      expect(plan.next).toBeUndefined()
    }
  })

  it("no avanza un pedido ya entregado", () => {
    const plan = planOrderReconcile("delivered", "confirmed")
    expect(plan.action).toBe("ignore")
  })

  it("cancelled no participa en el rango de avance", () => {
    expect(Object.keys(ORDER_RANK)).not.toContain("cancelled")
  })

  it("es total: cualquier combinación produce un plan", () => {
    const states = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"] as const
    for (const current of states) {
      for (const incoming of [...states, null]) {
        const plan = planOrderReconcile(current, incoming)
        expect(["ignore", "advance", "cancel"]).toContain(plan.action)
        expect(plan.reason.length).toBeGreaterThan(0)
      }
    }
  })
})

describe("planMenuSync", () => {
  const local = [
    { id: "l1", name: "Tacos al pastor", price: 45, description: "Con piña" },
    { id: "l2", name: "Quesadilla", price: 35, description: null },
    { id: "l3", name: "Especial de la casa", price: 120, description: null },
  ]

  it("crea lo que no existe localmente", () => {
    const plan = planMenuSync(local, [
      { externalId: "e1", name: "Tacos al pastor", price: 45, description: "Con piña", category: null, tags: [] },
      { externalId: "e9", name: "Flautas", price: 60, description: null, category: null, tags: [] },
    ])
    expect(plan.created.map((i) => i.name)).toEqual(["Flautas"])
  })

  it("actualiza cuando cambia el precio", () => {
    const plan = planMenuSync(local, [
      { externalId: "e1", name: "Tacos al pastor", price: 50, description: "Con piña", category: null, tags: [] },
    ])
    expect(plan.updated).toHaveLength(1)
    expect(plan.updated[0]!.id).toBe("l1")
    expect(plan.updated[0]!.item.price).toBe(50)
  })

  it("actualiza cuando cambia la descripción", () => {
    const plan = planMenuSync(local, [
      { externalId: "e2", name: "Quesadilla", price: 35, description: "Ahora con queso extra", category: null, tags: [] },
    ])
    expect(plan.updated.map((u) => u.id)).toEqual(["l2"])
  })

  it("no marca cambios si el precio coincide con redondeo", () => {
    const plan = planMenuSync(local, [
      { externalId: "e1", name: "Tacos al pastor", price: 45.001, description: "Con piña", category: null, tags: [] },
    ])
    expect(plan.updated).toEqual([])
    expect(plan.unchanged).toEqual(["l1"])
  })

  it("empareja sin distinguir mayúsculas ni espacios de más", () => {
    const plan = planMenuSync(local, [
      { externalId: "e1", name: "  TACOS   al  pastor ", price: 45, description: "Con piña", category: null, tags: [] },
    ])
    expect(plan.created).toEqual([])
    expect(plan.unchanged).toEqual(["l1"])
  })

  it("nunca borra: reporta lo que solo existe localmente", () => {
    const plan = planMenuSync(local, [])
    expect(plan.created).toEqual([])
    expect(plan.onlyLocally).toEqual(["l1", "l2", "l3"])
  })

  it("con el menú idéntico no propone nada", () => {
    const plan = planMenuSync(local, [
      { externalId: "e1", name: "Tacos al pastor", price: 45, description: "Con piña", category: null, tags: [] },
      { externalId: "e2", name: "Quesadilla", price: 35, description: null, category: null, tags: [] },
      { externalId: "e3", name: "Especial de la casa", price: 120, description: null, category: null, tags: [] },
    ])
    expect(plan.created).toEqual([])
    expect(plan.updated).toEqual([])
    expect(plan.unchanged).toEqual(["l1", "l2", "l3"])
    expect(plan.onlyLocally).toEqual([])
  })

  it("ignora nombres locales repetidos al emparejar", () => {
    const plan = planMenuSync(
      [
        { id: "a", name: "Tacos", price: 40, description: null },
        { id: "b", name: "tacos", price: 99, description: null },
      ],
      [{ externalId: "e1", name: "Tacos", price: 40, description: null, category: null, tags: [] }]
    )
    expect(plan.unchanged).toEqual(["a"])
    expect(plan.created).toEqual([])
  })

  it("descarta localmente un nombre vacío", () => {
    const plan = planMenuSync([{ id: "a", name: "   ", price: 10, description: null }], [])
    expect(plan.onlyLocally).toEqual([])
  })
})
