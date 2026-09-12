import { describe, it, expect } from "vitest"
import {
  buildNewOrderEvent,
  parseNotifPrefs,
  serializeNotifPrefs,
  pushEvent,
  DEFAULT_NOTIF_PREFS,
  MAX_NOTIFICATION_EVENTS,
  type AdminNotificationEvent,
} from "./order-notifications"

describe("buildNewOrderEvent", () => {
  it("primera carga (prev null) no genera evento", () => {
    expect(buildNewOrderEvent(null, 5)).toBeNull()
  })

  it("conteo igual o menor no genera evento", () => {
    expect(buildNewOrderEvent(3, 3)).toBeNull()
    expect(buildNewOrderEvent(3, 1)).toBeNull()
  })

  it("un pedido nuevo usa singular", () => {
    expect(buildNewOrderEvent(2, 3)).toBe("Nuevo pedido recibido")
  })

  it("varios pedidos nuevos usa plural con conteo", () => {
    expect(buildNewOrderEvent(0, 4)).toBe("4 pedidos nuevos recibidos")
  })
})

describe("parseNotifPrefs", () => {
  it("devuelve defaults ante JSON inválido o tipos incorrectos", () => {
    expect(parseNotifPrefs(null)).toEqual(DEFAULT_NOTIF_PREFS)
    expect(parseNotifPrefs("no json")).toEqual(DEFAULT_NOTIF_PREFS)
    expect(parseNotifPrefs('{"sound":"si"}')).toEqual(DEFAULT_NOTIF_PREFS)
  })

  it("conserva preferencias válidas y rellena faltantes", () => {
    expect(parseNotifPrefs('{"sound":false}')).toEqual({ sound: false, browser: false })
    expect(parseNotifPrefs('{"browser":true}')).toEqual({ sound: true, browser: true })
  })

  it("roundtrip serialize/parse", () => {
    const prefs = { sound: false, browser: true }
    expect(parseNotifPrefs(serializeNotifPrefs(prefs))).toEqual(prefs)
  })
})

describe("pushEvent", () => {
  const ev = (id: string): AdminNotificationEvent => ({ id, message: id, at: "2026-09-12T00:00:00Z" })

  it("inserta al frente", () => {
    expect(pushEvent([ev("a")], ev("b")).map((e) => e.id)).toEqual(["b", "a"])
  })

  it("recorta al máximo de eventos", () => {
    const many = Array.from({ length: MAX_NOTIFICATION_EVENTS }, (_, i) => ev(`e${i}`))
    const next = pushEvent(many, ev("nuevo"))
    expect(next).toHaveLength(MAX_NOTIFICATION_EVENTS)
    expect(next[0]!.id).toBe("nuevo")
  })
})
