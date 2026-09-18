"use server"

/**
 * Ledger de comisiones para el admin (C.4).
 *
 * Hasta 00155 esta pantalla solo *estimaba*: multiplicaba las ventas pagadas
 * de los clientes vinculados por la tasa global y no guardaba nada. No había
 * periodo, ni estado, ni ajuste, ni pago: era imposible responder «¿ya le
 * pagué a este vendedor?».
 *
 * Ahora la lectura son tres piezas:
 *
 *   1. `commission_periods` del mes elegido — el monto devengado, congelado
 *      por la base. Es la fuente de verdad del dinero.
 *   2. `commission_adjustments` de esos periodos — los movimientos que lo
 *      explican.
 *   3. `candidates` — vendedores con clientes vinculados, con su venta
 *      *estimada* del mes, para saber a quién falta devengar.
 *
 * `candidates.revenue` es una estimación en JS y sirve solo para la pantalla.
 * El monto que se paga lo calcula la base en `accrue_commission_period`, que
 * corta el mes con `AT TIME ZONE 'America/Mexico_City'`. Si los dos números
 * difieren, manda el de la base.
 *
 * La atribución reutiliza la regla de siempre:
 * `crm_prospects.seller_id → user_id → orders.user_id`, porque
 * `orders.seller_id` (00052, eliminada en 00189) no la escribía ninguna ruta.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { getCommissionRate } from "../commissions"
import { getWeekBounds, getMonthBoundsFor } from "../dates"
import {
  monthKeyOfDate,
  normalizeMonthKey,
  parseCommissionStatus,
  periodRangeForMonthKey,
  summarizePeriods,
  type CommissionStatus,
  type CommissionSummary,
  type PeriodRange,
} from "../commission-ledger"
import { logger } from "@/lib/logger"

export interface CommissionAdjustmentRow {
  id: number
  periodId: number
  amount: number
  reason: string
  createdAt: string
}

export interface CommissionPeriodRow {
  id: number
  sellerId: string
  sellerName: string
  sellerPhone: string | null
  periodStart: string
  periodEnd: string
  rate: number
  revenue: number
  orderCount: number
  adjustments: number
  amountDue: number
  status: CommissionStatus
  paidAt: string | null
  paymentReference: string | null
  notes: string | null
  movements: CommissionAdjustmentRow[]
}

/** Vendedor con clientes vinculados y su venta estimada del mes. */
export interface CommissionCandidateRow {
  sellerId: string
  sellerName: string
  sellerPhone: string | null
  linkedClients: number
  monthRevenue: number
  monthOrderCount: number
  weekRevenue: number
  /** Comisión estimada del mes con la tasa global, solo para la pantalla. */
  monthCommission: number
}

export interface CommissionLedgerReport {
  /** Mes consultado, `AAAA-MM`. */
  month: string
  range: PeriodRange
  rate: number
  periods: CommissionPeriodRow[]
  summary: CommissionSummary
  candidates: CommissionCandidateRow[]
}

