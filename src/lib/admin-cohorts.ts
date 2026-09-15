/**
 * Cohortes de recompra (retención de clientes).
 *
 * Agrupa clientes por mes de su PRIMER pedido pagado y calcula, para cada
 * cohorte, qué porcentaje volvió a comprar en los N meses siguientes.
 * Lógica pura y testeable; la API la alimenta con las filas de `orders`.
 */

export interface OrderRow {
  user_id: string | null
  created_at: string
}

export interface CohortRow {
  /** Mes de la cohorte, p.ej. "2026-06". */
  month: string
  /** Clientes que hicieron su primer pedido pagado ese mes. */
  size: number
  /**
   * retentions[k] = % (0-100, 1 decimal) de la cohorte que hizo otro pedido
   * pagado exactamente k+1 meses después de su mes de cohorte.
   * Solo se incluyen períodos ya transcurridos (null si aún no hay dato).
   */
  retentions: (number | null)[]
}

/** "2026-06-15T…" → "2026-06" */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** Diferencia en meses entre dos claves YYYY-MM (b - a). */
export function monthDiff(a: string, b: string): number {
  const [ya = 0, ma = 0] = a.split("-").map(Number)
  const [yb = 0, mb = 0] = b.split("-").map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

/**
 * Construye las cohortes a partir de pedidos pagados (user_id + created_at).
 * `maxPeriods` limita las columnas de retención (por default 6 meses).
 */
export function buildCohorts(orders: OrderRow[], maxPeriods = 6): CohortRow[] {
  // Primer pedido por usuario y meses de actividad por usuario.
  const firstByUser = new Map<string, string>()
  const monthsByUser = new Map<string, Set<string>>()

  for (const o of orders) {
    if (!o.user_id) continue
    const m = monthKey(o.created_at)
    const prev = firstByUser.get(o.user_id)
    if (!prev || m < prev) firstByUser.set(o.user_id, m)
    let months = monthsByUser.get(o.user_id)
    if (!months) {
      months = new Set()
      monthsByUser.set(o.user_id, months)
    }
    months.add(m)
  }

  // Mes actual para no reportar períodos incompletos.
  const nowKey = monthKey(new Date().toISOString())

  // Agrupa usuarios por mes de cohorte.
  const usersByCohort = new Map<string, string[]>()
  for (const [user, cohort] of firstByUser) {
    let users = usersByCohort.get(cohort)
    if (!users) {
      users = []
      usersByCohort.set(cohort, users)
    }
    users.push(user)
  }

  const rows: CohortRow[] = []
  const cohortMonths = Array.from(usersByCohort.keys()).sort()
  for (const cohort of cohortMonths) {
    const users = usersByCohort.get(cohort) ?? []
    const retentions: (number | null)[] = []
    for (let period = 1; period <= maxPeriods; period++) {
      // Período aún no transcurrido → null (no hay dato).
      if (monthDiff(cohort, nowKey) < period) {
        retentions.push(null)
        continue
      }
      let returned = 0
      for (const user of users) {
        const months = monthsByUser.get(user)
        if (!months) continue
        for (const m of months) {
          if (monthDiff(cohort, m) === period) {
            returned++
            break
          }
        }
      }
      retentions.push(Math.round((returned / users.length) * 1000) / 10)
    }
    rows.push({ month: cohort, size: users.length, retentions })
  }

  // Más recientes primero.
  return rows.reverse()
}
