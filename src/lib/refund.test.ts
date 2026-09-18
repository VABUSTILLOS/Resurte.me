import { describe, expect, it } from "vitest"
import {
  REFUNDABLE_PAYMENT_STATUSES,
  isRefundableStatus,
  refundableCents,
  resolveRefundOutcome,
} from "./refund"

describe("resolveRefundOutcome", () => {
  it("un reembolso por el total completo marca `refunded`", () => {
    expect(
      resolveRefundOutcome({ totalCents: 80_000, refundAmountCents: 80_000 })
    ).toEqual({ status: "refunded", refundedAmountCents: 80_000 })
  })

  it("un reembolso menor marca `partially_refunded` y conserva el importe", () => {
    // El caso que el código anterior perdía: $50 sobre un pedido de $800 se
    // marcaba `refunded`, y eso disparaba la reversión TOTAL del cashback.
    expect(
      resolveRefundOutcome({ totalCents: 80_000, refundAmountCents: 5_000 })
    ).toEqual({ status: "partially_refunded", refundedAmountCents: 5_000 })
  })

  it("acumula reembolsos sucesivos y sólo cierra al llegar al total", () => {
    const primero = resolveRefundOutcome({
      totalCents: 80_000,
      refundAmountCents: 5_000,
    })
    const segundo = resolveRefundOutcome({
      totalCents: 80_000,
      alreadyRefundedCents: primero.refundedAmountCents,
      refundAmountCents: 30_000,
    })
    expect(segundo).toEqual({ status: "partially_refunded", refundedAmountCents: 35_000 })

    const tercero = resolveRefundOutcome({
      totalCents: 80_000,
      alreadyRefundedCents: segundo.refundedAmountCents,
      refundAmountCents: 45_000,
    })
    expect(tercero).toEqual({ status: "refunded", refundedAmountCents: 80_000 })
  })

  it("satura el acumulado en el total: un webhook reenviado no infla la cifra", () => {
    // `charge.amount_refunded` es acumulativo y Stripe puede reentregar el
    // evento. Sumarlo otra vez daría 160,000 centavos reembolsados sobre un
    // cobro de 80,000.
    const reenvio = resolveRefundOutcome({
      totalCents: 80_000,
      alreadyRefundedCents: 80_000,
      refundAmountCents: 80_000,
    })
    expect(reenvio).toEqual({ status: "refunded", refundedAmountCents: 80_000 })
  })

  it("un total de 0 nunca se declara reembolso total", () => {
    // Sin importe cobrado no hay nada que reembolsar: declarar `refunded`
    // cerraría un pedido que quizá ni se cobró.
    expect(
      resolveRefundOutcome({ totalCents: 0, refundAmountCents: 0 })
    ).toEqual({ status: "partially_refunded", refundedAmountCents: 0 })
  })

  it("ignora entradas negativas o no finitas en lugar de propagarlas", () => {
    expect(
      resolveRefundOutcome({ totalCents: 10_000, refundAmountCents: -500 })
    ).toEqual({ status: "partially_refunded", refundedAmountCents: 0 })
    expect(
      resolveRefundOutcome({
        totalCents: 10_000,
        alreadyRefundedCents: -1,
        refundAmountCents: 10_000,
      })
    ).toEqual({ status: "refunded", refundedAmountCents: 10_000 })
  })
})

describe("refundableCents", () => {
  it("descuenta lo ya reembolsado", () => {
    expect(refundableCents(80_000, 30_000)).toBe(50_000)
  })

  it("devuelve el total cuando no hay reembolsos previos", () => {
    expect(refundableCents(80_000, null)).toBe(80_000)
    expect(refundableCents(80_000, undefined)).toBe(80_000)
  })

  it("nunca devuelve negativos cuando el acumulado supera el total", () => {
    expect(refundableCents(80_000, 90_000)).toBe(0)
  })
})

describe("isRefundableStatus", () => {
  it("acepta `paid` y `partially_refunded`", () => {
    for (const status of REFUNDABLE_PAYMENT_STATUSES) {
      expect(isRefundableStatus(status)).toBe(true)
    }
  })

  it("rechaza los estados donde ya no hay dinero que devolver", () => {
    for (const status of ["pending", "failed", "refunded", "disputed", "expired"]) {
      expect(isRefundableStatus(status)).toBe(false)
    }
  })
})