/** Lee el ledger del mes (por defecto, el mes en curso). */
export async function getCommissionLedger(month?: string): Promise<CommissionLedgerReport> {
  const { response } = await requireAdmin()
  if (response) throw new Error("Acceso restringido a administradores")

  const requested = normalizeMonthKey(month)
  const resolved = requested ?? monthKeyOfDate(new Date().toISOString())?.slice(0, 7) ?? null
  const key = normalizeMonthKey(resolved)
  const range = key ? periodRangeForMonthKey(key) : null
  if (!key || !range) {
    throw new Error("Periodo inválido")
  }

  const supabase = await createServiceClient()
  const rate = getCommissionRate()
  const week = getWeekBounds()
  const monthBounds = getMonthBoundsFor(key)

  // 1. Prospectos vinculados. Se leen SOLO `seller_id` y `user_id`: es lo
  //    único que necesita el reparto de comisiones, y el contrato del lector
  //    de crm_prospects lo exige (crm-reader.contract.test.ts).
  const { data: links, error: linksErr } = await supabase
    .from("crm_prospects")
    .select("seller_id, user_id")
    .not("user_id", "is", null)
    .not("seller_id", "is", null)

  if (linksErr) {
    logger.error("[COMMISSIONS] links error:", linksErr)
    throw new Error("Error al cargar las comisiones")
  }

  const clientsBySeller = new Map<string, Set<string>>()
  for (const row of links ?? []) {
    if (!row.seller_id || !row.user_id) continue
    let set = clientsBySeller.get(row.seller_id)
    if (!set) {
      set = new Set()
      clientsBySeller.set(row.seller_id, set)
    }
    set.add(row.user_id)
  }

  // 2. El ledger del mes.
  const { data: periodsRaw, error: periodsErr } = await supabase
    .from("commission_periods")
    .select("*")
    .eq("period_start", range.periodStart)
    .order("amount_due", { ascending: false })

  if (periodsErr) {
    logger.error("[COMMISSIONS] periods error:", periodsErr)
    throw new Error("Error al cargar el ledger")
  }

  const periods = periodsRaw ?? []
  const periodIds = periods.map((p) => Number(p.id))

  // 3. Movimientos de esos periodos, en una sola consulta.
  const movementsByPeriod = new Map<number, CommissionAdjustmentRow[]>()
  if (periodIds.length > 0) {
    const { data: adjustments, error: adjustmentsErr } = await supabase
      .from("commission_adjustments")
      .select("*")
      .in("period_id", periodIds)
      .order("created_at", { ascending: false })

    if (adjustmentsErr) {
      logger.error("[COMMISSIONS] adjustments error:", adjustmentsErr)
      throw new Error("Error al cargar los ajustes")
    }

    for (const row of adjustments ?? []) {
      const periodId = Number(row.period_id)
      const list = movementsByPeriod.get(periodId) ?? []
      list.push({
        id: Number(row.id),
        periodId,
        amount: Number(row.amount),
        reason: row.reason as string,
        createdAt: row.created_at as string,
      })
      movementsByPeriod.set(periodId, list)
    }
  }

  // 4. Nombres. `profiles` no tiene columna `email` (vive en auth.users):
  //    se contacta por teléfono, que es el canal que usa todo el sitio.
  const sellerIds = Array.from(
    new Set([...Array.from(clientsBySeller.keys()), ...periods.map((p) => p.seller_id as string)])
  )
  const sellerById = new Map<string, { name: string; phone: string | null }>()
  if (sellerIds.length > 0) {
    const { data: sellers, error: sellersErr } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", sellerIds)
    if (sellersErr) {
      logger.error("[COMMISSIONS] sellers error:", sellersErr)
      throw new Error("Error al cargar los vendedores")
    }
    for (const seller of sellers ?? []) {
      sellerById.set(seller.id as string, {
        name: (seller.full_name as string | null) ?? "Vendedor",
        phone: (seller.phone as string | null) ?? null,
      })
    }
  }
  const nameOf = (sellerId: string) =>
    sellerById.get(sellerId)?.name ?? `Vendedor ${sellerId.slice(0, 8)}`

  const periodRows: CommissionPeriodRow[] = periods.map((period) => {
    const sellerId = period.seller_id as string
    return {
      id: Number(period.id),
      sellerId,
      sellerName: nameOf(sellerId),
      sellerPhone: sellerById.get(sellerId)?.phone ?? null,
      periodStart: period.period_start as string,
      periodEnd: period.period_end as string,
      rate: Number(period.rate),
      revenue: Number(period.revenue),
      orderCount: Number(period.order_count),
      adjustments: Number(period.adjustments),
      amountDue: Number(period.amount_due),
      status: parseCommissionStatus(period.status) ?? "devengada",
      paidAt: (period.paid_at as string | null) ?? null,
      paymentReference: (period.payment_reference as string | null) ?? null,
      notes: (period.notes as string | null) ?? null,
      movements: movementsByPeriod.get(Number(period.id)) ?? [],
    }
  })

  // 5. Candidatos: a quién falta devengar. La venta se estima en JS.
  const candidates = await buildCandidates({
    supabase,
    clientsBySeller,
    week,
    monthBounds,
    rate,
    nameOf,
    phoneOf: (sellerId) => sellerById.get(sellerId)?.phone ?? null,
    alreadyAccrued: new Set(periods.map((p) => p.seller_id as string)),
  })

  return {
    month: key,
    range,
    rate,
    periods: periodRows,
    summary: summarizePeriods(
      periodRows.map((p) => ({ status: p.status as never, revenue: p.revenue, amountDue: p.amountDue }))
    ),
    candidates,
  }
}

/**
 * Venta estimada del mes por vendedor.
 *
 * Solo se incluyen vendedores con ventas en el mes y sin periodo devengado:
 * el resto no aporta nada a la pantalla. Se calcula sumando los pedidos
 * pagados de sus clientes vinculados.
 */
async function buildCandidates(input: {
  supabase: Awaited<ReturnType<typeof createServiceClient>>
  clientsBySeller: Map<string, Set<string>>
  week: { startISO: string }
  monthBounds: { startISO: string; endISO: string } | null
  rate: number
  nameOf: (sellerId: string) => string
  phoneOf: (sellerId: string) => string | null
  alreadyAccrued: Set<string>
}): Promise<CommissionCandidateRow[]> {
  const { supabase, clientsBySeller, week, monthBounds, rate, alreadyAccrued } = input
  if (!monthBounds || clientsBySeller.size === 0) return []

  const allClientIds = Array.from(
    new Set(Array.from(clientsBySeller.values()).flatMap((set) => Array.from(set)))
  )
  if (allClientIds.length === 0) return []

  const { data: orders, error } = await supabase
    .from("orders")
    .select("user_id, total, created_at")
    .in("user_id", allClientIds)
    .eq("payment_status", "paid")
    .neq("status", "cancelled")
    .gte("created_at", monthBounds.startISO)
    .lte("created_at", monthBounds.endISO)

  if (error) {
    logger.error("[COMMISSIONS] orders error:", error)
    throw new Error("Error al cargar las ventas")
  }

  const byUser = new Map<string, { month: number; monthOrders: number; week: number }>()
  for (const order of orders ?? []) {
    if (!order.user_id) continue
    const entry = byUser.get(order.user_id) ?? { month: 0, monthOrders: 0, week: 0 }
    const total = Number(order.total)
    if (!Number.isFinite(total)) continue
    entry.month += total
    entry.monthOrders += 1
    if (order.created_at >= week.startISO) entry.week += total
    byUser.set(order.user_id, entry)
  }

  const rows: CommissionCandidateRow[] = []
  for (const [sellerId, clients] of clientsBySeller) {
    if (alreadyAccrued.has(sellerId)) continue
    let monthRevenue = 0
    let monthOrderCount = 0
    let weekRevenue = 0
    for (const clientId of clients) {
      const entry = byUser.get(clientId)
      if (!entry) continue
      monthRevenue += entry.month
      monthOrderCount += entry.monthOrders
      weekRevenue += entry.week
    }
    if (monthRevenue <= 0) continue
    rows.push({
      sellerId,
      sellerName: input.nameOf(sellerId),
      sellerPhone: input.phoneOf(sellerId),
      linkedClients: clients.size,
      monthRevenue,
      monthOrderCount,
      weekRevenue,
      monthCommission: monthRevenue * rate,
    })
  }

  rows.sort((a, b) => b.monthRevenue - a.monthRevenue)
  return rows
}
