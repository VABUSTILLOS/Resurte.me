import { describe, expect, it } from "vitest"

import type { PosMenuSnapshotItem } from "@/lib/pos/adapter"
import {
  EXTERNAL_STATUS_MAP,
  ORDER_RANK,
  mapPosOrderStatus,
  planMenuSync,
  planOrderReconcile,
  type LocalMenuItem,
  type MenuSyncPlan,
} from "@/lib/pos/reconcile"
import { POS_PROVIDERS } from "@/lib/pos/registry"
import type { FoodosOrderStatus } from "@/types/foodos"

/** Estados que avanzan, en orden. `cancelled` queda fuera: es terminal. */
const RANKED = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"] as const

const ALL_STATUSES: FoodosOrderStatus[] = [...RANKED, "cancelled"]

/** Todas las combinaciones (actual, entrante), incluido el entrante desconocido. */
const PAIRS: Array<[FoodosOrderStatus, FoodosOrderStatus | null]> = ALL_STATUSES.flatMap(
  (current) =>
    [...ALL_STATUSES, null].map(
      (incoming) => [current, incoming] as [FoodosOrderStatus, FoodosOrderStatus | null]
    )
)

/** Rango de avance, o `null` para el estado terminal. */
function rank(status: FoodosOrderStatus): number | null {
  return status === "cancelled" ? null : ORDER_RANK[status]
}

/** Alterna mayúsculas/minúsculas para probar que la búsqueda no depende del caso. */
function mixedCase(value: string): string {
  return [...value]
    .map((char, index) => (index % 2 === 0 ? char.toUpperCase() : char.toLowerCase()))
    .join("")
}

function local(over: Partial<LocalMenuItem> = {}): LocalMenuItem {
  const base: LocalMenuItem = { id: "l1", name: "Tacos", price: 45, description: null }
  return { ...base, ...over }
}

function item(over: Partial<PosMenuSnapshotItem> = {}): PosMenuSnapshotItem {
  const base: PosMenuSnapshotItem = {
    externalId: "e1",
    name: "Tacos",
    description: null,
    price: 45,
    category: null,
    tags: [],
  }
  return { ...base, ...over }
}

/** En qué cubeta del plan cae un platillo local. */
function bucketsOf(plan: MenuSyncPlan, id: string): string[] {
  const out: string[] = []
  if (plan.updated.some((entry) => entry.id === id)) out.push("updated")
  if (plan.unchanged.includes(id)) out.push("unchanged")
  if (plan.onlyLocally.includes(id)) out.push("onlyLocally")
  return out
}

describe("ORDER_RANK", () => {
  it("declara el orden de avance completo y estrictamente creciente", () => {
    expect(RANKED.map((status) => ORDER_RANK[status])).toEqual([0, 1, 2, 3, 4])
    const ranks = RANKED.map((status) => ORDER_RANK[status])
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]!).toBeGreaterThan(ranks[i - 1]!)
    }
  })

  it("no le da rango a `cancelled`: es terminal y no participa del avance", () => {
    expect(Object.keys(ORDER_RANK)).toEqual([...RANKED])
    expect("cancelled" in ORDER_RANK).toBe(false)
    expect(rank("cancelled")).toBeNull()
  })

  it("todo estado no cancelado tiene un rango utilizable", () => {
    for (const status of RANKED) {
      expect(Number.isFinite(ORDER_RANK[status])).toBe(true)
    }
  })
})

