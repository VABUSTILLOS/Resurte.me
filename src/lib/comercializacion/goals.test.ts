import { describe, it, expect, afterEach } from "vitest"
import { getWeeklyGoals, getMonthlyRevenueGoal } from "./goals"

describe("getWeeklyGoals", () => {
  afterEach(() => {
    delete process.env.SELLER_WEEKLY_GOAL_CALLS
    delete process.env.SELLER_WEEKLY_GOAL_WHATSAPPS
    delete process.env.SELLER_WEEKLY_GOAL_REVENUE
  })

  it("devuelve defaults sin variables de entorno", () => {
    expect(getWeeklyGoals()).toEqual({ calls: 40, whatsapps: 30, revenue: 5000 })
  })

  it("lee metas desde variables de entorno", () => {
    process.env.SELLER_WEEKLY_GOAL_CALLS = "50"
    process.env.SELLER_WEEKLY_GOAL_REVENUE = "12000"
    expect(getWeeklyGoals()).toEqual({ calls: 50, whatsapps: 30, revenue: 12000 })
  })

  it("usa defaults ante valores inválidos", () => {
    process.env.SELLER_WEEKLY_GOAL_CALLS = "abc"
    process.env.SELLER_WEEKLY_GOAL_WHATSAPPS = "-5"
    expect(getWeeklyGoals()).toEqual({ calls: 40, whatsapps: 30, revenue: 5000 })
  })
})

describe("getMonthlyRevenueGoal", () => {
  afterEach(() => {
    delete process.env.SELLER_WEEKLY_GOAL_REVENUE
    delete process.env.SELLER_MONTHLY_GOAL_REVENUE
  })

  it("deriva la meta mensual de la semanal (×4.33, redondeo al centenar)", () => {
    // 5000 × 4.33 = 21650 → 21700
    expect(getMonthlyRevenueGoal()).toBe(21700)
  })

  it("respeta SELLER_MONTHLY_GOAL_REVENUE explícita", () => {
    process.env.SELLER_MONTHLY_GOAL_REVENUE = "30000"
    expect(getMonthlyRevenueGoal()).toBe(30000)
  })

  it("deriva de la semanal configurada si no hay mensual", () => {
    process.env.SELLER_WEEKLY_GOAL_REVENUE = "10000"
    // 10000 × 4.33 = 43300
    expect(getMonthlyRevenueGoal()).toBe(43300)
  })
})
