"use server"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getActivePersonalCoupon } from "@/lib/repurchase-coupon"
import { computeRunningOutProducts } from "@/lib/reorder-heuristics"
import { isoWeek, QUALIFYING_WEEK_MIN } from "@/lib/utils"
import { computeWeekProgress, type WeekProgress } from "@/lib/wallet-progress"
import { summarizeWallet, type WalletSummary } from "@/lib/wallet-summary"
import {
  summarizeWalletExpiry,
  type WalletExpirySummary,
} from "@/lib/wallet-expiry"
import type {
  OrderWithCashback,
  OrderItem,
  Wallet,
  WalletTransaction,
  WalletHistoryPage,
  WalletHistoryFilter,
  RepurchaseCouponInfo,
} from "@/types"

/**
 * Cupón personal de recompra/reactivación vigente del usuario autenticado.
 * Lo usa el home post-login para mostrar el banner "tienes un cupón".
 */
export async function getActiveRepurchaseCoupon(): Promise<RepurchaseCouponInfo | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const service = await createServiceClient()
  return getActivePersonalCoupon(service, user.id)
}

/**
 * Productos que "se le están acabando" al usuario según su cadencia de
 * recompra (heurística de reorder-heuristics). Mira los últimos 20 pedidos.
 */
export async function getRunningOutProducts(): Promise<
  { product_id: number; daysSinceLast: number; avgIntervalDays: number }[]
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("orders")
    .select("created_at, order_items(product_id)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20)

  if (!data) return []

  const purchases = data.flatMap((order) =>
    ((order.order_items ?? []) as { product_id: number }[]).map((item) => ({
      product_id: item.product_id,
      purchased_at: order.created_at as string,
    }))
  )
  return computeRunningOutProducts(purchases)
}

// ============================================================
// HISTORIAL DE COMPRAS DEL USUARIO
// ============================================================

/** Item de orden enriquecido con el nombre/imagen del producto */
export type OrderItemWithProduct = OrderItem & {
  product_name: string
  product_image: string
}

/**
 * Obtiene todas las órdenes del usuario autenticado con sus items.
 * Ordenado por fecha descendente (más reciente primero).
 */
