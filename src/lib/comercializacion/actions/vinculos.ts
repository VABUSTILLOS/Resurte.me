"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { logger } from "@/lib/logger"
import { getCommissionRate } from "../commissions"
import { escapeIlike } from "./helpers"

// ============================================================
// VINCULACIÓN DE CUENTA
// ============================================================

/** Pedidos pagados del usuario vinculado a un prospecto (para comisión). */
export async function getProspectClientOrders(prospectId: number): Promise<{
  orders: Array<{ id: number; total: number; status: string; payment_status: string; created_at: string }>
  revenue: number
  commission: number
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
    return { orders: [], revenue: 0, commission: 0 }
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, total, status, payment_status, created_at")
    .eq("user_id", prospect.user_id)
    .order("created_at", { ascending: false })
    .limit(50)

  const paid = (orders ?? []).filter(
    (o) => o.payment_status === "paid" && o.status !== "cancelled"
  )
  const revenue = paid.reduce((s, o) => s + Number(o.total), 0)
  return {
    orders: (orders ?? []).map((o) => ({
      id: Number(o.id),
      total: Number(o.total),
      status: String(o.status),
      payment_status: String(o.payment_status),
      created_at: String(o.created_at),
    })),
    revenue,
    commission: revenue * getCommissionRate(),
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
  const q = escapeIlike(query.trim())

  // Buscar por email o nombre del perfil (el RLS no permite leer emails
  // de auth.users; usamos profiles.phone / auth emails vía join a users).
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, email")
    .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
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

