import { describe, expect, it } from "vitest"
import {
  computeRoi,
  monthlyGmvFromWeeklyOrders,
  normalizeRoiInput,
  ROI_DEFAULTS,
  ROI_LIMITS,
} from "@/lib/roi-calculator"

describe("normalizeRoiInput", () => {
  it("rellena con los valores por defecto cuando no hay entrada", () => {
    expect(normalizeRoiInput(null)).toEqual(ROI_DEFAULTS)
    expect(normalizeRoiInput(undefined)).toEqual(ROI_DEFAULTS)
    expect(normalizeRoiInput({})).toEqual(ROI_DEFAULTS)
  })

  it("conserva los valores válidos tal cual", () => {
    const input = {
      monthlyOrders: 120,
      averageTicket: 180,
      commissionPct: 25,
      deliveryCostPerOrder: 30,
      ownDeliveryShare: 0.25,
    }
    expect(normalizeRoiInput(input)).toEqual(input)
  })

  it("acota por arriba y por abajo", () => {
    const high = normalizeRoiInput({
      monthlyOrders: 10_000_000,
      averageTicket: 10_000_000,
      commissionPct: 900,
      deliveryCostPerOrder: 90_000,
      ownDeliveryShare: 4,
    })
    expect(high.monthlyOrders).toBe(ROI_LIMITS.monthlyOrders.max)
    expect(high.averageTicket).toBe(ROI_LIMITS.averageTicket.max)
    expect(high.commissionPct).toBe(ROI_LIMITS.commissionPct.max)
    expect(high.deliveryCostPerOrder).toBe(ROI_LIMITS.deliveryCostPerOrder.max)
    expect(high.ownDeliveryShare).toBe(1)

    const low = normalizeRoiInput({
      monthlyOrders: -50,
      averageTicket: -1,
      commissionPct: -30,
      deliveryCostPerOrder: -5,
      ownDeliveryShare: -2,
    })
    expect(low.monthlyOrders).toBe(0)
    expect(low.averageTicket).toBe(0)
    expect(low.commissionPct).toBe(0)
    expect(low.deliveryCostPerOrder).toBe(0)
    expect(low.ownDeliveryShare).toBe(0)
  })

  it("cae al valor por defecto ante NaN o Infinity, no a cero", () => {
    const result = normalizeRoiInput({
      monthlyOrders: Number.NaN,
      averageTicket: Number.POSITIVE_INFINITY,
    })
    expect(result.monthlyOrders).toBe(ROI_DEFAULTS.monthlyOrders)
    expect(result.averageTicket).toBe(ROI_DEFAULTS.averageTicket)
  })
})