export async function getUserPurchaseHistory(
  page: number = 0,
  pageSize: number = 10
): Promise<{
  orders: (OrderWithCashback & { items: OrderItemWithProduct[] })[]
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
    .select("*, order_items(*, products(id, name, image_url, slug))", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (!data) {
    return { orders: [], total: 0, hasMore: false }
  }

  const orders = data.map((row) => {
    const { order_items, ...order } = row as OrderWithCashback & {
      order_items: (OrderItem & {
        products: { id: number; name: string; image_url: string | null; slug: string } | null
      })[]
    }
    const items: OrderItemWithProduct[] = (order_items ?? []).map((item) => ({
      id: item.id,
      order_id: item.order_id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      product_name: item.products?.name || `Producto #${item.product_id}`,
      product_image: item.products?.image_url || "",
    }))
    return { ...order, items }
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
 *
 * @param filter "all" (default) | "earned" (solo abonos) | "redeemed" (solo canjes)
 */
export async function getWalletHistory(
  page: number = 0,
  pageSize: number = 20,
  filter: WalletHistoryFilter = "all"
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

  let query = supabase
    .from("wallet_transactions")
    .select("*", { count: "exact" })
    .eq("wallet_id", wallet.id)

  if (filter === "earned") query = query.gt("amount", 0)
  else if (filter === "redeemed") query = query.lt("amount", 0)

  const { data, count } = await query
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
// RESUMEN DEL MONEDERO (TRANSPARENCIA)
// ============================================================

/**
 * Resumen del monedero: saldo, total acumulado, total canjeado y neto.
 * Alimenta las tarjetas de transparencia del monedero.
 */
export async function getWalletSummary(): Promise<WalletSummary | null> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_credits")
    .eq("user_id", user.id)
    .single()

  if (!wallet) return summarizeWallet([])

  const { data: movements } = await supabase
    .from("wallet_transactions")
    .select("amount, created_at")
    .eq("wallet_id", wallet.id)

  return summarizeWallet(movements ?? [], {
    balance: Number(wallet.balance_credits ?? 0),
  })
}

// ============================================================
// CADUCIDAD DE LOS CRÉDITOS (R17)
// ============================================================

/**
 * Cuánto del saldo está vigente, por vencer o ya vencido, repartiendo los
 * canjes entre los abonos que los financiaron (FIFO).
 *
 * Solo calcula para mostrar: quien mueve dinero es `expire_wallet_credits`
 * (migración 00133). Devuelve `null` si no hay sesión o no hay monedero.
 *
 * `expires_at` no existe hasta que 00132 esté aplicada (42703), así que se
 * reintenta sin la columna: `summarizeWalletExpiry` deriva entonces la fecha
 * con la misma regla que el backfill, en vez de dejar la tarjeta en blanco.
 */
export async function getWalletExpiry(): Promise<WalletExpirySummary | null> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!wallet) return null

  const withExpiry = await supabase
    .from("wallet_transactions")
    .select("id, amount, created_at, expires_at")
    .eq("wallet_id", wallet.id)
    .order("created_at", { ascending: true })

  // 42703 = wallet_transactions.expires_at aún no existe (00132 sin aplicar).
  const movements =
    withExpiry.error?.code === "42703"
      ? (
          await supabase
            .from("wallet_transactions")
            .select("id, amount, created_at")
            .eq("wallet_id", wallet.id)
            .order("created_at", { ascending: true })
        ).data
      : withExpiry.data

  return summarizeWalletExpiry(movements ?? [])
}

// ============================================================
// TOTAL DE RECOMPENSAS ACUMULADAS
// ============================================================

/**
 * Suma todos los abonos positivos del monedero (cashback) del usuario
 * autenticado. Es el total de recompensas acumuladas desde que entró
 * al programa, independiente del mes en curso.
 */
export async function getTotalRewards(): Promise<number> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return 0

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!wallet) return 0

  const { data: txs } = await supabase
    .from("wallet_transactions")
    .select("amount")
    .eq("wallet_id", wallet.id)
    .gt("amount", 0)

  return (txs ?? []).reduce((sum, t) => sum + Number(t.amount), 0)
}

// ============================================================
// DASHBOARD: RESUMEN DE CASHBACK DEL MES ACTUAL
// ============================================================

/**
 * Retorna estadísticas de cashback del mes en curso para el usuario autenticado.
 * Útil para mostrar el progreso semanal hacia el siguiente nivel en el dashboard.
 * Una semana califica si el gasto acumulado en esa semana ISO es >= $2,500.
 */
export async function getMonthlyCashbackProgress(): Promise<{
  weeksWithPurchases: number
  currentTier: string
  currentTierPct: number
  totalCashbackThisMonth: number
  totalOrdersThisMonth: number
  monthlySpend: number
  walletBalance: number
} | null> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Órdenes PAGADAS del mes con su total y cashback (todas las compras
  // generan cashback; solo las pagadas cuentan para nivel/semanas, igual
  // que la migración 00029).
  const { data: orders, error } = await supabase
    .from("orders")
    .select("created_at, total, cashback_credits")
    .eq("user_id", user.id)
    .gte("created_at", monthStart)
    .eq("payment_status", "paid")
    .neq("status", "cancelled")

  if (error || !orders) {
    return {
      weeksWithPurchases: 0,
      currentTier: "Verde",
      currentTierPct: 5,
      totalCashbackThisMonth: 0,
      totalOrdersThisMonth: 0,
      monthlySpend: 0,
      walletBalance: 0,
    }
  }

  // Sumar gasto por semana ISO: una semana califica si acumula >= $2,500
  const spendByWeek = new Map<string, number>()
  for (const o of orders) {
    const d = new Date(o.created_at)
    const weekNum = isoWeek(d)
    const key = `${d.getFullYear()}-W${weekNum}`
    spendByWeek.set(key, (spendByWeek.get(key) ?? 0) + Number(o.total ?? 0))
  }

  const weekCount = Array.from(spendByWeek.values()).filter(
    (spend) => spend >= QUALIFYING_WEEK_MIN
  ).length

  // Obtener saldo del monedero
  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance_credits")
    .eq("user_id", user.id)
    .single()

  // Determinar nivel actual: 0-1 semanas -> Verde, 2 -> Plata, 3 -> Oro, 4+ -> Diamante
  const tierMap: Record<number, { name: string; pct: number }> = {
    0: { name: "Verde", pct: 5 },
    1: { name: "Verde", pct: 5 },
    2: { name: "Plata", pct: 10 },
    3: { name: "Oro", pct: 15 },
    4: { name: "Diamante", pct: 20 },
  }
  const tier = tierMap[Math.min(weekCount, 4)] ?? { name: "Verde", pct: 5 }

  return {
    weeksWithPurchases: weekCount,
    currentTier: tier.name,
    currentTierPct: tier.pct,
    totalCashbackThisMonth: orders.reduce(
      (sum, o) => sum + (Number(o.cashback_credits) || 0),
      0
    ),
    totalOrdersThisMonth: orders.length,
    monthlySpend: orders.reduce((sum, o) => sum + Number(o.total ?? 0), 0),
    walletBalance: Number(wallet?.balance_credits ?? 0),
  }
}

