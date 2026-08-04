"use server"

import { createClient } from "@/lib/supabase/server"
import type {
  OrderWithCashback,
  OrderItem,
  Wallet,
  WalletTransaction,
  WalletHistoryPage,
} from "@/types"

// ============================================================
// HISTORIAL DE COMPRAS DEL USUARIO
// ============================================================

/**
 * Obtiene todas las órdenes del usuario autenticado con sus items.
 * Ordenado por fecha descendente (más reciente primero).
 */
export async function getUserPurchaseHistory(
  page: number = 0,
  pageSize: number = 10
): Promise<{
  orders: (OrderWithCashback & { items: OrderItem[] })[]
  total: number
  hasMore: boolean
}> {
  const supabase = await createClient()

  // Verificar sesión activa
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { orders: [], total: 0, hasMore: false }
  }

  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, count } = await supabase
    .from("orders")
    .select("*, order_items(*)", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (!data) {
    return { orders: [], total: 0, hasMore: false }
  }

  const orders = data.map((row) => {
    const { order_items, ...order } = row as OrderWithCashback & { order_items: OrderItem[] }
    return { ...order, items: order_items ?? [] }
  })

  return {
    orders,
    total: count ?? orders.length,
    hasMore: from + orders.length < (count ?? 0),
  }
}

// ============================================================
// SALDO DEL MONEDERO
// ============================================================

/**
 * Obtiene el saldo actual de Créditos Resurte del usuario autenticado.
 * Si el usuario no tiene monedero aún, retorna null.
 */
export async function getWalletBalance(): Promise<Wallet | null> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", user.id)
    .single()

  return (data as Wallet) ?? null
}

// ============================================================
// HISTORIAL DE TRANSACCIONES DEL MONEDERO
// ============================================================

/**
 * Obtiene el historial de transacciones del monedero del usuario autenticado.
 * Paginado, orden descendente por fecha.
 */
export async function getWalletHistory(
  page: number = 0,
  pageSize: number = 20
): Promise<WalletHistoryPage> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { transactions: [], total: 0, page, pageSize, hasMore: false }
  }

  // Primero obtener el wallet_id del usuario
  const { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!wallet) {
    return { transactions: [], total: 0, page, pageSize, hasMore: false }
  }

  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, count } = await supabase
    .from("wallet_transactions")
    .select("*", { count: "exact" })
    .eq("wallet_id", wallet.id)
    .order("created_at", { ascending: false })
    .range(from, to)

  return {
    transactions: (data as WalletTransaction[]) ?? [],
    total: count ?? 0,
    page,
    pageSize,
    hasMore: from + ((data as WalletTransaction[])?.length ?? 0) < (count ?? 0),
  }
}

// ============================================================
// DASHBOARD: RESUMEN DE CASHBACK DEL MES ACTUAL
// ============================================================

/**
 * Retorna estadísticas de cashback del mes en curso para el usuario autenticado.
 * Útil para mostrar el progreso semanal hacia el siguiente nivel en el dashboard.
 */
export async function getMonthlyCashbackProgress(): Promise<{
  weeksWithPurchases: number
  currentTier: string
  currentTierPct: number
  totalCashbackThisMonth: number
  totalOrdersThisMonth: number
  walletBalance: number
} | null> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Contar semanas distintas y total de cashback del mes actual
  const { data: orders, error } = await supabase
    .from("orders")
    .select("created_at, cashback_credits, cashback_tier")
    .eq("user_id", user.id)
    .gte("created_at", monthStart)
    .not("cashback_credits", "is", null)

  if (error || !orders) {
    return {
      weeksWithPurchases: 0,
      currentTier: "Verde",
      currentTierPct: 5,
      totalCashbackThisMonth: 0,
      totalOrdersThisMonth: 0,
      walletBalance: 0,
    }
  }

  // Calcular semanas distintas
  const weeks = new Set(
    orders.map((o) => {
      const d = new Date(o.created_at)
      // ISO week number
      const jan4 = new Date(d.getFullYear(), 0, 4)
      const weekNum = Math.ceil(
        ((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7
      )
      return `${d.getFullYear()}-W${weekNum}`
    })
  )

  // Obtener saldo del monedero
  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance_credits")
    .eq("user_id", user.id)
    .single()

  // Determinar nivel actual
  const tierMap: Record<number, { name: string; pct: number }> = {
    1: { name: "Verde", pct: 5 },
    2: { name: "Plata", pct: 10 },
    3: { name: "Oro", pct: 15 },
    4: { name: "Diamante", pct: 20 },
  }
  const weekCount = weeks.size
  const tier = tierMap[Math.min(weekCount, 4)]

  return {
    weeksWithPurchases: weekCount,
    currentTier: tier.name,
    currentTierPct: tier.pct,
    totalCashbackThisMonth: orders.reduce(
      (sum, o) => sum + (Number(o.cashback_credits) || 0),
      0
    ),
    totalOrdersThisMonth: orders.length,
    walletBalance: Number(wallet?.balance_credits ?? 0),
  }
}

// ============================================================
// CANJE DE CRÉDITOS (SERVICE ROLE)
// ============================================================

/**
 * Canjea créditos del monedero para pagar un servicio interno.
 * REQUIERE service_role key — solo se ejecuta desde el backend/admin.
 *
 * @param userId  UUID del usuario
 * @param amount  Cantidad a canjear (positiva, se convierte a negativa)
 * @param concept Descripción del servicio canjeado
 */
export async function redeemCredits(
  userId: string,
  amount: number,
  concept: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  // Esta función debe llamarse con el service_role client
  const { createServiceClient } = await import("@/lib/supabase/service")
  const supabase = await createServiceClient()

  if (amount <= 0) {
    return { success: false, newBalance: 0, error: "El monto a canjear debe ser positivo" }
  }

  // Verificar saldo suficiente
  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_credits")
    .eq("user_id", userId)
    .single()

  if (!wallet) {
    return { success: false, newBalance: 0, error: "Monedero no encontrado" }
  }

  if (Number(wallet.balance_credits) < amount) {
    return {
      success: false,
      newBalance: Number(wallet.balance_credits),
      error: `Saldo insuficiente. Disponible: $${wallet.balance_credits} créditos`,
    }
  }

  // Insertar transacción (negativa = canje)
  const txAmount = -amount
  const { error: txError } = await supabase
    .from("wallet_transactions")
    .insert({
      wallet_id: wallet.id,
      amount: txAmount,
      concept,
      order_id: null,
    })

  if (txError) {
    return { success: false, newBalance: Number(wallet.balance_credits), error: txError.message }
  }

  // Actualizar saldo
  const newBalance = Number(wallet.balance_credits) - amount
  await supabase
    .from("wallets")
    .update({ balance_credits: newBalance, updated_at: new Date().toISOString() })
    .eq("id", wallet.id)

  return { success: true, newBalance }
}