describe("computeRoi", () => {
  it("calcula la comisión sobre el GMV", () => {
    const roi = computeRoi({
      monthlyOrders: 400,
      averageTicket: 250,
      commissionPct: 30,
      deliveryCostPerOrder: 0,
      ownDeliveryShare: 0,
    })
    expect(roi.gmvMonthly).toBe(100_000)
    expect(roi.commissionMonthly).toBe(30_000)
    expect(roi.commissionYearly).toBe(360_000)
    expect(roi.commissionPerOrder).toBe(75)
    expect(roi.savingsMonthly).toBe(30_000)
    expect(roi.savingsYearly).toBe(360_000)
    expect(roi.savingsPerOrder).toBe(75)
    expect(roi.savingsPctOfGmv).toBe(30)
    expect(roi.warnings).toEqual([])
  })

  it("descuenta el costo del reparto propio", () => {
    const roi = computeRoi({
      monthlyOrders: 400,
      averageTicket: 250,
      commissionPct: 30,
      deliveryCostPerOrder: 45,
      ownDeliveryShare: 0.5,
    })
    // 400 pedidos * 0.5 * 45 = 9,000 de reparto
    expect(roi.ownDeliveryMonthly).toBe(9_000)
    expect(roi.savingsMonthly).toBe(21_000)
    expect(roi.savingsPerOrder).toBe(52.5)
    expect(roi.warnings).toEqual([])
  })

  it("avisa cuando el reparto propio se come el ahorro, y no lo maquilla", () => {
    const roi = computeRoi({
      monthlyOrders: 400,
      averageTicket: 100,
      commissionPct: 10,
      deliveryCostPerOrder: 60,
      ownDeliveryShare: 1,
    })
    // comisión 4,000 vs reparto 24,000
    expect(roi.commissionMonthly).toBe(4_000)
    expect(roi.ownDeliveryMonthly).toBe(24_000)
    expect(roi.savingsMonthly).toBe(-20_000)
    expect(roi.savingsYearly).toBe(-240_000)
    expect(roi.warnings).toHaveLength(1)
    expect(roi.warnings[0]).toContain("No vendemos ahorro que no existe")
  })

  it("avisa cuando el ahorro es exactamente cero", () => {
    const roi = computeRoi({
      monthlyOrders: 100,
      averageTicket: 100,
      commissionPct: 50,
      deliveryCostPerOrder: 50,
      ownDeliveryShare: 1,
    })
    expect(roi.savingsMonthly).toBe(0)
    expect(roi.warnings).toHaveLength(1)
    expect(roi.warnings[0]).toContain("exactamente la comisión")
  })

  it("avisa cuando no hay pedidos y deja el ahorro en cero", () => {
    const roi = computeRoi({ monthlyOrders: 0, averageTicket: 250, commissionPct: 30 })
    expect(roi.gmvMonthly).toBe(0)
    expect(roi.commissionMonthly).toBe(0)
    expect(roi.savingsPerOrder).toBe(0)
    expect(roi.savingsPctOfGmv).toBe(0)
    expect(roi.warnings).toHaveLength(1)
    expect(roi.warnings[0]).toContain("pedidos por mes")
  })

  it("avisa cuando la comisión es cero", () => {
    const roi = computeRoi({
      monthlyOrders: 100,
      averageTicket: 250,
      commissionPct: 0,
      deliveryCostPerOrder: 0,
      ownDeliveryShare: 0,
    })
    expect(roi.commissionMonthly).toBe(0)
    expect(roi.savingsMonthly).toBe(0)
    expect(roi.warnings).toHaveLength(2)
  })

  it("nunca lanza con basura y devuelve números finitos", () => {
    const roi = computeRoi({ monthlyOrders: Number.NaN, averageTicket: Number.NaN })
    for (const value of Object.values(roi)) {
      if (typeof value === "number") expect(Number.isFinite(value)).toBe(true)
    }
  })

  it("redondea a centavos", () => {
    const roi = computeRoi({
      monthlyOrders: 3,
      averageTicket: 33.33,
      commissionPct: 17.5,
      deliveryCostPerOrder: 11.11,
      ownDeliveryShare: 0.333,
    })
    expect(roi.gmvMonthly).toBe(99.99)
    // 99.99 * 0.175 = 17.49825 → 17.5
    expect(roi.commissionMonthly).toBe(17.5)
    // 3 * 0.333 * 11.11 = 11.09889 → 11.1
    expect(roi.ownDeliveryMonthly).toBe(11.1)
    expect(roi.savingsMonthly).toBe(6.4)
  })

  it("es determinista: la misma entrada da la misma salida", () => {
    const a = computeRoi(ROI_DEFAULTS)
    const b = computeRoi(ROI_DEFAULTS)
    expect(a).toEqual(b)
  })
})

describe("monthlyGmvFromWeeklyOrders", () => {
  it("convierte semanas a mes con 4.33 semanas", () => {
    expect(monthlyGmvFromWeeklyOrders(100, 200)).toBe(86_600)
  })

  it("devuelve 0 con entradas inválidas", () => {
    expect(monthlyGmvFromWeeklyOrders(Number.NaN, 200)).toBe(0)
    expect(monthlyGmvFromWeeklyOrders(-10, 200)).toBe(0)
  })

  it("acota valores absurdos", () => {
    expect(monthlyGmvFromWeeklyOrders(1_000_000, 100_000)).toBe(
      ROI_LIMITS.monthlyOrders.max * ROI_LIMITS.averageTicket.max * 4.33,
    )
  })
})
