import { describe, expect, it } from "vitest"
import {
  MIXED_PAYMENT_METHOD,
  breakdownCashCents,
  breakdownTotalCents,
  derivePaymentMethod,
  derivePaymentStatus,
  isPaymentMethod,
  normalizePaymentBreakdown,
  validatePaymentBreakdown,
} from "./foodos-payments"
import type { FoodosPaymentBreakdown } from "@/types/foodos"

const bd = (parts: [string, number][], extra: Partial<FoodosPaymentBreakdown> = {}) => ({
  parts: parts.map(([method, amount]) => ({ method, amount })),
  ...extra,
})

describe("isPaymentMethod", () => {
  it("acepta el vocabulario canónico", () => {
    for (const m of ["cash", "card", "transfer", "branch", "whatsapp"]) {
      expect(isPaymentMethod(m)).toBe(true)
    }
  })

  it("rechaza lo que no es una forma de pago", () => {
    expect(isPaymentMethod("bitcoin")).toBe(false)
    expect(isPaymentMethod("mixed")).toBe(false)
    expect(isPaymentMethod(null)).toBe(false)
    expect(isPaymentMethod(7)).toBe(false)
  })
})

describe("breakdownTotalCents / breakdownCashCents", () => {
  it("suma las partes en centavos enteros", () => {
    expect(breakdownTotalCents(bd([["cash", 100.5], ["card", 49.5]]))).toBe(15000)
  })

  it("no se pierde por aritmética de flotantes", () => {
    expect(breakdownTotalCents(bd([["cash", 0.1], ["card", 0.2]]))).toBe(30)
  })

  it("separa sólo la parte en efectivo", () => {
    const b = bd([["cash", 50], ["card", 30], ["transfer", 20]])
    expect(breakdownCashCents(b)).toBe(5000)
    expect(breakdownTotalCents(b)).toBe(10000)
  })

  it("sin efectivo devuelve cero", () => {
    expect(breakdownCashCents(bd([["card", 200]]))).toBe(0)
  })
})

describe("validatePaymentBreakdown", () => {
  it("acepta un desglose que cuadra exactamente", () => {
    expect(validatePaymentBreakdown(bd([["cash", 60], ["card", 40]]), 100)).toEqual({ ok: true })
  })

  it("acepta un pago único", () => {
    expect(validatePaymentBreakdown(bd([["cash", 100]]), 100)).toEqual({ ok: true })
  })

  it("cuadra en centavos aunque el flotante mienta", () => {
    expect(validatePaymentBreakdown(bd([["cash", 0.1], ["card", 0.2]]), 0.3)).toEqual({ ok: true })
  })

  it("rechaza un desglose vacío", () => {
    expect(validatePaymentBreakdown({ parts: [] }, 100)).toMatchObject({ ok: false })
  })

  it("rechaza un desglose que suma de menos", () => {
    const result = validatePaymentBreakdown(bd([["cash", 60]]), 100)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("El desglose del cobro suma 60 y el total es 100")
  })

  it("rechaza un desglose que suma de más", () => {
    expect(validatePaymentBreakdown(bd([["cash", 140]]), 100).ok).toBe(false)
  })

  it("rechaza una forma de pago inventada", () => {
    expect(validatePaymentBreakdown(bd([["bitcoin", 100]]), 100)).toMatchObject({ ok: false })
  })

  it("rechaza montos de cero o negativos", () => {
    expect(validatePaymentBreakdown(bd([["cash", 0], ["card", 100]]), 100).ok).toBe(false)
    expect(validatePaymentBreakdown(bd([["cash", -10], ["card", 110]]), 100).ok).toBe(false)
  })

  it("exige que lo recibido cubra la parte en efectivo", () => {
    expect(validatePaymentBreakdown(bd([["cash", 100]], { received: 80 }), 100).ok).toBe(false)
    expect(validatePaymentBreakdown(bd([["cash", 100]], { received: 200 }), 100)).toEqual({ ok: true })
  })

  it("ignora `received` cuando no hubo efectivo", () => {
    expect(validatePaymentBreakdown(bd([["card", 100]], { received: 1 }), 100)).toEqual({ ok: true })
  })
})

describe("normalizePaymentBreakdown", () => {
  it("recalcula el cambio en servidor a partir de lo recibido", () => {
    const result = normalizePaymentBreakdown(bd([["cash", 80], ["card", 20]], { received: 100 }))
    expect(result.change).toBe(20)
  })

  it("descarta un cambio que el navegador inventó", () => {
    const result = normalizePaymentBreakdown(
      bd([["cash", 80], ["card", 20]], { received: 100, change: 999 })
    )
    expect(result.change).toBe(20)
  })

  it("nunca devuelve un cambio negativo", () => {
    const result = normalizePaymentBreakdown(bd([["cash", 100]], { received: 100 }))
    expect(result.change).toBeNull()
  })

  it("redondea cada parte a centavos", () => {
    const result = normalizePaymentBreakdown(bd([["cash", 33.333], ["card", 66.667]]))
    expect(result.parts).toEqual([
      { method: "cash", amount: 33.33 },
      { method: "card", amount: 66.67 },
    ])
  })

  it("no guarda `received` si no hubo efectivo", () => {
    const result = normalizePaymentBreakdown(bd([["card", 100]]))
    expect(result.received).toBeNull()
    expect(result.change).toBeNull()
  })
})

describe("derivePaymentMethod", () => {
  it("resume un cobro combinado como mixed", () => {
    expect(derivePaymentMethod(bd([["cash", 60], ["card", 40]]), null)).toBe(MIXED_PAYMENT_METHOD)
  })

  it("con una sola parte guarda esa forma, no mixed", () => {
    expect(derivePaymentMethod(bd([["transfer", 100]]), null)).toBe("transfer")
  })

  it("sin desglose cae al método que mandó el cliente", () => {
    expect(derivePaymentMethod(undefined, "cash")).toBe("cash")
    expect(derivePaymentMethod(undefined, null)).toBeNull()
    expect(derivePaymentMethod(undefined, undefined)).toBeNull()
    expect(derivePaymentMethod(undefined, "")).toBeNull()
  })

  it("un desglose vacío no pisa el método del cliente", () => {
    expect(derivePaymentMethod({ parts: [] }, "card")).toBe("card")
  })
})

describe("derivePaymentStatus", () => {
  it("en el mostrador todo queda pagado: nadie cierra una venta sin cobrar", () => {
    expect(derivePaymentStatus("cash", true)).toBe("paid")
    expect(derivePaymentStatus("card", true)).toBe("paid")
    expect(derivePaymentStatus("mixed", true)).toBe("paid")
  })

  it("una cuenta de mesa abierta queda pendiente", () => {
    expect(derivePaymentStatus("cash", false)).toBe("pending")
  })

  it("en línea tarjeta y transferencia esperan confirmación", () => {
    expect(derivePaymentStatus("card", undefined)).toBe("pending")
    expect(derivePaymentStatus("transfer", undefined)).toBe("pending")
  })

  it("en línea efectivo y sucursal se dan por cobrados", () => {
    expect(derivePaymentStatus("cash", undefined)).toBe("paid")
    expect(derivePaymentStatus("branch", undefined)).toBe("paid")
    expect(derivePaymentStatus("whatsapp", undefined)).toBe("paid")
    expect(derivePaymentStatus(null, undefined)).toBe("paid")
  })
})
