import { describe, it, expect } from "vitest"
import { auditTitle, auditBody, type AdminAuditInput } from "./audit"

const base: AdminAuditInput = {
  actorId: "12345678-abcd-0000-0000-000000000000",
  action: "order_status_changed",
  orderId: 42,
  detail: "pending → confirmed",
}

describe("auditTitle", () => {
  it("describe la acción sobre el pedido", () => {
    expect(auditTitle(base)).toBe("Pedido #42: cambió el estado")
  })

  it.each([
    ["order_payment_confirmed", "confirmó el pago"],
    ["order_driver_assigned", "asignó repartidor"],
    ["order_driver_unassigned", "quitó el repartidor"],
  ] as const)("etiqueta %s", (action, label) => {
    expect(auditTitle({ ...base, action })).toContain(label)
  })
})

describe("auditBody", () => {
  it("incluye el actor truncado (sin exponer el UUID completo) y el detalle", () => {
    const body = auditBody(base)
    expect(body).toContain("12345678")
    expect(body).not.toContain("abcd")
    expect(body).toContain("pending → confirmed")
  })
})
