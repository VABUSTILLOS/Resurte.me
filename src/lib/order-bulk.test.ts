import { describe, it, expect } from "vitest"
import {
  areAllSelected,
  bulkCancelConfirmMessage,
  bulkOutcomeMessage,
  bulkOutcomeTone,
  canAssignDriver,
  canChangeStatusTo,
  canConfirmPayment,
  isPartiallySelected,
  isTerminalStatus,
  partitionForDriver,
  partitionForPayment,
  partitionForStatus,
  pruneSelection,
  selectAll,
  summarizeBulkResult,
  toggleSelection,
  BULK_STATUS_TARGETS,
  type BulkOrder,
} from "./order-bulk"

function order(over: Partial<BulkOrder> & { id: number }): BulkOrder {
  return { status: "pending", payment_status: "pending", ...over }
}

describe("isTerminalStatus", () => {
  it("reconoce entregado y cancelado", () => {
    expect(isTerminalStatus("delivered")).toBe(true)
    expect(isTerminalStatus("cancelled")).toBe(true)
  })

  it("no marca estados en curso", () => {
    for (const status of ["pending", "confirmed", "preparing", "out_for_delivery"]) {
      expect(isTerminalStatus(status)).toBe(false)
    }
  })
})

describe("canChangeStatusTo", () => {
  it("permite avanzar desde un estado en curso", () => {
    expect(canChangeStatusTo(order({ id: 1 }), "confirmed")).toBe(true)
    expect(canChangeStatusTo(order({ id: 1, status: "confirmed" }), "delivered")).toBe(true)
  })

  it("rechaza el estado actual para no emitir PATCHs no-op", () => {
    expect(canChangeStatusTo(order({ id: 1, status: "preparing" }), "preparing")).toBe(false)
  })

  it("rechaza destinos vacíos o desconocidos", () => {
    expect(canChangeStatusTo(order({ id: 1 }), "")).toBe(false)
    expect(canChangeStatusTo(order({ id: 1 }), "enviado")).toBe(false)
    expect(canChangeStatusTo(order({ id: 1 }), "PAID")).toBe(false)
  })

  it("rechaza partir de un estado terminal", () => {
    expect(canChangeStatusTo(order({ id: 1, status: "cancelled" }), "pending")).toBe(false)
    expect(canChangeStatusTo(order({ id: 1, status: "delivered" }), "confirmed")).toBe(false)
  })

  it("acepta los seis destinos ofrecidos por la barra", () => {
    const target = order({ id: 1 })
    for (const status of BULK_STATUS_TARGETS) {
      expect(canChangeStatusTo(target, status)).toBe(status !== "pending")
    }
  })
})

describe("canConfirmPayment", () => {
  it("permite confirmar un pago pendiente", () => {
    expect(canConfirmPayment(order({ id: 1, payment_status: "pending" }))).toBe(true)
    expect(canConfirmPayment(order({ id: 1, payment_status: "failed" }))).toBe(true)
  })

  it("rechaza lo ya pagado", () => {
    expect(canConfirmPayment(order({ id: 1, payment_status: "paid" }))).toBe(false)
  })

  it("rechaza pedidos cancelados", () => {
    expect(
      canConfirmPayment(order({ id: 1, status: "cancelled", payment_status: "failed" }))
    ).toBe(false)
  })
})

describe("canAssignDriver", () => {
  it("permite asignar en pedidos en curso", () => {
    expect(canAssignDriver(order({ id: 1, status: "out_for_delivery" }))).toBe(true)
  })

  it("rechaza pedidos terminales", () => {
    expect(canAssignDriver(order({ id: 1, status: "delivered" }))).toBe(false)
    expect(canAssignDriver(order({ id: 1, status: "cancelled" }))).toBe(false)
  })
})

