"use server"

/**
 * Reporte de comisiones por vendedor para el admin (B4).
 *
 * Agrega, por cada vendedor, las ventas PAGADAS de sus clientes vinculados
 * (crm_prospects.user_id) en la semana y el mes, y la comisión estimada con
 * la tasa global. Reutiliza la misma regla que el dashboard del vendedor.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { getCommissionRate } from "../commissions"
import { getWeekBounds, getMonthBounds } from "../dates"
import { logger } from "@/lib/logger"

export interface SellerCommissionRow {
  sellerId: string
  sellerName: string
  sellerEmail: string | null
  linkedClients: number
  weekRevenue: number
  weekCommission: number
  monthRevenue: number
  monthCommission: number
}

export interface CommissionsReport {
  rate: number
  rows: SellerCommissionRow[]
  totals: {
    weekRevenue: number
    weekCommission: number
    monthRevenue: number
    monthCommission: number
  }
}

export async function getAdminCommissions(): Promise<CommissionsReport> {
  const { response } = await requireAdmin()
  if (response) throw new Error("Acceso restringido a administradores")

  const supabase = await createServiceClient()
  const week = getWeekBounds()
  const month = getMonthBounds()
  const rate = getCommissionRate()

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

  const sellerIds = Array.from(clientsBySeller.keys())
  if (sellerIds.length === 0) {
    return {
      rate,
      rows: [],
      totals: { weekRevenue: 0, weekCommission: 0, monthRevenue: 0, monthCommission: 0 },
    }
  }

  const { data: sellers } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", sellerIds)
  const sellerById = new Map(
    (sellers ?? []).map((s) => [s.id, { name: s.full_name ?? "Vendedor", email: s.email ?? null }])
  )

  const allClientIds = Array.from(
    new Set(Array.from(clientsBySeller.values()).flatMap((s) => Array.from(s)))
  )
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("user_id, total, created_at")
    .in("user_id", allClientIds)
    .eq("payment_status", "paid")
    .neq("status", "cancelled")

  if (ordersErr) {
    logger.error("[COMMISSIONS] orders error:", ordersErr)
    throw new Error("Error al cargar las ventas")
  }

  const revenueByUser = new Map<string, { week: number; month: number }>()
  for (const o of orders ?? []) {
    if (!o.user_id) continue
    const entry = revenueByUser.get(o.user_id) ?? { week: 0, month: 0 }
    const total = Number(o.total)
    if (o.created_at >= week.startISO) entry.week += total
    if (o.created_at >= month.startISO) entry.month += total
    revenueByUser.set(o.user_id, entry)
  }

  const rows: SellerCommissionRow[] = sellerIds.map((sellerId) => {
    const clients = clientsBySeller.get(sellerId) ?? new Set<string>()
    let weekRevenue = 0
    let monthRevenue = 0
    for (const clientId of clients) {
      const rev = revenueByUser.get(clientId)
      if (rev) {
        weekRevenue += rev.week
        monthRevenue += rev.month
      }
    }
    const seller = sellerById.get(sellerId)
    return {
      sellerId,
      sellerName: seller?.name ?? `Vendedor ${sellerId.slice(0, 8)}`,
      sellerEmail: seller?.email ?? null,
      linkedClients: clients.size,
      weekRevenue,
      weekCommission: weekRevenue * rate,
      monthRevenue,
      monthCommission: monthRevenue * rate,
    }
  })

  rows.sort((a, b) => b.monthRevenue - a.monthRevenue)

  const totals = rows.reduce(
    (acc, r) => ({
      weekRevenue: acc.weekRevenue + r.weekRevenue,
      weekCommission: acc.weekCommission + r.weekCommission,
      monthRevenue: acc.monthRevenue + r.monthRevenue,
      monthCommission: acc.monthCommission + r.monthCommission,
    }),
    { weekRevenue: 0, weekCommission: 0, monthRevenue: 0, monthCommission: 0 }
  )

  return { rate, rows, totals }
}
