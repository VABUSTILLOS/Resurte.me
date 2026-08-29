/**
 * Metas semanales del vendedor. Configurables por variables de entorno con
 * defaults razonables. Se leen en el servidor (no son NEXT_PUBLIC).
 */

export interface WeeklyGoals {
  calls: number
  whatsapps: number
  revenue: number
}

function readGoal(env: string | undefined, fallback: number): number {
  const n = Number(env)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function getWeeklyGoals(): WeeklyGoals {
  return {
    calls: readGoal(process.env.SELLER_WEEKLY_GOAL_CALLS, 40),
    whatsapps: readGoal(process.env.SELLER_WEEKLY_GOAL_WHATSAPPS, 30),
    revenue: readGoal(process.env.SELLER_WEEKLY_GOAL_REVENUE, 5000),
  }
}
