import { describe, expect, it } from "vitest"

import {
  applyPaymentRecoveryFilter,
  isExcludedFromPaymentRecovery,
  isPaymentRecoverable,
  paymentRecoveryMethodFilter,
  PAYMENT_RECOVERY_CANCEL_HOURS,
  PAYMENT_RECOVERY_EXCLUDED_METHODS,
  type RecoverablePaymentOrder,
} from "@/lib/payment-recovery"

const order = (over: Partial<RecoverablePaymentOrder> = {}): RecoverablePaymentOrder => ({
  status: "pending",
  payment_status: "pending",
  payment_method: "card",
  ...over,
})

describe("isPaymentRecoverable", () => {
  it("acepta el impago real: pendiente, vivo y por un método que se cobra por adelantado", () => {
    expect(isPaymentRecoverable(order())).toBe(true)
  })

  it("rechaza contra entrega, que es un pedido en espera y no un impago", () => {
    // El caso que este módulo existe para fijar. Un pedido contra entrega nace
    // `pending` porque se paga al recibir; el barrido lo leía como impago y lo
    // cancelaba a las 72 h. En producción eso mató los 4 pedidos contra entrega
    // que existían, a las 87, 83, 83 y 81 horas de crearse.
    expect(isPaymentRecoverable(order({ payment_method: "cash_on_delivery" }))).toBe(false)
  })

  it("acepta OXXO, SPEI y CoDi: el cliente eligió pagar y todavía no lo ha hecho", () => {
    for (const method of ["oxxo", "spei", "codi", "mercado_pago"]) {
      expect(isPaymentRecoverable(order({ payment_method: method }))).toBe(true)
    }
  })

  it("rechaza lo que ya no es un impago pendiente", () => {
    expect(isPaymentRecoverable(order({ status: "cancelled" }))).toBe(false)
    expect(isPaymentRecoverable(order({ payment_status: "paid" }))).toBe(false)
    expect(isPaymentRecoverable(order({ payment_status: "failed" }))).toBe(false)
    expect(isPaymentRecoverable(order({ payment_status: null }))).toBe(false)
  })

  it("acepta un método nulo: no puede confundirse con contra entrega", () => {
    // Decisión explícita y documentada en el módulo: `payment_method` es
    // obligatorio en el alta, así que un nulo es dato histórico, no un pedido en
    // efectivo. Conserva el comportamiento previo en vez de ampliar el arreglo.
    expect(isPaymentRecoverable(order({ payment_method: null }))).toBe(true)
    expect(isPaymentRecoverable(order({ payment_method: undefined }))).toBe(true)
  })
})

describe("isExcludedFromPaymentRecovery", () => {
  it("solo excluye contra entrega", () => {
    expect(isExcludedFromPaymentRecovery("cash_on_delivery")).toBe(true)
    for (const method of ["card", "oxxo", "spei", "codi", "mercado_pago", null, undefined, ""]) {
      expect(isExcludedFromPaymentRecovery(method)).toBe(false)
    }
  })

  it("la lista de excluidos no crece sin querer", () => {
    expect([...PAYMENT_RECOVERY_EXCLUDED_METHODS]).toEqual(["cash_on_delivery"])
  })
})

describe("paymentRecoveryMethodFilter", () => {
  it("incluye el IS NULL explícito, que es lo que hace coincidir SQL y JS", () => {
    // Sin el `is.null`, PostgREST traduce `not.in.(…)` a `NOT (payment_method IN
    // (…))` y `NULL IN (…)` es NULL en SQL, así que la fila quedaría fuera del
    // WHERE mientras `isPaymentRecoverable(null)` devuelve true. La asimetría
    // haría que la consulta y el bucle discreparan sobre las mismas filas.
    expect(paymentRecoveryMethodFilter()).toBe(
      "payment_method.is.null,payment_method.not.in.(cash_on_delivery)"
    )
  })

  it("la condición SQL y el predicado de JS deciden igual sobre los métodos conocidos", () => {
    const excluded = PAYMENT_RECOVERY_EXCLUDED_METHODS as readonly string[]
    for (const method of ["card", "oxxo", "spei", "codi", "mercado_pago"]) {
      expect(excluded.includes(method)).toBe(false)
      expect(isExcludedFromPaymentRecovery(method)).toBe(false)
    }
    for (const method of excluded) {
      expect(isExcludedFromPaymentRecovery(method)).toBe(true)
    }
  })
})

describe("applyPaymentRecoveryFilter", () => {
  it("aplica el filtro sobre el constructor que recibe y devuelve el mismo", () => {
    const calls: string[] = []
    const chain = {
      or(filter: string) {
        calls.push(filter)
        return this
      },
    }
    expect(applyPaymentRecoveryFilter(chain)).toBe(chain)
    expect(calls).toEqual([paymentRecoveryMethodFilter()])
  })

  it("no rompe el encadenado posterior de PostgREST", () => {
    const calls: string[] = []
    const chain = {
      or(filter: string) {
        calls.push(`or:${filter}`)
        return this
      },
      limit(n: number) {
        calls.push(`limit:${n}`)
        return this
      },
    }
    applyPaymentRecoveryFilter(chain).limit(500)
    expect(calls[0]).toMatch(/^or:/)
    expect(calls[1]).toBe("limit:500")
  })
})

describe("umbral de cancelación", () => {
  it("son 72 horas, y el nombre evita que se cambie a ciegas", () => {
    expect(PAYMENT_RECOVERY_CANCEL_HOURS).toBe(72)
  })
})
