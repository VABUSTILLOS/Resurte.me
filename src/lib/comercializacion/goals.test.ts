import { describe, it, expect, afterEach } from "vitest"
import { getWeeklyGoals } from "./goals"

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
