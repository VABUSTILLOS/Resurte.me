"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { logger } from "@/lib/logger"
import {
  getWeekBounds,
  getMonthBounds,
  getTodayBounds,
} from "../dates"
import { getCommissionRate } from "../commissions"
import {
  type DashboardKpis,
  type FollowUp,
  type ClientToReorder,
  type ProspectStatus,
} from "../types"

// ============================================================
// DASHBOARD
// ============================================================

export async function getSellerDisplayName(): Promise<string> {
  const { userId } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle()
  return (data?.full_name as string | null) || "tu asesor de Resurte"
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const week = getWeekBounds()
  const month = getMonthBounds()
  const today = getTodayBounds()

  const prospectsQuery = supabase.from("crm_prospects").select("id, status, next_follow_up_at, user_id")
  const activitiesQuery = supabase.from("crm_activities").select("id, type, occurred_at")
  const linkedQuery = supabase
    .from("crm_prospects")
    .select("id, user_id")
    .not("user_id", "is", null)
  const activeClientsQuery = supabase
    .from("crm_prospects")
    .select("id")
    .eq("status", "cliente_activo")
  if (role !== "admin") {
    prospectsQuery.eq("seller_id", userId)
    activitiesQuery.eq("seller_id", userId)
    linkedQuery.eq("seller_id", userId)
    activeClientsQuery.eq("seller_id", userId)
  }

  const [prospectsRes, activitiesRes, linkedRes, activeClientsRes] = await Promise.all([
    prospectsQuery,
    activitiesQuery,
    linkedQuery,
    activeClientsQuery,
  ])

  if (prospectsRes.error || activitiesRes.error) {
    logger.error("[CRM] getDashboardKpis error")
    throw new Error("Error al cargar el dashboard")
  }

  const prospects = prospectsRes.data ?? []
  const activities = activitiesRes.data ?? []
  const linked = ((linkedRes.data ?? []) as unknown as { user_id: string }[]).map((c) => String(c.user_id))

  const now = new Date().toISOString()
  const pendingContact = prospects.filter(
    (p) => p.status === "nuevo" || (p.next_follow_up_at && p.next_follow_up_at <= now)
  ).length

  const callsToday = activities.filter(
    (a) => a.type === "llamada" && a.occurred_at >= today.startISO
  ).length
  const whatsappToday = activities.filter(
    (a) => a.type === "whatsapp" && a.occurred_at >= today.startISO
  ).length
  const callsWeek = activities.filter(
    (a) => a.type === "llamada" && a.occurred_at >= week.startISO
  ).length
  const whatsappWeek = activities.filter(
    (a) => a.type === "whatsapp" && a.occurred_at >= week.startISO
  ).length

  // Ingresos pagados de clientes vinculados
  let weekRevenue = 0
  let monthRevenue = 0
  if (linked.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("total, created_at, payment_status, status")
      .in("user_id", linked)
      .eq("payment_status", "paid")
      .neq("status", "cancelled")
    for (const o of orders ?? []) {
      const total = Number(o.total)
      if (o.created_at >= week.startISO) weekRevenue += total
      if (o.created_at >= month.startISO) monthRevenue += total
    }
  }

  const rate = getCommissionRate()
  return {
    totalProspects: prospects.length,
    pendingContact,
    activeClients: (activeClientsRes.data ?? []).length,
    callsToday,
    whatsappToday,
    callsWeek,
    whatsappWeek,
    linkedClients: linked.length,
    weekRevenue,
    weekCommission: weekRevenue * rate,
    monthRevenue,
    monthCommission: monthRevenue * rate,
  }
}

export async function getPendingFollowUps(): Promise<FollowUp[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  const query = supabase
    .from("crm_prospects")
    .select("id, name, restaurant_name, whatsapp, phone, status, next_follow_up_at, last_contact_at, user_id")
    .lte("next_follow_up_at", now)
    .not("status", "in", "(perdido,inactivo)")
    .order("next_follow_up_at", { ascending: true })
    .limit(20)
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query

  if (error) {
    logger.error("[CRM] getPendingFollowUps error:", error)
    throw new Error("Error al cargar seguimientos")
  }
  return (data ?? []).map((f) => ({
    id: Number(f.id),
    name: String(f.name),
    restaurant_name: (f.restaurant_name as string | null) ?? null,
    whatsapp: (f.whatsapp as string | null) ?? null,
    phone: (f.phone as string | null) ?? null,
    status: f.status as ProspectStatus,
    next_follow_up_at: (f.next_follow_up_at as string | null) ?? null,
    last_contact_at: (f.last_contact_at as string | null) ?? null,
    user_id: (f.user_id as string | null) ?? null,
  }))
}

