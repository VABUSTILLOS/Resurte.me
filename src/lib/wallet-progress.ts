/**
 * Progreso semanal hacia el siguiente nivel de recompensas.
 *
 * Todo el cálculo es puro y determinista (recibe `now`), para poder testearlo
 * sin base de datos. Reproduce la semántica de la migración 00029:
 *  - semana ISO calculada en hora de México (America/Mexico_City);
 *  - una semana califica si el gasto PAGADO acumulado llega a $2,500;
 *  - el nivel sale de las semanas calificadas del mes en curso.
 */

import { QUALIFYING_WEEK_MIN } from "@/lib/utils"

const MEXICO_TZ = "America/Mexico_City"

/** Escalones de nivel por semanas calificadas del mes (igual que el trigger). */
const TIER_LADDER = [
  { tier: "Verde", pct: 5, weeks: 0 },
  { tier: "Plata", pct: 10, weeks: 2 },
  { tier: "Oro", pct: 15, weeks: 3 },
  { tier: "Diamante", pct: 20, weeks: 4 },
] as const

export interface RewardsOrder {
  created_at: string
  total: number | string | null
}

export interface WeekProgress {
  /** Identificador de la semana ISO en curso, p. ej. "2026-W02". */
  weekKey: string
  /** Gasto pagado acumulado en la semana en curso. */
  weekSpend: number
  qualifyingMin: number
  /** Cuánto falta para calificar la semana (0 si ya calificó). */
  remainingToQualify: number
  qualifies: boolean
  /** Días que quedan de la semana ISO (0 = hoy es el último día). */
  daysLeft: number
  qualifyingWeeksThisMonth: number
  tier: string
  tierPct: number
  nextTier: string | null
  nextTierPct: number | null
  /** Semanas calificadas que faltan para el siguiente nivel (null en el tope). */
  weeksToNextTier: number | null
}

interface CivilDate {
  year: number
  month: number
  day: number
  /** 1 = lunes … 7 = domingo. */
  isoDay: number
  week: number
  weekYear: number
}

/** Fecha civil (y semana ISO) de un instante, en hora de México. */
function civilDateInMexico(date: Date): CivilDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const year = read("year")
  const month = read("month")
  const day = read("day")

  // Semana ISO del día civil, con aritmética UTC para no arrastrar el huso.
  const d = new Date(Date.UTC(year, month - 1, day))
  const isoDay = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - isoDay)
  const weekYear = d.getUTCFullYear()
  const yearStart = new Date(Date.UTC(weekYear, 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)

  return { year, month, day, isoDay, week, weekYear }
}

function weekKeyOf(c: CivilDate): string {
  return `${c.weekYear}-W${String(c.week).padStart(2, "0")}`
}

/** Mes calendario (YYYY-MM) de un instante, en hora de México. */
export function mexicoMonthKey(date: Date): string {
  const c = civilDateInMexico(date)
  return `${c.year}-${String(c.month).padStart(2, "0")}`
}

type TierStep = (typeof TIER_LADDER)[number]

function tierFor(qualifyingWeeks: number) {
  let current: TierStep = TIER_LADDER[0]
  for (const step of TIER_LADDER) {
    if (qualifyingWeeks >= step.weeks) current = step
  }
  const next = TIER_LADDER.find((step) => step.weeks > qualifyingWeeks) ?? null
  return { current, next }
}

/**
 * Calcula el progreso de la semana en curso y el nivel actual.
 *
 * @param orders Órdenes ya filtradas a pagadas y no canceladas.
 * @param now    Instante de referencia (inyectable para tests).
 */
export function computeWeekProgress(
  orders: RewardsOrder[],
  now: Date = new Date()
): WeekProgress {
  const today = civilDateInMexico(now)
  const currentWeekKey = weekKeyOf(today)

  let weekSpend = 0
  // Semanas del mes en curso → gasto pagado acumulado.
  const monthSpendByWeek = new Map<string, number>()

  for (const order of orders) {
    const created = new Date(order.created_at)
    if (Number.isNaN(created.getTime())) continue
    const civil = civilDateInMexico(created)
    const spend = Number(order.total ?? 0)
    if (!Number.isFinite(spend) || spend <= 0) continue

    const key = weekKeyOf(civil)
    if (key === currentWeekKey) weekSpend += spend

    if (civil.year === today.year && civil.month === today.month) {
      monthSpendByWeek.set(key, (monthSpendByWeek.get(key) ?? 0) + spend)
    }
  }

  const qualifyingWeeksThisMonth = Array.from(monthSpendByWeek.values()).filter(
    (spend) => spend >= QUALIFYING_WEEK_MIN
  ).length

  const { current, next } = tierFor(qualifyingWeeksThisMonth)

  return {
    weekKey: currentWeekKey,
    weekSpend,
    qualifyingMin: QUALIFYING_WEEK_MIN,
    remainingToQualify: Math.max(0, QUALIFYING_WEEK_MIN - weekSpend),
    qualifies: weekSpend >= QUALIFYING_WEEK_MIN,
    // La semana ISO termina el domingo: lunes quedan 6 días, domingo quedan 0.
    daysLeft: 7 - today.isoDay,
    qualifyingWeeksThisMonth,
    tier: current.tier,
    tierPct: current.pct,
    nextTier: next?.tier ?? null,
    nextTierPct: next?.pct ?? null,
    weeksToNextTier: next ? next.weeks - qualifyingWeeksThisMonth : null,
  }
}
