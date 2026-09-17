import { describe, expect, it } from "vitest"
import {
  CUSTODY_HELP,
  CUSTODY_LABEL,
  CONNECT_STATE_LABEL,
  MAX_PAYOUT_AMOUNT,
  MIN_PAYOUT_NOTE,
  MIN_PAYOUT_REFERENCE,
  custodyMode,
  formatOutstanding,
  formatPayoutAmount,
  formatPayoutPeriodLabel,
  parseAmountInput,
  parseIsoDate,
  summarizePayoutBalances,
  validatePayoutInput,
  type PayoutBalanceRow,
} from "./foodos-payouts"

const UUID = "11111111-2222-3333-4444-555555555555"

function balance(over: Partial<PayoutBalanceRow> = {}): PayoutBalanceRow {
  return {
    restaurantId: UUID,
    restaurantName: "Taquería",
    restaurantSlug: "taqueria",
    platformFeePercent: 0,
    stripeAccountId: null,
    connectChargeable: false,
    grossCollected: 0,
    custodyOrderCount: 0,
    settledTotal: 0,
    feeTotal: 0,
    outstanding: 0,
    payoutCount: 0,
    lastPayoutAt: null,
    ...over,
  }
}

function validInput(over: Record<string, unknown> = {}) {
  return {
    restaurantId: UUID,
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    settledAmount: 900,
    feeAmount: 100,
    reference: "SPEI-4471",
    notes: "Dispersión de enero",
    ...over,
  }
}

describe("parseIsoDate", () => {
  it("acepta una fecha ISO real", () => {
    expect(parseIsoDate("2026-01-31")).toBe("2026-01-31")
  })

  it("recorta espacios", () => {
    expect(parseIsoDate("  2026-02-01 ")).toBe("2026-02-01")
  })

  it("rechaza un día imposible del calendario", () => {
    expect(parseIsoDate("2026-02-30")).toBeNull()
    expect(parseIsoDate("2026-04-31")).toBeNull()
    expect(parseIsoDate("2026-13-01")).toBeNull()
    expect(parseIsoDate("2026-00-10")).toBeNull()
    expect(parseIsoDate("2026-01-00")).toBeNull()
  })

  it("acepta el 29 de febrero de un año bisiesto y rechaza el de uno común", () => {
    expect(parseIsoDate("2028-02-29")).toBe("2028-02-29")
    expect(parseIsoDate("2026-02-29")).toBeNull()
  })

  it("rechaza formatos que no son YYYY-MM-DD", () => {
    expect(parseIsoDate("2026-1-1")).toBeNull()
    expect(parseIsoDate("31/01/2026")).toBeNull()
    expect(parseIsoDate("2026-01-31T00:00:00Z")).toBeNull()
    expect(parseIsoDate("")).toBeNull()
  })

  it("rechaza años fuera del rango sano", () => {
    expect(parseIsoDate("1999-01-01")).toBeNull()
    expect(parseIsoDate("2101-01-01")).toBeNull()
  })

  it("rechaza lo que no sea string", () => {
    expect(parseIsoDate(null)).toBeNull()
    expect(parseIsoDate(20260131)).toBeNull()
    expect(parseIsoDate(undefined)).toBeNull()
  })
})

