import { describe, expect, it } from "vitest"

import {
  FOODOS_ALERT_TYPES,
  countUnreadAlerts,
  filterFoodosAlerts,
  isFoodosAlertType,
  relativeTime,
  type ServerNotification,
} from "./foodos-alerts"

function row(over: Partial<ServerNotification> = {}): ServerNotification {
  return {
    id: 1,
    type: "foodos_order_created",
    title: "🧾 Pedido nuevo · #ABCDEF",
    body: "Pedido #ABCDEF · $250.00 MXN",
    action_url: "/panel/foodos/pedidos/11111111-2222-3333-4444-abcdef",
    order_id: null,
    read_at: null,
    created_at: "2026-01-01T10:00:00.000Z",
    ...over,
  }
}

describe("filterFoodosAlerts", () => {
  it("deja fuera los avisos que no son de FoodOS", () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 2, type: "cashback_credited" }),
      row({ id: 3, type: "order_delivered" }),
      row({ id: 4, type: "foodos_payment_proof_pending" }),
    ]

    expect(filterFoodosAlerts(rows).map((r) => r.id)).toEqual([1, 4])
  })

  it("ordena por fecha descendente aunque la entrada venga al revés", () => {
    const rows = [
      row({ id: 1, created_at: "2026-01-01T10:00:00.000Z" }),
      row({ id: 2, created_at: "2026-01-03T10:00:00.000Z" }),
      row({ id: 3, created_at: "2026-01-02T10:00:00.000Z" }),
    ]

    expect(filterFoodosAlerts(rows).map((r) => r.id)).toEqual([2, 3, 1])
  })

  it("no muta el arreglo original", () => {
    const rows = [
      row({ id: 1, created_at: "2026-01-01T10:00:00.000Z" }),
      row({ id: 2, created_at: "2026-01-03T10:00:00.000Z" }),
    ]

    filterFoodosAlerts(rows)

    expect(rows.map((r) => r.id)).toEqual([1, 2])
  })

  it("con una lista vacía devuelve vacío", () => {
    expect(filterFoodosAlerts([])).toEqual([])
  })
})

describe("countUnreadAlerts", () => {
  it("cuenta solo las que no tienen read_at", () => {
    const rows = [
      row({ id: 1, read_at: null }),
      row({ id: 2, read_at: "2026-01-02T10:00:00.000Z" }),
      row({ id: 3, read_at: null }),
    ]

    expect(countUnreadAlerts(rows)).toBe(2)
  })

  it("una lista vacía tiene cero sin leer", () => {
    expect(countUnreadAlerts([])).toBe(0)
  })
})

describe("isFoodosAlertType", () => {
  it("reconoce exactamente los tipos declarados", () => {
    for (const type of FOODOS_ALERT_TYPES) {
      expect(isFoodosAlertType(type)).toBe(true)
    }
  })

  it("no confunde un tipo de FoodOS con uno del marketplace", () => {
    expect(isFoodosAlertType("order_created")).toBe(false)
    expect(isFoodosAlertType("foodos_order")).toBe(false)
    expect(isFoodosAlertType("")).toBe(false)
  })
})

describe("relativeTime", () => {
  const now = new Date("2026-01-01T12:00:00.000Z")

  it("describe minutos, horas y días", () => {
    expect(relativeTime("2026-01-01T11:59:30.000Z", now)).toBe("ahora")
    expect(relativeTime("2026-01-01T11:30:00.000Z", now)).toBe("hace 30 min")
    expect(relativeTime("2026-01-01T09:00:00.000Z", now)).toBe("hace 3 h")
    expect(relativeTime("2025-12-29T12:00:00.000Z", now)).toBe("hace 3 d")
  })

  it("una fecha inválida devuelve cadena vacía en vez de NaN", () => {
    expect(relativeTime("no-es-fecha", now)).toBe("")
  })

  it("una fecha futura no produce un número negativo", () => {
    expect(relativeTime("2026-01-01T12:05:00.000Z", now)).toBe("ahora")
  })
})