describe("EXTERNAL_STATUS_MAP", () => {
  it("declara un vocabulario no vacío para cada proveedor del registro", () => {
    expect(Object.keys(EXTERNAL_STATUS_MAP).sort()).toEqual([...POS_PROVIDERS].sort())
    for (const provider of POS_PROVIDERS) {
      expect(Object.keys(EXTERNAL_STATUS_MAP[provider]).length).toBeGreaterThan(0)
    }
  })

  it("no declara vocabularios para proveedores que no existen", () => {
    const declared = Object.keys(EXTERNAL_STATUS_MAP)
    expect(declared).toHaveLength(POS_PROVIDERS.length)
    for (const provider of declared) {
      expect(POS_PROVIDERS).toContain(provider)
    }
  })

  it("ningún vocabulario tiene claves que colisionen al comparar sin mayúsculas", () => {
    // Una colisión dejaría un estado declarado e inalcanzable, en silencio.
    for (const provider of POS_PROVIDERS) {
      const keys = Object.keys(EXTERNAL_STATUS_MAP[provider]).map((key) => key.toLowerCase())
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it("ninguna clave viene vacía ni con espacios alrededor", () => {
    for (const provider of POS_PROVIDERS) {
      for (const key of Object.keys(EXTERNAL_STATUS_MAP[provider])) {
        expect(key).toBe(key.trim())
        expect(key.length).toBeGreaterThan(0)
      }
    }
  })

  it("ningún estado externo mapea a `pending`: un POS no puede inventar un pedido sin confirmar", () => {
    for (const provider of POS_PROVIDERS) {
      expect(Object.values(EXTERNAL_STATUS_MAP[provider])).not.toContain("pending")
    }
  })

  it("todos los valores son estados válidos de FoodOS", () => {
    for (const provider of POS_PROVIDERS) {
      for (const value of Object.values(EXTERNAL_STATUS_MAP[provider])) {
        expect(ALL_STATUSES).toContain(value)
      }
    }
  })

  it("cada proveedor sabe reportar una cancelación", () => {
    for (const provider of POS_PROVIDERS) {
      expect(Object.values(EXTERNAL_STATUS_MAP[provider])).toContain("cancelled")
    }
  })

  it("los procesadores de pago no declaran entrega: solo cobros, nunca preparación ni reparto", () => {
    for (const provider of ["clip", "mercado_pago"] as const) {
      const values = Object.values(EXTERNAL_STATUS_MAP[provider])
      expect(values).not.toContain("delivered")
      expect(values).not.toContain("out_for_delivery")
      expect(values).not.toContain("preparing")
    }
  })
})

describe("mapPosOrderStatus", () => {
  it("traduce cada clave declarada, para cada proveedor", () => {
    for (const provider of POS_PROVIDERS) {
      for (const [key, expected] of Object.entries(EXTERNAL_STATUS_MAP[provider])) {
        expect(mapPosOrderStatus(provider, key)).toBe(expected)
      }
    }
  })

  it("traduce la clave declarada aunque el proveedor la mande en mayúsculas", () => {
    // El vocabulario de Toast se declara en mayúsculas, pero el de Clip no:
    // buscar solo por la clave declarada dejaría fuera la mitad de los avisos.
    for (const provider of POS_PROVIDERS) {
      for (const [key, expected] of Object.entries(EXTERNAL_STATUS_MAP[provider])) {
        expect(mapPosOrderStatus(provider, key.toUpperCase())).toBe(expected)
      }
    }
  })

  it("traduce la clave declarada aunque el proveedor la mande en minúsculas", () => {
    for (const provider of POS_PROVIDERS) {
      for (const [key, expected] of Object.entries(EXTERNAL_STATUS_MAP[provider])) {
        expect(mapPosOrderStatus(provider, key.toLowerCase())).toBe(expected)
      }
    }
  })

  it("traduce la clave declarada con mayúsculas mezcladas", () => {
    for (const provider of POS_PROVIDERS) {
      for (const [key, expected] of Object.entries(EXTERNAL_STATUS_MAP[provider])) {
        expect(mapPosOrderStatus(provider, mixedCase(key))).toBe(expected)
      }
    }
  })

  it("ignora espacios alrededor del estado", () => {
    expect(mapPosOrderStatus("soft_restaurant", "  in_kitchen  ")).toBe("preparing")
    expect(mapPosOrderStatus("toast", "\tCOMPLETED\n")).toBe("delivered")
    expect(mapPosOrderStatus("clip", " approved ")).toBe("confirmed")
  })

  it("no recorta los espacios internos: solo tolera los de los extremos", () => {
    expect(mapPosOrderStatus("soft_restaurant", "in kitchen")).toBeNull()
    expect(mapPosOrderStatus("toast", "READY FOR PICKUP")).toBeNull()
  })

  it("Toast: traduce su vocabulario en mayúsculas", () => {
    expect(mapPosOrderStatus("toast", "OPEN")).toBe("confirmed")
    expect(mapPosOrderStatus("toast", "PREPARING")).toBe("preparing")
    expect(mapPosOrderStatus("toast", "READY_FOR_PICKUP")).toBe("preparing")
    expect(mapPosOrderStatus("toast", "OUT_FOR_DELIVERY")).toBe("out_for_delivery")
    expect(mapPosOrderStatus("toast", "COMPLETED")).toBe("delivered")
    expect(mapPosOrderStatus("toast", "VOIDED")).toBe("cancelled")
  })

  it("Clip y Mercado Pago: traducen su vocabulario en minúsculas", () => {
    expect(mapPosOrderStatus("clip", "approved")).toBe("confirmed")
    expect(mapPosOrderStatus("clip", "refunded")).toBe("cancelled")
    expect(mapPosOrderStatus("clip", "declined")).toBe("cancelled")
    expect(mapPosOrderStatus("clip", "charged_back")).toBe("cancelled")
    expect(mapPosOrderStatus("mercado_pago", "in_process")).toBe("confirmed")
    expect(mapPosOrderStatus("mercado_pago", "rejected")).toBe("cancelled")
    expect(mapPosOrderStatus("mercado_pago", "charged_back")).toBe("cancelled")
  })

  it("Parrot: entiende la variante en español", () => {
    expect(mapPosOrderStatus("parrot", "cancelado")).toBe("cancelled")
    expect(mapPosOrderStatus("parrot", "CANCELADO")).toBe("cancelled")
    expect(mapPosOrderStatus("parrot", "canceled")).toBe("cancelled")
  })

  it("un estado desconocido devuelve null en vez de adivinarse", () => {
    expect(mapPosOrderStatus("toast", "SOMETHING_NEW")).toBeNull()
    expect(mapPosOrderStatus("clip", "pendiente_de_revision")).toBeNull()
    expect(mapPosOrderStatus("soft_restaurant", "completed")).toBeNull()
    expect(mapPosOrderStatus("ncr_aloha", "delivered")).toBeNull()
  })

  it("el mismo texto no significa lo mismo en todos los proveedores", () => {
    // `approved` es un cobro para Clip/Mercado Pago y nada para Toast.
    expect(mapPosOrderStatus("clip", "approved")).toBe("confirmed")
    expect(mapPosOrderStatus("mercado_pago", "approved")).toBe("confirmed")
    expect(mapPosOrderStatus("toast", "approved")).toBeNull()

    // `void` es de Soft Restaurant; NCR Aloha usa `voided`.
    expect(mapPosOrderStatus("soft_restaurant", "void")).toBe("cancelled")
    expect(mapPosOrderStatus("ncr_aloha", "void")).toBeNull()
    expect(mapPosOrderStatus("ncr_aloha", "voided")).toBe("cancelled")
    expect(mapPosOrderStatus("soft_restaurant", "voided")).toBeNull()

    // `ready` es un estado de Soft/Aloha; Toast usa `READY_FOR_PICKUP`.
    expect(mapPosOrderStatus("soft_restaurant", "ready")).toBe("preparing")
    expect(mapPosOrderStatus("toast", "ready")).toBeNull()
  })

  it("no acepta entradas que no son texto", () => {
    const garbage: unknown[] = [null, undefined, 7, true, {}, [], ["open"], () => "open"]
    for (const value of garbage) {
      expect(mapPosOrderStatus("toast", value)).toBeNull()
    }
  })

  it("un estado vacío o solo espacios no se traduce", () => {
    expect(mapPosOrderStatus("toast", "")).toBeNull()
    expect(mapPosOrderStatus("toast", "   ")).toBeNull()
    expect(mapPosOrderStatus("toast", "\t\n")).toBeNull()
  })

  it("acepta los seis proveedores sin lanzar", () => {
    for (const provider of POS_PROVIDERS) {
      expect(mapPosOrderStatus(provider, "estado-que-nadie-declaro")).toBeNull()
      expect(mapPosOrderStatus(provider, null)).toBeNull()
    }
  })

  it("nunca devuelve `pending`", () => {
    const words = ["pending", "PENDING", "Pendiente", "nuevo", "open", "new", "in_progress"]
    for (const provider of POS_PROVIDERS) {
      for (const word of words) {
        expect(mapPosOrderStatus(provider, word)).not.toBe("pending")
      }
    }
  })

  it("consultar no altera el vocabulario declarado", () => {
    mapPosOrderStatus("toast", "OPEN")
    mapPosOrderStatus("toast", "cualquier-cosa")
    mapPosOrderStatus("clip", "APPROVED")
    expect(mapPosOrderStatus("toast", "OPEN")).toBe("confirmed")
    expect(mapPosOrderStatus("clip", "approved")).toBe("confirmed")
    expect(Object.keys(EXTERNAL_STATUS_MAP.toast)).toContain("OPEN")
  })
})

describe("planOrderReconcile", () => {
  it("avanza cuando el proveedor reporta un estado posterior", () => {
    const plan = planOrderReconcile("confirmed", "preparing")
    expect(plan.action).toBe("advance")
    expect(plan.next).toBe("preparing")
    expect(plan.reason).toContain("preparing")
  })

  it("avanza varios pasos de golpe sin escalar intermedios", () => {
    const plan = planOrderReconcile("confirmed", "out_for_delivery")
    expect(plan.action).toBe("advance")
    expect(plan.next).toBe("out_for_delivery")
  })

  it("avanza exactamente cuando el rango entrante es mayor", () => {
    for (const current of RANKED) {
      for (const incoming of RANKED) {
        const plan = planOrderReconcile(current, incoming)
        const shouldAdvance = rank(incoming)! > rank(current)!
        expect(plan.action, `${current} -> ${incoming}`).toBe(shouldAdvance ? "advance" : "ignore")
      }
    }
  })

  it("ignora el mismo estado, en cualquiera de los seis", () => {
    for (const status of ALL_STATUSES) {
      const plan = planOrderReconcile(status, status)
      expect(plan.action).toBe("ignore")
      expect(plan.next).toBeUndefined()
      expect(plan.reason).toContain("ya estaba")
    }
  })

  it("nunca retrocede un pedido", () => {
    for (const current of RANKED) {
      // Desde `delivered` el descarte lo explica el guard anterior, no el rango.
      if (current === "delivered") continue
      for (const incoming of RANKED) {
        if (rank(incoming)! >= rank(current)!) continue
        const plan = planOrderReconcile(current, incoming)
        expect(plan.action, `${current} -> ${incoming}`).toBe("ignore")
        expect(plan.next).toBeUndefined()
        expect(plan.reason).toContain("retrocede")
      }
    }
  })

  it("nunca aplica un estado de rango menor, ni siquiera desde `delivered`", () => {
    for (const current of ALL_STATUSES) {
      for (const incoming of ALL_STATUSES) {
        const plan = planOrderReconcile(current, incoming)
        if (plan.next === undefined) continue
        // Una cancelación no es un avance de rango: es un estado terminal.
        if (plan.next === "cancelled") continue
        expect(rank(plan.next)!, `${current} -> ${incoming}`).toBeGreaterThan(rank(current)!)
      }
    }
  })

  it("un webhook reentregado no vuelve a mover el pedido", () => {
    const first = planOrderReconcile("pending", "confirmed")
    expect(first.action).toBe("advance")
    const again = planOrderReconcile(first.next!, "confirmed")
    expect(again.action).toBe("ignore")
  })

  it("ignora un estado que el proveedor no declara", () => {
    const plan = planOrderReconcile("pending", null)
    expect(plan.action).toBe("ignore")
    expect(plan.next).toBeUndefined()
    expect(plan.reason).toContain("no reconocemos")
  })

  it("cancela desde cualquier estado no entregado", () => {
    for (const current of ["pending", "confirmed", "preparing", "out_for_delivery"] as const) {
      const plan = planOrderReconcile(current, "cancelled")
      expect(plan.action, current).toBe("cancel")
      expect(plan.next).toBe("cancelled")
      expect(plan.reason).toContain("canceló")
    }
  })

  it("no cancela un pedido ya entregado", () => {
    const plan = planOrderReconcile("delivered", "cancelled")
    expect(plan.action).toBe("ignore")
    expect(plan.next).toBeUndefined()
    expect(plan.reason).toContain("entregado no se puede cancelar")
  })

  it("no reabre un pedido cancelado, venga lo que venga", () => {
    for (const incoming of ALL_STATUSES) {
      const plan = planOrderReconcile("cancelled", incoming)
      expect(plan.action, incoming).toBe("ignore")
      expect(plan.next).toBeUndefined()
      if (incoming !== "cancelled") expect(plan.reason).toContain("no se reabre")
    }
  })

  it("un pedido entregado ya no se mueve hacia adelante", () => {
    for (const incoming of ["pending", "confirmed", "preparing", "out_for_delivery"] as const) {
      const plan = planOrderReconcile("delivered", incoming)
      expect(plan.action, incoming).toBe("ignore")
      expect(plan.next).toBeUndefined()
      expect(plan.reason).toContain("ya se entregó")
    }
  })

  it("la cancelación gana sobre un avance posterior", () => {
    const cancelled = planOrderReconcile("preparing", "cancelled")
    expect(cancelled.next).toBe("cancelled")
    const later = planOrderReconcile(cancelled.next!, "delivered")
    expect(later.action).toBe("ignore")
    expect(later.next).toBeUndefined()
  })

  it("es coherente: `next` existe si y solo si hay algo que aplicar", () => {
    for (const [current, incoming] of PAIRS) {
      const plan = planOrderReconcile(current, incoming)
      const label = `${current} -> ${String(incoming)}`
      if (plan.action === "ignore") {
        expect(plan.next, label).toBeUndefined()
      } else if (plan.action === "advance") {
        expect(plan.next, label).toBe(incoming)
      } else {
        expect(plan.next, label).toBe("cancelled")
      }
    }
  })

  it("es total: cualquier combinación produce un plan con motivo legible", () => {
    for (const [current, incoming] of PAIRS) {
      const plan = planOrderReconcile(current, incoming)
      expect(["ignore", "advance", "cancel"]).toContain(plan.action)
      expect(plan.reason.trim().length).toBeGreaterThan(0)
    }
  })

  it("cada regla de descarte tiene su propio motivo", () => {
    // El motivo se guarda en la bitácora y se muestra en el panel: si dos
    // reglas distintas comparten texto, el dueño no puede saber qué pasó.
    const reasons = [
      planOrderReconcile("pending", null).reason,
      planOrderReconcile("pending", "pending").reason,
      planOrderReconcile("cancelled", "confirmed").reason,
      planOrderReconcile("delivered", "cancelled").reason,
      planOrderReconcile("delivered", "confirmed").reason,
      planOrderReconcile("preparing", "confirmed").reason,
    ]
    expect(new Set(reasons).size).toBe(reasons.length)
  })

  it("un flujo desordenado nunca hace retroceder el pedido", () => {
    const sequence: Array<FoodosOrderStatus | null> = [
      "confirmed",
      "preparing",
      "confirmed",
      null,
      "out_for_delivery",
      "preparing",
      "delivered",
      "cancelled",
      "preparing",
    ]
    let current: FoodosOrderStatus = "pending"
    for (const incoming of sequence) {
      const plan = planOrderReconcile(current, incoming)
      const next: FoodosOrderStatus = plan.next ?? current
      if (next !== current) {
        expect(rank(next)).not.toBeNull()
        expect(rank(next)!).toBeGreaterThanOrEqual(rank(current) === null ? 0 : rank(current)!)
      }
      current = next
    }
    expect(current).toBe("delivered")
  })
})

describe("planMenuSync", () => {
  it("con el menú idéntico no propone nada", () => {
    const plan = planMenuSync(
      [local({ id: "l1" }), local({ id: "l2", name: "Quesadilla", price: 35 })],
      [item({ name: "Tacos", price: 45 }), item({ externalId: "e2", name: "Quesadilla", price: 35 })]
    )
    expect(plan).toEqual({ created: [], updated: [], unchanged: ["l1", "l2"], onlyLocally: [] })
  })

  it("nunca borra: no existe una cubeta de bajas", () => {
    const plan = planMenuSync([local({ id: "l1" })], [])
    expect(Object.keys(plan).sort()).toEqual(["created", "onlyLocally", "unchanged", "updated"])
    expect(plan.onlyLocally).toEqual(["l1"])
  })

  it("reporta lo que solo existe localmente, en orden de entrada", () => {
    const plan = planMenuSync(
      [
        local({ id: "l1", name: "Tacos" }),
        local({ id: "l2", name: "Quesadilla" }),
        local({ id: "l3", name: "Especial de la casa", price: 120 }),
      ],
      [item({ name: "Tacos" })]
    )
    expect(plan.onlyLocally).toEqual(["l2", "l3"])
    expect(plan.unchanged).toEqual(["l1"])
  })

  it("crea lo que el proveedor trae y no existe localmente", () => {
    const plan = planMenuSync(
      [local({ id: "l1" })],
      [item({ name: "Tacos" }), item({ externalId: "e9", name: "Flautas", price: 60, category: "Antojitos", tags: ["frito"] })]
    )
    expect(plan.created.map((entry) => entry.name)).toEqual(["Flautas"])
    expect(plan.created[0]!.externalId).toBe("e9")
    expect(plan.created[0]!.category).toBe("Antojitos")
    expect(plan.created[0]!.tags).toEqual(["frito"])
    expect(plan.unchanged).toEqual(["l1"])
    expect(plan.onlyLocally).toEqual([])
  })

  it("no crea un duplicado cuando el nombre solo cambia de mayúsculas", () => {
    const plan = planMenuSync([local({ id: "l1", name: "Tacos" })], [item({ name: "TACOS" })])
    expect(plan.created).toEqual([])
    expect(plan.unchanged).toEqual(["l1"])
  })

  it("actualiza cuando cambia el precio", () => {
    const plan = planMenuSync([local({ id: "l1" })], [item({ price: 50 })])
    expect(plan.updated).toHaveLength(1)
    expect(plan.updated[0]!.id).toBe("l1")
    expect(plan.updated[0]!.item.price).toBe(50)
    expect(plan.unchanged).toEqual([])
    expect(plan.onlyLocally).toEqual([])
  })

  it("actualiza cuando cambia la descripción", () => {
    const plan = planMenuSync(
      [local({ id: "l1", description: null })],
      [item({ description: "Ahora con queso extra" })],
    )
    expect(plan.updated.map((entry) => entry.id)).toEqual(["l1"])
    expect(plan.updated[0]!.item.description).toBe("Ahora con queso extra")
  })

  it("actualiza cuando el proveedor quita la descripción", () => {
    const plan = planMenuSync([local({ id: "l1", description: "Con piña" })], [item({ description: null })])
    expect(plan.updated.map((entry) => entry.id)).toEqual(["l1"])
  })

  it("no marca cambios por precio ni descripción equivalentes", () => {
    const plan = planMenuSync(
      [local({ id: "l1", price: 45, description: "" })],
      [item({ price: 45, description: null })]
    )
    expect(plan.updated).toEqual([])
    expect(plan.unchanged).toEqual(["l1"])
  })

  it("no marca cambios por diferencias de precio por debajo del centavo", () => {
    expect(planMenuSync([local({ id: "l1", price: 45 })], [item({ price: 45.001 })]).updated).toEqual([])
    expect(planMenuSync([local({ id: "l1", price: 45 })], [item({ price: 44.999 })]).updated).toEqual([])
    expect(planMenuSync([local({ id: "l1", price: 45 })], [item({ price: 45.01 })]).updated).toHaveLength(1)
  })

  it("empareja sin distinguir mayúsculas, espacios de más ni tabuladores", () => {
    const plan = planMenuSync(
      [local({ id: "l1", name: "  Tacos   al  pastor " })],
      [item({ name: "TACOS\tal  PASTOR" })]
    )
    expect(plan.created).toEqual([])
    expect(plan.unchanged).toEqual(["l1"])
    expect(plan.onlyLocally).toEqual([])
  })

  it("no confunde un platillo con otro que empieza igual", () => {
    const plan = planMenuSync(
      [local({ id: "l1", name: "Tacos" })],
      [item({ name: "Tacos al pastor" })]
    )
    expect(plan.created.map((entry) => entry.name)).toEqual(["Tacos al pastor"])
    expect(plan.onlyLocally).toEqual(["l1"])
  })

  it("cada platillo local cae en una sola cubeta", () => {
    const plan = planMenuSync(
      [
        local({ id: "l1", name: "Tacos", price: 45 }),
        local({ id: "l2", name: "Quesadilla", price: 35 }),
        local({ id: "l3", name: "Especial de la casa", price: 120 }),
      ],
      [item({ name: "Tacos", price: 45 }), item({ externalId: "e2", name: "Quesadilla", price: 40 })]
    )
    expect(bucketsOf(plan, "l1")).toEqual(["unchanged"])
    expect(bucketsOf(plan, "l2")).toEqual(["updated"])
    expect(bucketsOf(plan, "l3")).toEqual(["onlyLocally"])
  })

  it("ignora un platillo local sin nombre utilizable", () => {
    const plan = planMenuSync(
      [local({ id: "l1", name: "   " }), local({ id: "l2", name: "Tacos" })],
      [item({ name: "Tacos" })]
    )
    expect(plan.onlyLocally).toEqual([])
    expect(plan.unchanged).toEqual(["l2"])
  })

  it("sin menú local todo lo del proveedor se crea", () => {
    const plan = planMenuSync([], [item({ name: "Tacos" }), item({ externalId: "e2", name: "Flautas" })])
    expect(plan.created.map((entry) => entry.name)).toEqual(["Tacos", "Flautas"])
    expect(plan.updated).toEqual([])
    expect(plan.unchanged).toEqual([])
    expect(plan.onlyLocally).toEqual([])
  })

  it("sin instantánea del proveedor no propone altas ni bajas", () => {
    const plan = planMenuSync([local({ id: "l1" })], [])
    expect(plan.created).toEqual([])
    expect(plan.updated).toEqual([])
    expect(plan.unchanged).toEqual([])
    expect(plan.onlyLocally).toEqual(["l1"])
  })

  it("con los dos menús vacíos devuelve un plan vacío", () => {
    expect(planMenuSync([], [])).toEqual({
      created: [],
      updated: [],
      unchanged: [],
      onlyLocally: [],
    })
  })

  it("no modifica las entradas que recibe", () => {
    const localItems = [local({ id: "l1", name: " Tacos " })]
    const snapshot = [item({ name: "TACOS", price: 50 })]
    planMenuSync(localItems, snapshot)
    expect(localItems[0]!.name).toBe(" Tacos ")
    expect(snapshot[0]!.name).toBe("TACOS")
    expect(snapshot[0]!.price).toBe(50)
  })

  it("caracterización: con dos platillos locales del mismo nombre solo empareja el primero", () => {
    // `foodos_menu_items` no tiene UNIQUE por nombre, así que dos filas pueden
    // compartir nombre. La segunda no se sincroniza ni se reporta.
    const plan = planMenuSync(
      [local({ id: "l1", price: 45 }), local({ id: "l2", price: 99 })],
      [item({ price: 45 })]
    )
    expect(plan.unchanged).toEqual(["l1"])
    expect(plan.updated).toEqual([])
    expect(plan.onlyLocally).toEqual([])
  })

  it("caracterización: una instantánea con el nombre repetido duplica la entrada del mismo id", () => {
    // En producción no ocurre: `normalizeMenuSnapshot` deduplica por nombre
    // antes de llamar aquí. Se fija el comportamiento actual de la función pura.
    const plan = planMenuSync([local({ id: "l1", price: 45 })], [item({ price: 45 }), item({ price: 50 })])
    expect(plan.unchanged).toEqual(["l1"])
    expect(plan.updated.map((entry) => entry.id)).toEqual(["l1"])
  })
})
