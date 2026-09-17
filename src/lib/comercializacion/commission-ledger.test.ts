import { describe, expect, it } from "vitest"
import {
  COMMISSION_STATUSES,
  MIN_ADJUSTMENT_REASON,
  MIN_PAYMENT_REFERENCE,
  formatPeriodLabel,
  monthKeyOfDate,
  normalizeMonthKey,
  parseCommissionStatus,
  periodRangeForMonthKey,
  previewAmountDue,
  recentMonthKeys,
  summarizePeriods,
  validateAccrualInput,
  validateAdjustmentInput,
  validateCancellationInput,
  validatePaymentInput,
} from "./commission-ledger"

const SELLER = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

describe("normalizeMonthKey", () => {
  it("normaliza un mes sin cero a la izquierda", () => {
    expect(normalizeMonthKey("2026-9")).toBe("2026-09")
  })

  it("acepta el formato completo y recorta espacios", () => {
    expect(normalizeMonthKey("  2026-09  ")).toBe("2026-09")
  })

  it("rechaza meses fuera de rango", () => {
    expect(normalizeMonthKey("2026-00")).toBeNull()
    expect(normalizeMonthKey("2026-13")).toBeNull()
  })

  it("rechaza años fuera del rango soportado", () => {
    expect(normalizeMonthKey("1999-01")).toBeNull()
    expect(normalizeMonthKey("2101-01")).toBeNull()
  })

  it("rechaza formatos y tipos inválidos", () => {
    expect(normalizeMonthKey("2026-09-01")).toBeNull()
    expect(normalizeMonthKey("2026/09")).toBeNull()
    expect(normalizeMonthKey("")).toBeNull()
    expect(normalizeMonthKey(null)).toBeNull()
    expect(normalizeMonthKey(202609)).toBeNull()
    expect(normalizeMonthKey(undefined)).toBeNull()
  })
})

describe("periodRangeForMonthKey", () => {
  it("cubre los meses de 31 días", () => {
    expect(periodRangeForMonthKey("2026-01")).toEqual({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    })
  })

  it("cubre los meses de 30 días", () => {
    expect(periodRangeForMonthKey("2026-09")).toEqual({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    })
  })

  it("termina febrero en el día correcto según el año", () => {
    expect(periodRangeForMonthKey("2026-02")?.periodEnd).toBe("2026-02-28")
    expect(periodRangeForMonthKey("2024-02")?.periodEnd).toBe("2024-02-29")
  })

  it("respeta la regla de los siglos en febrero", () => {
    // 2100 es divisible por 100 pero no por 400: no es bisiesto.
    expect(periodRangeForMonthKey("2100-02")?.periodEnd).toBe("2100-02-28")
  })

  it("devuelve null para una clave inválida", () => {
    expect(periodRangeForMonthKey("2026-13")).toBeNull()
    expect(periodRangeForMonthKey("")).toBeNull()
  })
})

describe("monthKeyOfDate", () => {
  it("extrae el mes de una fecha ISO", () => {
    expect(monthKeyOfDate("2026-09-30")).toBe("2026-09")
  })

  it("rechaza fechas malformadas o con mes inválido", () => {
    expect(monthKeyOfDate("2026-09")).toBeNull()
    expect(monthKeyOfDate("30/09/2026")).toBeNull()
    expect(monthKeyOfDate("2026-13-01")).toBeNull()
    expect(monthKeyOfDate(null)).toBeNull()
  })
})

describe("formatPeriodLabel", () => {
  it("devuelve el mes capitalizado y el año", () => {
    expect(formatPeriodLabel("2026-09-01")).toBe("Septiembre 2026")
    expect(formatPeriodLabel("2026-01-31")).toBe("Enero 2026")
    expect(formatPeriodLabel("2026-12-01")).toBe("Diciembre 2026")
  })

  it("devuelve la entrada si no es una fecha válida", () => {
    expect(formatPeriodLabel("vaya")).toBe("vaya")
  })
})