/**
 * Progreso de la semana en curso: gasto pagado acumulado, cuánto falta para
 * calificar la semana ($2,500) y cuántos días quedan. Alimenta el bloque
 * "Esta semana" del dashboard de recompensas.
 *
 * Trae 45 días de órdenes pagadas para cubrir la semana ISO en curso aunque
 * haya empezado en el mes anterior; el filtro por mes lo hace el cálculo puro.
 */
export async function getWeekProgress(): Promise<WeekProgress | null> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const since = new Date(Date.now() - 45 * 86400000).toISOString()

  const { data, error } = await supabase
    .from("orders")
    .select("created_at, total")
    .eq("user_id", user.id)
    .eq("payment_status", "paid")
    .neq("status", "cancelled")
    .gte("created_at", since)

  if (error) return null

  return computeWeekProgress(data ?? [])
}

// ============================================================
// CANJE DE CRÉDITOS (SERVICE ROLE)
// ============================================================

/**
 * Canjea créditos del monedero para pagar un servicio interno.
 * REQUIERE service_role key — solo se ejecuta desde el backend/admin.
 *
 * Usa la función Postgres `redeem_service()` que bloquea la fila del
 * monedero con FOR UPDATE para evitar débitos concurrentes y registra
 * la redención de forma atómica (es el mismo flujo que expone /api/redeem).
 *
 * @param userId  UUID del usuario
 * @param service Servicio canjeado (id/name/cost tomados del catálogo,
 *                nunca confiar en los valores enviados por el cliente)
 */
export async function redeemCredits(
  userId: string,
  service: { id: string; name: string; cost: number }
): Promise<{
  success: boolean
  newBalance?: number
  redemptionId?: string | null
  error?: string
}> {
  // Esta función debe llamarse con el service_role client
  const { createServiceClient } = await import("@/lib/supabase/service")
  const supabase = await createServiceClient()

  const { data, error } = await supabase.rpc("redeem_service", {
    p_user_id: userId,
    p_service_id: service.id,
    p_service_name: service.name,
    p_cost: service.cost,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const result = data?.[0]
  if (!result?.success) {
    return {
      success: false,
      error: result?.error_msg ?? "No se pudo completar el canje",
    }
  }

  return {
    success: true,
    newBalance: result.new_balance,
    redemptionId: result.redemption_id ?? null,
  }
}

// ── Onboarding de recompensas persistente (migración 00073) ──

/**
 * true si el usuario con sesión ya completó el onboarding de /recompensas
 * (profiles.rewards_onboarded_at). null sin sesión. Ante error o si la
 * columna aún no existe (migración sin aplicar), devuelve null para que el
 * cliente use su localStorage.
 */

