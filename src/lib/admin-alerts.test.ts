import { describe, it, expect } from "vitest"
import {
  buildAlertHref,
  sortAlertsBySeverity,
  ADMIN_LEADS_HREF,
  type AdminAlertKind,
  type AdminAlertSeverity,
} from "./admin-alerts"

describe("buildAlertHref", () => {
  it("lleva los pedidos atorados al panel filtrado por pendientes", () => {
    expect(buildAlertHref({ kind: "stale_pending" })).toBe("/admin/pedidos?status=pending")
  })

  it("conserva los deep-links de inventario que ya funcionaban", () => {
    expect(buildAlertHref({ kind: "out_of_stock" })).toBe("/admin/productos?stock=out_of_stock")
    expect(buildAlertHref({ kind: "low_stock" })).toBe("/admin/productos?stock=low_stock")
  })

  it("lleva el cupón por expirar a marketing identificándolo", () => {
    expect(buildAlertHref({ kind: "coupon_expiring", code: "VERANO26" })).toBe(
      "/admin/marketing?code=VERANO26"
    )
  })

  it("escapa códigos con caracteres especiales", () => {
    expect(buildAlertHref({ kind: "coupon_expiring", code: "a&b=c" })).toBe(
      "/admin/marketing?code=a%26b%3Dc"
    )
  })

  it("cae a la lista de cupones si no hay código", () => {
    expect(buildAlertHref({ kind: "coupon_expiring" })).toBe("/admin/marketing")
    expect(buildAlertHref({ kind: "coupon_expiring", code: null })).toBe("/admin/marketing")
    expect(buildAlertHref({ kind: "coupon_expiring", code: "   " })).toBe("/admin/marketing")
  })

  it("lleva los leads nuevos al CRM, no al dashboard", () => {
    const href = buildAlertHref({ kind: "new_leads" })
    expect(href).toBe(ADMIN_LEADS_HREF)
    // Regresión: apuntar a /admin era un auto-enlace que no hacía nada.
    expect(href).not.toBe("/admin")
  })

  it("cubre todos los tipos de alerta sin devolver enlaces vacíos", () => {
    const kinds: AdminAlertKind[] = [
      "stale_pending",
      "out_of_stock",
      "low_stock",
      "coupon_expiring",
      "new_leads",
    ]
    for (const kind of kinds) {
      expect(buildAlertHref({ kind })).toMatch(/^\/admin(\/|\?)/)
    }
  })
})

describe("sortAlertsBySeverity", () => {
  const alert = (severity: AdminAlertSeverity, title: string) => ({ severity, title })

  it("pone las críticas primero y las informativas al final", () => {
    const sorted = sortAlertsBySeverity([
      alert("info", "c"),
      alert("critical", "a"),
      alert("warning", "b"),
    ])
    expect(sorted.map((a) => a.title)).toEqual(["a", "b", "c"])
  })

  it("conserva el orden de llegada dentro de cada severidad", () => {
    const sorted = sortAlertsBySeverity([
      alert("warning", "w1"),
      alert("critical", "c1"),
      alert("warning", "w2"),
      alert("critical", "c2"),
    ])
    expect(sorted.map((a) => a.title)).toEqual(["c1", "c2", "w1", "w2"])
  })

  it("no muta la lista de entrada", () => {
    const input = [alert("info", "c"), alert("critical", "a")]
    const before = input.map((a) => a.title)
    sortAlertsBySeverity(input)
    expect(input.map((a) => a.title)).toEqual(before)
  })

  it("devuelve vacío sin alertas", () => {
    expect(sortAlertsBySeverity([])).toEqual([])
  })
})