/** Seguimientos vencidos (fecha anterior a hoy CDMX), para badge en la navegación. */
export async function getOverdueFollowUpCount(): Promise<number> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const { startISO } = getTodayBounds()

  const query = supabase
    .from("crm_prospects")
    .select("id", { count: "exact", head: true })
    .lt("next_follow_up_at", startISO)
    .not("status", "in", "(perdido,inactivo)")
  if (role !== "admin") query.eq("seller_id", userId)
  const { count, error } = await query

  if (error) {
    logger.error("[CRM] getOverdueFollowUpCount error:", error)
    return 0
  }
  return count ?? 0
}

/** Clientes vinculados activos que aún no piden en la semana actual. */
export async function getClientsToReorder(): Promise<ClientToReorder[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const week = getWeekBounds()

  const query = supabase
    .from("crm_prospects")
    .select("id, name, restaurant_name, whatsapp, phone, user_id")
    .not("user_id", "is", null)
    .in("status", ["cliente_activo", "en_seguimiento"])
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query

  if (error) {
    logger.error("[CRM] getClientsToReorder error:", error)
    throw new Error("Error al cargar los clientes")
  }

  const clients = (data ?? [])
    .filter((c) => c.user_id)
    .map((c) => ({
      id: Number(c.id),
      name: String(c.name),
      restaurant_name: (c.restaurant_name as string | null) ?? null,
      whatsapp: (c.whatsapp as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      user_id: String(c.user_id),
      last_order_at: null as string | null,
    }))

  if (clients.length === 0) return []

  const clientIds = clients.map((c) => c.user_id)

  // Pedidos pagados de la semana (para saber quién ya pidió).
  const { data: orders } = await supabase
    .from("orders")
    .select("user_id, created_at, total, payment_status")
    .in("user_id", clientIds)
    .eq("payment_status", "paid")
    .neq("status", "cancelled")
    .gte("created_at", week.startISO)

  const orderedThisWeek = new Set((orders ?? []).map((o) => String(o.user_id)))
  const weekByUser = new Map<string, string>()
  for (const o of orders ?? []) {
    const uid = String(o.user_id)
    const prev = weekByUser.get(uid)
    if (!prev || (o.created_at ?? "") > prev) {
      weekByUser.set(uid, String(o.created_at))
    }
  }

  // Último pedido (con items) por cliente, para sugerir el reorden específico.
  // Se consulta el pedido pagado más reciente de cada uno (sin acotar a la semana).
  const { data: lastOrders } = await supabase
    .from("orders")
    .select("user_id, created_at, order_items(quantity, products(name))")
    .in("user_id", clientIds)
    .eq("payment_status", "paid")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })

  const lastOrderByUser = new Map<
    string,
    { created_at: string; items: string[] }
  >()
  for (const o of lastOrders ?? []) {
    const uid = String(o.user_id)
    if (lastOrderByUser.has(uid)) continue // ya tomamos el más reciente
    const rawItems = (o as { order_items?: unknown }).order_items
    const items: string[] = Array.isArray(rawItems)
      ? rawItems
          .map((ri) => {
            const row = ri as { quantity?: number; products?: { name?: string } | { name?: string }[] | null }
            const prod = Array.isArray(row.products) ? row.products[0] : row.products
            const name = prod?.name
            return name ? `${row.quantity ?? 1}× ${name}` : null
          })
          .filter((x): x is string => Boolean(x))
      : []
    lastOrderByUser.set(uid, { created_at: String(o.created_at), items })
  }

  const now = Date.now()
  return clients
    .filter((c) => !orderedThisWeek.has(c.user_id))
    .map((c) => {
      const last = lastOrderByUser.get(c.user_id)
      const lastAt = last?.created_at ?? weekByUser.get(c.user_id) ?? null
      return {
        ...c,
        last_order_at: lastAt,
        last_order_items: last?.items ?? [],
        days_since_order: lastAt
          ? Math.floor((now - new Date(lastAt).getTime()) / (1000 * 60 * 60 * 24))
          : null,
      }
    })
}