describe("particiones de elegibilidad", () => {
  const orders = [
    order({ id: 1, status: "pending" }),
    order({ id: 2, status: "confirmed" }),
    order({ id: 3, status: "delivered" }),
    order({ id: 4, status: "cancelled" }),
  ]

  it("separa elegibles de omitidos respetando la selección", () => {
    const selected = new Set([1, 3, 4])
    expect(partitionForStatus(orders, selected, "preparing")).toEqual({
      eligible: [1],
      skipped: [3, 4],
    })
  })

  it("ignora ids seleccionados que no están en la lista", () => {
    const result = partitionForPayment(orders, new Set([99]))
    expect(result).toEqual({ eligible: [], skipped: [] })
  })

  it("confirmación de pago omite a los ya pagados", () => {
    const withPaid = [order({ id: 1 }), order({ id: 2, payment_status: "paid" })]
    expect(partitionForPayment(withPaid, new Set([1, 2]))).toEqual({
      eligible: [1],
      skipped: [2],
    })
  })

  it("asignación de repartidor omite terminales", () => {
    expect(partitionForDriver(orders, new Set([1, 2, 3]))).toEqual({
      eligible: [1, 2],
      skipped: [3],
    })
  })
})

describe("selección", () => {
  it("alterna ids", () => {
    const one = toggleSelection(new Set<number>(), 5)
    expect([...one]).toEqual([5])
    expect([...toggleSelection(one, 5)]).toEqual([])
  })

  it("toggle no muta el conjunto original", () => {
    const original = new Set([1])
    toggleSelection(original, 2)
    expect([...original]).toEqual([1])
  })

  it("selectAll toma los ids visibles", () => {
    expect([...selectAll([1, 2, 3])]).toEqual([1, 2, 3])
  })

  it("pruneSelection devuelve la misma referencia si no hay nada que podar", () => {
    const current = new Set([1, 2])
    expect(pruneSelection(current, [1, 2, 3])).toBe(current)
  })

  it("pruneSelection descarta ids que salieron de la lista", () => {
    expect([...pruneSelection(new Set([1, 2, 3]), [2, 3, 4])]).toEqual([2, 3])
  })

  it("pruneSelection sobre selección vacía no asigna", () => {
    const empty = new Set<number>()
    expect(pruneSelection(empty, [1])).toBe(empty)
  })

  it("areAllSelected es falso sin filas visibles", () => {
    expect(areAllSelected([], new Set())).toBe(false)
    expect(areAllSelected([1, 2], new Set([1, 2]))).toBe(true)
    expect(areAllSelected([1, 2], new Set([1]))).toBe(false)
  })

  it("isPartiallySelected solo con selección parcial", () => {
    expect(isPartiallySelected([1, 2], new Set())).toBe(false)
    expect(isPartiallySelected([1, 2], new Set([1]))).toBe(true)
    expect(isPartiallySelected([1, 2], new Set([1, 2]))).toBe(false)
  })
})

describe("resumen del resultado", () => {
  it("cuenta aplicados y fallidos", () => {
    const outcome = summarizeBulkResult(
      [
        { id: 1, ok: true },
        { id: 2, ok: false, error: "409" },
        { id: 3, ok: true },
      ],
      2
    )
    expect(outcome).toEqual({ ok: 2, skipped: 2, failed: 1 })
  })

  it("redacta el mensaje con plurales correctos", () => {
    expect(bulkOutcomeMessage({ ok: 1, skipped: 0, failed: 0 })).toBe("1 aplicado")
    expect(bulkOutcomeMessage({ ok: 3, skipped: 2, failed: 1 })).toBe(
      "3 aplicados · 2 omitidos · 1 con error"
    )
  })

  it("elige el tono del toast por severidad", () => {
    expect(bulkOutcomeTone({ ok: 2, skipped: 0, failed: 0 })).toBe("success")
    expect(bulkOutcomeTone({ ok: 2, skipped: 1, failed: 0 })).toBe("warning")
    expect(bulkOutcomeTone({ ok: 0, skipped: 0, failed: 0 })).toBe("warning")
    expect(bulkOutcomeTone({ ok: 1, skipped: 1, failed: 1 })).toBe("error")
  })

  it("la confirmación de cancelación usa singular y plural", () => {
    expect(bulkCancelConfirmMessage(1)).toContain("1 pedido")
    expect(bulkCancelConfirmMessage(4)).toContain("4 pedidos")
    expect(bulkCancelConfirmMessage(4)).toContain("cupón")
  })
})