describe("recentMonthKeys", () => {
  it("devuelve los meses del más reciente al más antiguo", () => {
    const now = new Date("2026-09-15T18:00:00Z")
    expect(recentMonthKeys(3, now)).toEqual(["2026-09", "2026-08", "2026-07"])
  })

  it("cruza el cambio de año", () => {
    const now = new Date("2026-01-15T18:00:00Z")
    expect(recentMonthKeys(3, now)).toEqual(["2026-01", "2025-12", "2025-11"])
  })

  it("usa el día local, no UTC", () => {
    // 05:00 UTC del 1 de enero sigue siendo el 31 de diciembre en CDMX.
    const now = new Date("2026-01-01T05:00:00Z")
    expect(recentMonthKeys(1, now)).toEqual(["2025-12"])
  })

  it("acota la cantidad pedida", () => {
    const now = new Date("2026-09-15T18:00:00Z")
    expect(recentMonthKeys(0, now)).toHaveLength(1)
    expect(recentMonthKeys(-5, now)).toHaveLength(1)
    expect(recentMonthKeys(1000, now)).toHaveLength(60)
  })
})

describe("previewAmountDue", () => {
  it("calcula y redondea a 2 decimales", () => {
    expect(previewAmountDue(1250, 0.05, 0)).toBe(62.5)
    expect(previewAmountDue(333.33, 0.05, 0)).toBe(16.67)
    expect(previewAmountDue(1000, 0.05, 100)).toBe(150)
    expect(previewAmountDue(1000, 0.05, -31.5)).toBe(18.5)
  })

  it("con tasa cero devuelve solo los ajustes", () => {
    expect(previewAmountDue(9999, 0, 12.34)).toBe(12.34)
  })
})

describe("summarizePeriods", () => {
  it("separa devengado de pagado y cuenta los cancelados", () => {
    const summary = summarizePeriods([
      { status: "devengada", revenue: 1000, amountDue: 50 },
      { status: "devengada", revenue: 500, amountDue: 25 },
      { status: "pagada", revenue: 2000, amountDue: 100 },
      { status: "cancelada", revenue: 9000, amountDue: 450 },
    ])
    expect(summary).toEqual({
      devengadaAmount: 75,
      devengadaCount: 2,
      pagadaAmount: 100,
      pagadaCount: 1,
      canceladaCount: 1,
      revenueTotal: 3500,
    })
  })

  it("los periodos cancelados no suman dinero", () => {
    const summary = summarizePeriods([
      { status: "cancelada", revenue: 9000, amountDue: 450 },
    ])
    expect(summary.pagadaAmount).toBe(0)
    expect(summary.devengadaAmount).toBe(0)
    expect(summary.revenueTotal).toBe(0)
    expect(summary.canceladaCount).toBe(1)
  })

  it("redondea los acumulados", () => {
    const summary = summarizePeriods([
      { status: "devengada", revenue: 0.1, amountDue: 0.1 },
      { status: "devengada", revenue: 0.2, amountDue: 0.2 },
    ])
    expect(summary.devengadaAmount).toBe(0.3)
    expect(summary.revenueTotal).toBe(0.3)
  })

  it("ignora montos no finitos y un ledger vacío", () => {
    expect(summarizePeriods([]).devengadaCount).toBe(0)
    const summary = summarizePeriods([
      { status: "devengada", revenue: Number.NaN, amountDue: Number.NaN },
    ])
    expect(summary.devengadaAmount).toBe(0)
    expect(summary.revenueTotal).toBe(0)
  })
})

describe("validateAccrualInput", () => {
  it("acepta vendedor, mes y tasa", () => {
    const result = validateAccrualInput({
      sellerId: SELLER,
      monthKey: "2026-09",
      rate: 0.08,
    })
    expect(result).toEqual({
      ok: true,
      value: {
        sellerId: SELLER,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        rate: 0.08,
      },
    })
  })

  it("deja la tasa en null cuando no se manda, para usar la global", () => {
    const result = validateAccrualInput({ sellerId: SELLER, monthKey: "2026-09" })
    expect(result.ok && result.value.rate).toBeNull()
  })

  it("rechaza un vendedor que no es UUID", () => {
    const result = validateAccrualInput({ sellerId: "vendedor-1", monthKey: "2026-09" })
    expect(result.ok).toBe(false)
    expect(result.ok || result.error).toBe("Elige un vendedor válido")
  })

  it("rechaza un periodo inválido", () => {
    const result = validateAccrualInput({ sellerId: SELLER, monthKey: "septiembre" })
    expect(result.ok).toBe(false)
    expect(result.ok || result.error).toBe("El periodo debe tener el formato AAAA-MM")
  })

  it("rechaza una tasa fuera de [0, 1]", () => {
    for (const rate of [1.5, -0.1, "mucha"]) {
      const result = validateAccrualInput({ sellerId: SELLER, monthKey: "2026-09", rate })
      expect(result.ok).toBe(false)
      expect(result.ok || result.error).toBe("La tasa debe ser un número entre 0 y 1")
    }
  })

  it("acepta los extremos de la tasa", () => {
    expect(validateAccrualInput({ sellerId: SELLER, monthKey: "2026-09", rate: 0 }).ok).toBe(true)
    expect(validateAccrualInput({ sellerId: SELLER, monthKey: "2026-09", rate: 1 }).ok).toBe(true)
  })
})

