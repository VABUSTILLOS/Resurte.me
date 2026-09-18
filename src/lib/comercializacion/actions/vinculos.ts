"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { logger } from "@/lib/logger"
import { getCommissionRate } from "../commissions"
import {
  CRM_REVENUE_SCAN_LIMIT,
  REVENUE_LIST_LIMIT,
  foldPaidRevenueWindow,
  toAmount,
  type PaidRevenue,
} from "../revenue-scan"
import { escapeOrTerm } from "./helpers"

// ============================================================
// VINCULACIÓN DE CUENTA
// ============================================================

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Suma las ventas pagadas de **todo** el historial del usuario.
 *
 * Pide la ventana con una fila de más para poder decir si se quedó corta
 * (ver `revenue-scan.ts`), y por eso no lleva `order`: un `SUM` no depende del
 * orden, y ordenar solo encarecería la consulta.
 *
 * `payment_status = 'paid'` deja fuera también `partially_refunded` y
 * `refunded`, que es lo correcto para una comisión —no se comisiona dinero que
 * se devolvió— y es la misma semántica que tenía el filtro en memoria.
 *
 * Si `00187` no estuviera aplicada esto seguiría funcionando: `total` y
 * `payment_status` son columnas de `00001`, no del camino de reembolso.
 */
async function scanPaidRevenue(
  supabase: ServiceClient,
  userId: string
): Promise<PaidRevenue> {
  const { data, error } = await supabase
    .from("orders")
    .select("total")
    .eq("user_id", userId)
    .eq("payment_status", "paid")
    .neq("status", "cancelled")
    .limit(CRM_REVENUE_SCAN_LIMIT + 1)

  if (error) {
    logger.error("[CRM] scanPaidRevenue error:", error)
    throw new Error("Error al calcular las ventas del cliente")
  }

  return foldPaidRevenueWindow((data ?? []) as { total: unknown }[])
}

/**
 * Pedidos pagados del usuario vinculado a un prospecto (para comisión).
 *
 * La lista y el total se calculan por separado **a propósito**: la lista trae
 * los `REVENUE_LIST_LIMIT` pedidos más recientes para mostrar en la ficha, y el
 * total se escanea sobre el historial con una ventana alta. Antes eran la misma
 * consulta, así que el total se truncaba al tamaño de la lista y el ingreso
 * quedaba corto a partir del pedido 51 sin decirlo.
 */
export async function getProspectClientOrders(prospectId: number): Promise<{
  orders: Array<{ id: number; total: number; status: string; payment_status: string; created_at: string }>
  revenue: number
  commission: number
  /** Pedidos pagados que sostienen `revenue`, contados sobre el historial, no sobre la lista. */
  paidOrders: number
  /** true si el historial no cupo en la ventana de escaneo y `revenue` es un mínimo. */
  revenueTruncated: boolean
}> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const prospectQuery = supabase
    .from("crm_prospects")
    .select("id, user_id")
    .eq("id", prospectId)
  if (role !== "admin") prospectQuery.eq("seller_id", userId)
  const { data: prospect, error } = await prospectQuery.maybeSingle()
  if (error || !prospect || !prospect.user_id) {
    return {
      orders: [],
      revenue: 0,
      commission: 0,
      paidOrders: 0,
      revenueTruncated: false,
    }
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, total, status, payment_status, created_at")
    .eq("user_id", prospect.user_id)
    .order("created_at", { ascending: false })
    .limit(REVENUE_LIST_LIMIT)

  const paid = await scanPaidRevenue(supabase, prospect.user_id)
  return {
    orders: (orders ?? []).map((o) => ({
      id: Number(o.id),
      total: toAmount(o.total),
      status: String(o.status),
      payment_status: String(o.payment_status),
      created_at: String(o.created_at),
    })),
    revenue: paid.revenue,
    commission: paid.revenue * getCommissionRate(),
    paidOrders: paid.paidOrders,
    revenueTruncated: paid.truncated,
  }
}

export interface UserSearchResult {
  id: string
  full_name: string | null
  email: string
  phone: string | null
}

export async function searchUsersForLinking(
  query: string
): Promise<UserSearchResult[]> {
  await requireSellerOrAdminAction()
  if (!query.trim()) return []
  const supabase = await createServiceClient()
  const q = escapeOrTerm(query.trim())

  // Buscar por email o nombre del perfil (el RLS no permite leer emails
  // de auth.users; usamos profiles.phone / auth emails vía join a users).
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, email")
    // Valores entre comillas dobles: el parser de PostgREST solo trata como
    // literales los caracteres reservados (`,()`) dentro de un valor citado.
    .or(`full_name.ilike."%${q}%",phone.ilike."%${q}%"`)
    .limit(10)

  if (error) {
    logger.error("[CRM] searchUsersForLinking error:", error)
    throw new Error("Error al buscar usuarios")
  }
  return (data ?? []).map((u) => ({
    id: String(u.id),
    full_name: (u.full_name as string | null) ?? null,
    email: (u.email as string | null) ?? "",
    phone: (u.phone as string | null) ?? null,
  }))
}

export async function linkProspectAccount(
  prospectId: number,
  userId: string
): Promise<void> {
  const { userId: sellerId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  // Verificar que el usuario existe y no está vinculado a otro prospecto
  // del mismo vendedor (para admin: a ningún prospecto en general).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle()
  if (!profile) throw new Error("El usuario no existe")

  const existingQuery = supabase
    .from("crm_prospects")
    .select("id")
    .eq("user_id", userId)
  if (role !== "admin") existingQuery.eq("seller_id", sellerId)
  const { data: existing } = await existingQuery.maybeSingle()
  if (existing) throw new Error("Este usuario ya está vinculado a otro prospecto tuyo")

  const updateQuery = supabase
    .from("crm_prospects")
    .update({ user_id: userId })
    .eq("id", prospectId)
  if (role !== "admin") updateQuery.eq("seller_id", sellerId)
  const { error } = await updateQuery
  if (error) {
    logger.error("[CRM] linkProspectAccount error:", error)
    throw new Error("Error al vincular la cuenta")
  }
}
