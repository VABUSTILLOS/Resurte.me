import { describe, expect, it } from "vitest"

import {
  ABANDONED_CART_EXCLUDED_METHODS,
  ABANDONED_CART_MIN_AGE_HOURS,
  abandonedCartMethodFilter,
  ageHoursOf,
  applyAbandonedCartFilter,
  isAbandonedCartOrder,
  isExcludedPaymentMethod,
  type AbandonableOrder,
} from "@/lib/abandoned-cart"

const order = (over: Partial<AbandonableOrder> = {}): AbandonableOrder => ({
  status: "pending",
  payment_status: "pending",
  payment_method: "card",
  ...over,
})

describe("isAbandonedCartOrder", () => {
  it("acepta el carrito vivo sin pagar por un método que puede abandonarse", () => {
    expect(isAbandonedCartOrder(order())).toBe(true)
  })

  it("rechaza todo lo que ya no es un carrito vivo", () => {
    expect(isAbandonedCartOrder(order({ status: "paid" }))).toBe(false)
    expect(isAbandonedCartOrder(order({ status: "cancelled" }))).toBe(false)
    expect(isAbandonedCartOrder(order({ payment_status: "paid" }))).toBe(false)
    expect(isAbandonedCartOrder(order({ payment_status: "failed" }))).toBe(false)
  })

  it("rechaza contra entrega, que es un pedido en espera y no un abandono", () => {
    expect(isAbandonedCartOrder(order({ payment_method: "cash_on_delivery" }))).toBe(false)
  })

  it("acepta OXXO, SPEI y CoDi: el cliente eligió pagar y todavía no ha pagado", () => {
    for (const method of ["oxxo", "spei", "codi"]) {
      expect(isAbandonedCartOrder(order({ payment_method: method }))).toBe(true)
    }
  })

  it("acepta el pedido sin método de pago: nunca llegó a elegir cómo pagar", () => {
    expect(isAbandonedCartOrder(order({ payment_method: null }))).toBe(true)
  })

  it("solo aplica la edad mínima cuando se le pasa la edad", () => {
    const fresh = order()
    expect(isAbandonedCartOrder(fresh)).toBe(true)
    expect(isAbandonedCartOrder(fresh, ABANDONED_CART_MIN_AGE_HOURS - 0.5)).toBe(false)
    expect(isAbandonedCartOrder(fresh, ABANDONED_CART_MIN_AGE_HOURS)).toBe(true)
    expect(isAbandonedCartOrder(fresh, 74)).toBe(true)
    expect(isAbandonedCartOrder(fresh, null)).toBe(true)
  })
})

describe("isExcludedPaymentMethod", () => {
  it("solo excluye contra entrega, y trata null y undefined como no excluidos", () => {
    expect(ABANDONED_CART_EXCLUDED_METHODS).toEqual(["cash_on_delivery"])
    expect(isExcludedPaymentMethod("cash_on_delivery")).toBe(true)
    expect(isExcludedPaymentMethod("card")).toBe(false)
    expect(isExcludedPaymentMethod(null)).toBe(false)
    expect(isExcludedPaymentMethod(undefined)).toBe(false)
    expect(isExcludedPaymentMethod("")).toBe(false)
  })
})

describe("ageHoursOf", () => {
  it("mide horas transcurridas", () => {
    const now = new Date("2026-03-01T12:00:00Z")
    expect(ageHoursOf("2026-03-01T10:00:00Z", now)).toBe(2)
    expect(ageHoursOf("2026-02-28T12:00:00Z", now)).toBe(24)
  })

  it("devuelve null con una fecha inválida en vez de NaN", () => {
    expect(ageHoursOf("no-es-fecha")).toBeNull()
  })
})

describe("abandonedCartMethodFilter", () => {
  /**
   * Guarda contra la deriva JS/SQL: PostgREST traduce `not.in.(…)` a
   * `NOT (payment_method IN (…))`, que descarta las filas con `NULL` porque
   * `NULL IN (…)` es `NULL`. Sin el `is.null` el panel contaría un abandono que
   * el motor nunca contactaría.
   */
  it("incluye explícitamente payment_method IS NULL", () => {
    expect(abandonedCartMethodFilter()).toBe(
      "payment_method.is.null,payment_method.not.in.(cash_on_delivery)",
    )
    expect(abandonedCartMethodFilter()).toContain("payment_method.is.null")
  })

  it("deriva la lista de exclusión de la constante", () => {
    for (const method of ABANDONED_CART_EXCLUDED_METHODS) {
      expect(abandonedCartMethodFilter()).toContain(method)
    }
  })
})

describe("applyAbandonedCartFilter", () => {
  it("aplica las tres condiciones del predicado en la misma consulta", () => {
    const calls: string[] = []
    const chain = {
      eq: (column: string, value: string) => {
        calls.push(`eq:${column}=${value}`)
        return chain
      },
      or: (filter: string) => {
        calls.push(`or:${filter}`)
        return chain
      },
    }

    const result = applyAbandonedCartFilter(chain)

    expect(result).toBe(chain)
    expect(calls).toEqual([
      "eq:status=pending",
      "eq:payment_status=pending",
      `or:${abandonedCartMethodFilter()}`,
    ])
  })

  it("devuelve el mismo objeto que recibe para no romper el encadenado", () => {
    const chain = { eq: () => chain, or: () => chain }
    expect(applyAbandonedCartFilter(chain)).toBe(chain)
  })
})