describe("validateAdjustmentInput", () => {
  it("acepta un monto negativo con motivo", () => {
    expect(validateAdjustmentInput({ amount: -250.5, reason: "Devolución parcial" })).toEqual({
      ok: true,
      value: { amount: -250.5, reason: "Devolución parcial" },
    })
  })

  it("rechaza el ajuste en cero", () => {
    const result = validateAdjustmentInput({ amount: 0, reason: "Nada que ajustar" })
    expect(result.ok).toBe(false)
    expect(result.ok || result.error).toBe("El ajuste no puede ser cero")
  })

  it("rechaza un monto no numérico", () => {
    const result = validateAdjustmentInput({ amount: "cien", reason: "Ajuste manual" })
    expect(result.ok).toBe(false)
    expect(result.ok || result.error).toBe("El ajuste debe ser un número")
  })

  it("exige un motivo con longitud mínima, ignorando espacios", () => {
    const result = validateAdjustmentInput({ amount: 10, reason: "  ok  " })
    expect(result.ok).toBe(false)
    expect(result.ok || result.error).toContain(String(MIN_ADJUSTMENT_REASON))
  })

  it("recorta el motivo antes de guardarlo", () => {
    const result = validateAdjustmentInput({ amount: 10, reason: "  Bonificación  " })
    expect(result.ok && result.value.reason).toBe("Bonificación")
  })
})

describe("validatePaymentInput", () => {
  it("exige referencia cuando hay algo que pagar", () => {
    const result = validatePaymentInput({ reference: "SP" }, 132)
    expect(result.ok).toBe(false)
    expect(result.ok || result.error).toContain(String(MIN_PAYMENT_REFERENCE))
  })

  it("acepta el pago con referencia", () => {
    expect(validatePaymentInput({ reference: " SPEI 4471 " }, 132)).toEqual({
      ok: true,
      value: { reference: "SPEI 4471", notes: null },
    })
  })

  it("no exige referencia para cerrar un periodo en cero", () => {
    expect(validatePaymentInput({ reference: "" }, 0)).toEqual({
      ok: true,
      value: { reference: "", notes: null },
    })
  })

  it("normaliza notas vacías a null", () => {
    const result = validatePaymentInput({ reference: "SPEI 1", notes: "   " }, 10)
    expect(result.ok && result.value.notes).toBeNull()
  })

  it("conserva las notas cuando vienen", () => {
    const result = validatePaymentInput({ reference: "SPEI 1", notes: " Pagado el lunes " }, 10)
    expect(result.ok && result.value.notes).toBe("Pagado el lunes")
  })
})

describe("validateCancellationInput", () => {
  it("exige un motivo explicado", () => {
    const result = validateCancellationInput({ reason: "no" })
    expect(result.ok).toBe(false)
  })

  it("acepta un motivo válido y lo recorta", () => {
    const result = validateCancellationInput({ reason: "  Duplicado de abril  " })
    expect(result.ok && result.value.reason).toBe("Duplicado de abril")
  })
})

describe("parseCommissionStatus", () => {
  it("acepta los tres estatus de la migración 00155", () => {
    for (const status of COMMISSION_STATUSES) {
      expect(parseCommissionStatus(status)).toBe(status)
    }
  })

  it("rechaza cualquier otro valor", () => {
    expect(parseCommissionStatus("pendiente")).toBeNull()
    expect(parseCommissionStatus("")).toBeNull()
    expect(parseCommissionStatus(null)).toBeNull()
  })
})
