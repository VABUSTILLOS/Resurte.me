import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

// ============================================================
// CUPONES PERSONALES DE RECOMPRA
// ============================================================
// Incentivo post-compra: al confirmar un pedido el cliente recibe un
// cupón personal (un solo uso, vigencia corta) para su siguiente pedido.
// El cron de reactivación usa el mismo mecanismo con origin reactivation.

export const REPURCHASE_COUPON = {
  /** Descuento del cupón post-compra (porcentaje). */
  DISCOUNT_PERCENT: 5,
  /** Pedido mínimo para aplicar el cupón. */
  MIN_ORDER: 500,
  /** Días de vigencia del cupón post-compra. */
  VALIDITY_DAYS: 14,
  /** Días de vigencia del cupón de reactivación ("te extrañamos"). */
  REACTIVATION_VALIDITY_DAYS: 10,
} as const

type ServiceSupabase = Awaited<ReturnType<typeof createServiceClient>>

export interface IssuedCoupon {
  code: string
  discount_type: "percentage"
  discount_value: number
  min_order: number
  expires_at: string
}

function generateCode(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}-${suffix}`
}

/**
 * Emite un cupón personal de un solo uso para el usuario.
 * Retorna null si la inserción falla (best-effort: nunca bloquea la orden).
 */
export async function issuePersonalCoupon(
  supabase: ServiceSupabase,
  userId: string,
  origin: "post_purchase" | "reactivation",
): Promise<IssuedCoupon | null> {
  const prefix = origin === "post_purchase" ? "VUELVE" : "EXTRA"
  const validityDays =
    origin === "post_purchase"
      ? REPURCHASE_COUPON.VALIDITY_DAYS
      : REPURCHASE_COUPON.REACTIVATION_VALIDITY_DAYS
  const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000)

  // Reintenta ante colisión de código UNIQUE (probabilidad mínima).
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode(prefix)
    const { data, error } = await supabase
      .from("coupons")
      .insert({
        code,
        discount_type: "percentage",
        discount_value: REPURCHASE_COUPON.DISCOUNT_PERCENT,
        min_order: REPURCHASE_COUPON.MIN_ORDER,
        max_uses: 1,
        expires_at: expiresAt.toISOString(),
        user_id: userId,
        origin,
      })
      .select("code, discount_type, discount_value, min_order, expires_at")
      .single()

    if (!error && data) {
      return {
        code: data.code,
        discount_type: "percentage",
        discount_value: Number(data.discount_value),
        min_order: Number(data.min_order),
        expires_at: data.expires_at,
      }
    }
    // 23505 = unique_violation (código duplicado): reintentar con otro código
    if (error && error.code !== "23505") {
      logger.error("Personal coupon issue error:", error)
      return null
    }
  }
  return null
}

/**
 * Cupón personal vigente y sin usar del usuario, si existe.
 * Lo usa el home post-login para mostrar el banner "tienes un cupón".
 */
export async function getActivePersonalCoupon(
  supabase: ServiceSupabase,
  userId: string,
): Promise<IssuedCoupon | null> {
  const { data, error } = await supabase
    .from("coupons")
    .select("code, discount_type, discount_value, min_order, expires_at")
    .eq("user_id", userId)
    .eq("used_count", 0)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return {
    code: data.code,
    discount_type: "percentage",
    discount_value: Number(data.discount_value),
    min_order: Number(data.min_order),
    expires_at: data.expires_at,
  }
}