describe("parseAmountInput", () => {
  it("acepta números y los redondea a centavos", () => {
    expect(parseAmountInput(1234.5)).toBe(1234.5)
    expect(parseAmountInput(10.005)).toBe(10.01)
    expect(parseAmountInput(0)).toBe(0)
  })

  it("rechaza números no finitos", () => {
    expect(parseAmountInput(Number.NaN)).toBeNull()
    expect(parseAmountInput(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it("acepta texto simple y con signo de pesos", () => {
    expect(parseAmountInput("1234.50")).toBe(1234.5)
    expect(parseAmountInput("$1234.50")).toBe(1234.5)
    expect(parseAmountInput(" $ 1,234.50 ")).toBe(1234.5)
  })

  it("trata la coma sola con 1 o 2 dígitos como separador decimal", () => {
    expect(parseAmountInput("1234,50")).toBe(1234.5)
    expect(parseAmountInput("1234,5")).toBe(1234.5)
  })

  it("trata la coma de miles como separador de miles", () => {
    expect(parseAmountInput("1,234")).toBe(1234)
    expect(parseAmountInput("1,234,567.89")).toBe(1234567.89)
  })

  it("conserva el signo negativo", () => {
    expect(parseAmountInput("-500")).toBe(-500)
    expect(parseAmountInput("-500.25")).toBe(-500.25)
  })

  it("rechaza basura", () => {
    expect(parseAmountInput("")).toBeNull()
    expect(parseAmountInput("abc")).toBeNull()
    expect(parseAmountInput("12abc")).toBeNull()
    expect(parseAmountInput("1.2.3")).toBeNull()
    expect(parseAmountInput(null)).toBeNull()
    expect(parseAmountInput({})).toBeNull()
  })
})

describe("formatPayoutPeriodLabel", () => {
  it("colapsa un periodo dentro del mismo mes", () => {
    expect(formatPayoutPeriodLabel("2026-01-01", "2026-01-31")).toBe("1 al 31 ene 2026")
  })

  it("nombra el mes de inicio cuando el rango cruza meses del mismo año", () => {
    expect(formatPayoutPeriodLabel("2026-01-15", "2026-02-14")).toBe("15 ene al 14 feb 2026")
  })

  it("imprime ambos años cuando el rango cruza el año", () => {
    expect(formatPayoutPeriodLabel("2025-12-20", "2026-01-05")).toBe("20 dic 2025 al 5 ene 2026")
  })

  it("nombra los huecos en vez de imprimirlos vacíos", () => {
    expect(formatPayoutPeriodLabel(null, null)).toBe("Sin periodo declarado")
    expect(formatPayoutPeriodLabel("2026-01-01", null)).toBe("Desde el 1 ene 2026")
    expect(formatPayoutPeriodLabel(null, "2026-01-31")).toBe("Hasta el 31 ene 2026")
  })

  it("no se rompe con una fecha inválida", () => {
    expect(formatPayoutPeriodLabel("2026-02-30", null)).toBe("Sin periodo declarado")
  })
})

describe("validatePayoutInput", () => {
  it("acepta una dispersión completa y normaliza los campos", () => {
    const result = validatePayoutInput({
      restaurantId: ` ${UUID} `,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      settledAmount: "$900.00",
      feeAmount: "100",
      reference: "  SPEI-4471  ",
      notes: "  Dispersión de enero  ",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      restaurantId: UUID,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      settledAmount: 900,
      feeAmount: 100,
      reference: "SPEI-4471",
      notes: "Dispersión de enero",
    })
  })

  it("convierte notas vacías en null", () => {
    const result = validatePayoutInput(validInput({ notes: "   " }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.notes).toBeNull()
  })

  it("acepta un periodo sin declarar", () => {
    const result = validatePayoutInput(validInput({ periodStart: "", periodEnd: null }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.periodStart).toBeNull()
    expect(result.value.periodEnd).toBeNull()
  })

  it("rechaza un restaurante que no es UUID", () => {
    const result = validatePayoutInput(validInput({ restaurantId: "no-soy-uuid" }))
    expect(result).toEqual({ ok: false, error: "Restaurante inválido" })
  })

  it("rechaza una fecha inicial imposible", () => {
    const result = validatePayoutInput(validInput({ periodStart: "2026-02-30" }))
    expect(result).toEqual({ ok: false, error: "Fecha inicial inválida" })
  })

  it("rechaza una fecha final imposible", () => {
    const result = validatePayoutInput(validInput({ periodEnd: "2026-13-01" }))
    expect(result).toEqual({ ok: false, error: "Fecha final inválida" })
  })

  it("rechaza un periodo invertido con el mismo mensaje que la base", () => {
    const result = validatePayoutInput(
      validInput({ periodStart: "2026-02-01", periodEnd: "2026-01-01" })
    )
    expect(result).toEqual({
      ok: false,
      error: "El fin del periodo no puede ser anterior al inicio",
    })
  })

  it("acepta un periodo de un solo día", () => {
    const result = validatePayoutInput(
      validInput({ periodStart: "2026-01-15", periodEnd: "2026-01-15" })
    )
    expect(result.ok).toBe(true)
  })

  it("rechaza un monto que no es número", () => {
    const result = validatePayoutInput(validInput({ settledAmount: "mil pesos" }))
    expect(result).toEqual({
      ok: false,
      error: "El monto de la dispersión no es un número válido",
    })
  })

  it("rechaza el monto cero con el mismo mensaje que la base", () => {
    const result = validatePayoutInput(validInput({ settledAmount: 0 }))
    expect(result).toEqual({ ok: false, error: "El monto de la dispersión no puede ser cero" })
  })

  it("rechaza un monto por encima de NUMERIC(14,2)", () => {
    const result = validatePayoutInput(validInput({ settledAmount: MAX_PAYOUT_AMOUNT + 1 }))
    expect(result).toEqual({
      ok: false,
      error: "El monto de la dispersión es demasiado grande",
    })
  })

  it("acepta el tope exacto", () => {
    const result = validatePayoutInput(validInput({ settledAmount: MAX_PAYOUT_AMOUNT }))
    expect(result.ok).toBe(true)
  })

  it("rechaza una comisión negativa con el mismo mensaje que la base", () => {
    const result = validatePayoutInput(validInput({ feeAmount: -1 }))
    expect(result).toEqual({ ok: false, error: "La comisión retenida no puede ser negativa" })
  })

  it("asume comisión 0 cuando no se manda", () => {
    const result = validatePayoutInput(validInput({ feeAmount: undefined }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.feeAmount).toBe(0)
  })

  it("exige un comprobante de al menos 4 caracteres", () => {
    const short = validatePayoutInput(validInput({ reference: "abc" }))
    expect(short).toEqual({
      ok: false,
      error: `La dispersión exige un comprobante de al menos ${MIN_PAYOUT_REFERENCE} caracteres`,
    })
  })

  it("acepta un comprobante de exactamente 4 caracteres", () => {
    const result = validatePayoutInput(validInput({ reference: "SPEI" }))
    expect(result.ok).toBe(true)
  })

  it("un comprobante de espacios no cuenta como comprobante", () => {
    const result = validatePayoutInput(validInput({ reference: "      " }))
    expect(result.ok).toBe(false)
  })

  it("exige motivo en una dispersión negativa", () => {
    const result = validatePayoutInput(
      validInput({ settledAmount: -50, reference: "SPEI-9001", notes: "abc" })
    )
    expect(result).toEqual({
      ok: false,
      error: `Una dispersión negativa exige explicar por qué (mínimo ${MIN_PAYOUT_NOTE} caracteres)`,
    })
  })

  it("acepta una dispersión negativa explicada", () => {
    const result = validatePayoutInput(
      validInput({ settledAmount: -50, reference: "SPEI-9001", notes: "Devolución del restaurante" })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.settledAmount).toBe(-50)
  })

  it("no exige motivo en una dispersión positiva", () => {
    const result = validatePayoutInput(validInput({ notes: "" }))
    expect(result.ok).toBe(true)
  })

  it("acumula el orden de las reglas: el restaurante gana al monto", () => {
    const result = validatePayoutInput(
      validInput({ restaurantId: "x", settledAmount: 0 })
    )
    expect(result).toEqual({ ok: false, error: "Restaurante inválido" })
  })
})

describe("summarizePayoutBalances", () => {
  it("devuelve ceros con una lista vacía", () => {
    expect(summarizePayoutBalances([])).toEqual({
      restaurants: 0,
      owed: 0,
      outstanding: 0,
      grossCollected: 0,
      settledTotal: 0,
      feeTotal: 0,
      overpaid: 0,
      overpaidAmount: 0,
      chargeableRestaurants: 0,
    })
  })

  it("suma los saldos y cuenta a quién se le debe", () => {
    const summary = summarizePayoutBalances([
      balance({ outstanding: 1000, grossCollected: 1000, custodyOrderCount: 1 }),
      balance({ outstanding: 250.5, grossCollected: 400, settledTotal: 149.5 }),
      balance({ outstanding: 0, grossCollected: 500, settledTotal: 400, feeTotal: 100 }),
    ])
    expect(summary.restaurants).toBe(3)
    expect(summary.owed).toBe(2)
    expect(summary.outstanding).toBe(1250.5)
    expect(summary.grossCollected).toBe(1900)
    expect(summary.settledTotal).toBe(549.5)
    expect(summary.feeTotal).toBe(100)
  })

  it("separa el saldo negativo: dispersado de más", () => {
    const summary = summarizePayoutBalances([
      balance({ outstanding: -300 }),
      balance({ outstanding: 100 }),
    ])
    expect(summary.overpaid).toBe(1)
    expect(summary.overpaidAmount).toBe(-300)
    expect(summary.owed).toBe(1)
    expect(summary.outstanding).toBe(-200)
  })

  it("cuenta las cuentas listas para cobrar en su propio nombre", () => {
    const summary = summarizePayoutBalances([
      balance({ connectChargeable: true, stripeAccountId: "acct_1" }),
      balance({ connectChargeable: true, stripeAccountId: "acct_2" }),
      balance({ connectChargeable: false, stripeAccountId: "acct_3" }),
    ])
    expect(summary.chargeableRestaurants).toBe(2)
  })

  it("redondea la suma de flotantes a centavos", () => {
    const summary = summarizePayoutBalances([
      balance({ outstanding: 0.1 }),
      balance({ outstanding: 0.2 }),
    ])
    expect(summary.outstanding).toBe(0.3)
  })
})

describe("custodyMode", () => {
  it("con Connect apagado todo el dinero es de la plataforma, sin importar la cuenta", () => {
    expect(custodyMode("active", false)).toBe("platform")
    expect(custodyMode("not_connected", false)).toBe("platform")
    expect(custodyMode("pending", false)).toBe("platform")
    expect(custodyMode("restricted", false)).toBe("platform")
  })

  it("con Connect encendido solo una cuenta activa cobra en su nombre", () => {
    expect(custodyMode("active", true)).toBe("direct")
    expect(custodyMode("pending", true)).toBe("onboarding")
    expect(custodyMode("restricted", true)).toBe("onboarding")
    expect(custodyMode("not_connected", true)).toBe("onboarding")
  })

  it("cada modo tiene etiqueta y ayuda escritas", () => {
    for (const mode of ["direct", "onboarding", "platform"] as const) {
      expect(CUSTODY_LABEL[mode].length).toBeGreaterThan(3)
      expect(CUSTODY_HELP[mode].length).toBeGreaterThan(20)
    }
  })

  it("nombra los cuatro estados de la cuenta", () => {
    expect(CONNECT_STATE_LABEL.active).toBe("Cuenta lista")
    expect(CONNECT_STATE_LABEL.not_connected).toBe("Sin cuenta Stripe")
    expect(CONNECT_STATE_LABEL.pending).toBe("Onboarding a medias")
    expect(CONNECT_STATE_LABEL.restricted).toBe("Cuenta restringida")
  })
})

describe("formato de montos", () => {
  it("imprime dos decimales fijos para conciliar contra el banco", () => {
    expect(formatPayoutAmount(1000)).toBe("$1,000.00")
    expect(formatPayoutAmount(1234.5)).toBe("$1,234.50")
  })

  it("marca el saldo pendiente, el al día y el dispersado de más", () => {
    expect(formatOutstanding(4120)).toBe("$4,120.00")
    expect(formatOutstanding(0)).toBe("$0.00 — al día")
    expect(formatOutstanding(-300)).toBe("-$300.00 dispersado de más")
  })
})
