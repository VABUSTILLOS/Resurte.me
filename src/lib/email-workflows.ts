import { logger } from "@/lib/logger"
/**
 * Email Workflow Engine — Resurte.me
 * ===================================
 * Cron-triggered email jobs for cart recovery & reactivation.
 *
 * Jobs:
 *  1. checkAbandonedCarts()  — 3-touch recovery sequence (2h / 24h / 48h)
 *  2. checkInactiveUsers()   — Emails users inactive for 30/60/90 days
 *
 * All email sending goes through sendEmail() from @/lib/email which uses
 * the Resend REST API (fetch-based, no npm package needed).
 * If RESEND_API_KEY is missing, emails are logged to console in dev.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { sendEmail, abandonedCartEmailHtml, reactivationEmailHtml } from "@/lib/email"
import { getActivePersonalCoupon, issuePersonalCoupon } from "@/lib/repurchase-coupon"

// ── Types ────────────────────────────────────────────────────────

export interface CronResult {
  success: boolean
  sent: number
  failed: number
  total: number
  message?: string
}

// ── Abandoned Cart Recovery ──────────────────────────────────────
// Secuencia de 3 toques estilo SamCart/ThriveCart:
//   Toque 1 (2–26 h): recordatorio simple.
//   Toque 2 (26–50 h): cupón personal de un solo uso (5%, vigencia 3 días).
//   Toque 3 (50–74 h): último aviso con urgencia (el cupón expira).
// El cron corre una vez al día; las ventanas cubren 24 h cada una y
// email_logs (email_type + order_id) deduplica cada toque por pedido.
// Guests: se usa orders.customer_email cuando no hay cuenta auth;
// el cupón personal solo se emite para usuarios con user_id.

export const ABANDONED_CART_TOUCHES = [
  {
    type: "abandoned_cart",
    minHours: 2,
    maxHours: 26,
    subject: "👋 Tu carrito te espera en Resurte.me",
    withCoupon: false,
    finalNotice: false,
  },
  {
    type: "abandoned_cart_24h",
    minHours: 26,
    maxHours: 50,
    subject: "🧺 Apartamos tu pedido — y te regalamos 5% de descuento",
    withCoupon: true,
    finalNotice: false,
  },
  {
    type: "abandoned_cart_48h",
    minHours: 50,
    maxHours: 74,
    subject: "⏳ Último aviso: tu cupón de descuento expira pronto",
    withCoupon: true,
    finalNotice: true,
  },
] as const

export type AbandonedCartTouch = (typeof ABANDONED_CART_TOUCHES)[number]

/** Devuelve el toque que corresponde a la edad del carrito, o null. */
export function abandonedCartTouchForAge(ageHours: number): AbandonedCartTouch | null {
  return (
    ABANDONED_CART_TOUCHES.find((t) => ageHours >= t.minHours && ageHours < t.maxHours) ?? null
  )
}

export async function checkAbandonedCarts(): Promise<CronResult> {
  const supabase = await createServiceClient()

  const now = new Date()
  const firstTouch = ABANDONED_CART_TOUCHES[0]!
  const lastTouch = ABANDONED_CART_TOUCHES[ABANDONED_CART_TOUCHES.length - 1]!
  const oldestWindowStart = new Date(
    now.getTime() - lastTouch.maxHours * 60 * 60 * 1000,
  ).toISOString()
  const newestWindowEnd = new Date(
    now.getTime() - firstTouch.minHours * 60 * 60 * 1000,
  ).toISOString()

  // restore_token permite restaurar el carrito a invitados (capability URL).
  // Si la migración 00063 aún no se aplicó (columna inexistente), se reintenta
  // sin ella y el enlace queda solo para usuarios con sesión (comportamiento previo).
  const baseQuery = (columns: string) =>
    supabase
      .from("orders")
      .select(columns)
      .eq("status", "pending")
      .eq("payment_status", "pending")

  type AbandonedOrder = {
    id: number
    user_id: string | null
    customer_email: string | null
    total: number
    created_at: string
    restore_token?: string | null
  }
  let orders: AbandonedOrder[] | null = null

  const withToken = await baseQuery("id, user_id, customer_email, total, created_at, restore_token")
    // Los pedidos en efectivo (cash_on_delivery) quedan "pending" hasta que la
    // tienda los confirma, pero NO son carritos abandonados: ya son pedidos
    // reales en espera. Solo los métodos con pago anticipado pueden abandonarse.
    .not("payment_method", "eq", "cash_on_delivery")
    .gte("created_at", oldestWindowStart)
    .lte("created_at", newestWindowEnd)
    .order("created_at", { ascending: false })

  if (withToken.error && withToken.error.code === "42703") {
    const withoutToken = await baseQuery("id, user_id, customer_email, total, created_at")
      .not("payment_method", "eq", "cash_on_delivery")
      .gte("created_at", oldestWindowStart)
      .lte("created_at", newestWindowEnd)
      .order("created_at", { ascending: false })
    orders = withoutToken.data as unknown as AbandonedOrder[] | null
    if (withoutToken.error) {
      logger.error("[ABANDONED-CART] Query error:", withoutToken.error)
      return { success: false, sent: 0, failed: 0, total: 0, message: withoutToken.error.message }
    }
  } else if (withToken.error) {
    logger.error("[ABANDONED-CART] Query error:", withToken.error)
    return { success: false, sent: 0, failed: 0, total: 0, message: withToken.error.message }
  } else {
    orders = withToken.data as unknown as AbandonedOrder[] | null
  }

  if (!orders || orders.length === 0) {
    return { success: true, sent: 0, failed: 0, total: 0, message: "No abandoned carts found" }
  }

  // Agrupar pedidos por toque según su edad
  const nowMs = now.getTime()
  const byTouch = new Map<AbandonedCartTouch, typeof orders>()
  for (const order of orders) {
    const ageHours = (nowMs - new Date(order.created_at).getTime()) / (60 * 60 * 1000)
    const touch = abandonedCartTouchForAge(ageHours)
    if (!touch) continue
    const list = byTouch.get(touch) ?? []
    list.push(order)
    byTouch.set(touch, list)
  }

  if (byTouch.size === 0) {
    return { success: true, sent: 0, failed: 0, total: 0, message: "No carts in touch windows" }
  }

  // Dedupe en batch por toque (email_type + order_id)
  const allOrderIds = orders.map((o) => o.id)
  const { data: alreadySent } = await supabase
    .from("email_logs")
    .select("order_id, email_type")
    .in(
      "email_type",
      ABANDONED_CART_TOUCHES.map((t) => t.type),
    )
    .in("order_id", allOrderIds)

  const sentKeys = new Set(
    (alreadySent ?? []).map((e: { order_id: number; email_type: string }) =>
      `${e.email_type}:${e.order_id}`,
    ),
  )

  let sent = 0
  let failed = 0
  let total = 0

  for (const [touch, touchOrders] of byTouch) {
    const toProcess = touchOrders.filter((o) => !sentKeys.has(`${touch.type}:${o.id}`))
    total += toProcess.length

    for (const order of toProcess) {
      try {
        // Email: cuenta auth si existe; si es guest, el capturado en checkout
        let email: string | null = null
        if (order.user_id) {
          const { data: authUser } = await supabase.auth.admin.getUserById(order.user_id)
          email = authUser?.user?.email ?? null
        }
        if (!email) email = order.customer_email ?? null

        if (!email) {
          await supabase.from("email_logs").insert({
            user_id: order.user_id,
            email_to: "unknown",
            email_type: touch.type,
            order_id: order.id,
            status: "failed",
            error: "No email available",
            metadata: { reason: "no_email" },
          })
          failed++
          continue
        }

        // Cupón personal solo para usuarios registrados (requiere user_id)
        const coupon =
          touch.withCoupon && order.user_id
            ? await issuePersonalCoupon(supabase, order.user_id, "abandoned_cart")
            : null

        const { data: items } = await supabase
          .from("order_items")
          .select("quantity, unit_price")
          .eq("order_id", order.id)
          .limit(5)

        const itemCount = items?.length ?? 0
        const itemsPreview = `${itemCount} producto(s) · Total: $${(order.total ?? 0).toFixed(2)} MXN`
        // Con restore_token el enlace funciona también para invitados;
        // sin él (migración 00063 pendiente) solo restaura con sesión.
        const cartUrl = order.restore_token
          ? `https://resurte.me/cart?restore=${order.id}&t=${order.restore_token}`
          : `https://resurte.me/cart?restore=${order.id}`

        const result = await sendEmail({
          to: email,
          subject: touch.subject,
          html: abandonedCartEmailHtml({
            itemCount,
            itemsPreview,
            cartUrl,
            couponCode: coupon?.code,
            couponDiscountPct: coupon?.discount_value,
            couponExpiresAt: coupon
              ? new Date(coupon.expires_at).toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "long",
                })
              : undefined,
            finalNotice: touch.finalNotice,
          }),
          tag: "abandoned-cart",
        })

        await supabase.from("email_logs").insert({
          user_id: order.user_id,
          email_to: email,
          email_type: touch.type,
          order_id: order.id,
          status: result.ok ? "sent" : "failed",
          error: result.error ?? null,
          metadata: {
            item_count: itemCount,
            total: order.total,
            resend_id: result.id,
            coupon_code: coupon?.code ?? null,
          },
        })

        if (result.ok) sent++
        else failed++
      } catch (err) {
        logger.error(`[ABANDONED-CART] Error processing order ${order.id}:`, err)
        failed++
      }
    }
  }

  return { success: true, sent, failed, total }
}

// ── Reactivation / Win-Back ──────────────────────────────────────

const REACTIVATION_WINDOWS = [
  { days: 30, type: "reactivation_30" as const, subject: "¿Todo bien? Te extrañamos en Resurte.me 🥑" },
  { days: 60, type: "reactivation_60" as const, subject: "2 meses sin verte — mira lo nuevo 🚚" },
  { days: 90, type: "reactivation_90" as const, subject: "¡3 meses! Te tenemos una sorpresa 💰" },
]

export async function checkInactiveUsers(): Promise<CronResult> {
  const supabase = await createServiceClient()

  let totalSent = 0
  let totalFailed = 0
  let totalProcessed = 0

  for (const window of REACTIVATION_WINDOWS) {
    // Find users whose last sign-in was around `window.days` ago
    // Using auth.users.last_sign_in_at from Supabase Auth
    const { data: inactiveUsers, error: userErr } = await supabase.auth.admin.listUsers({
      perPage: 100,
    })

    if (userErr) {
      logger.error(`[REACTIVATION-${window.days}] Error listing users:`, userErr)
      totalFailed++
      continue
    }

    const candidates = (inactiveUsers?.users ?? []).filter((u) => {
      if (!u.email) return false
      const lastSignIn = u.last_sign_in_at
      if (!lastSignIn) return false
      // User last signed in roughly `window.days` ago (±2 day tolerance)
      const lastDate = new Date(lastSignIn)
      const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      return diffDays >= window.days - 2 && diffDays <= window.days + 2
    })

    for (const user of candidates) {
      totalProcessed++

      try {
        // Check if already sent this type
        const { data: existing } = await supabase
          .from("email_logs")
          .select("id")
          .eq("user_id", user.id)
          .eq("email_type", window.type)
          .limit(1)

        if (existing && existing.length > 0) continue // Already sent

        // Get profile info
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single()

        // Get cashback balance
        const { data: wallet } = await supabase
          .from("wallets")
          .select("balance_credits")
          .eq("user_id", user.id)
          .single()

        // Get loyalty tier from most recent order
        const { data: lastOrder } = await supabase
          .from("orders")
          .select("cashback_tier")
          .eq("user_id", user.id)
          .not("cashback_tier", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        const name = profile?.full_name?.split(" ")[0] ?? "chef"
        const cashbackBalance = wallet?.balance_credits ?? 0
        const tier = lastOrder?.cashback_tier ?? "Verde"

        // Cupón personal de reactivación ("te extrañamos"): reutiliza uno
        // vigente si ya existe para no acumular cupones por usuario.
        const coupon =
          (await getActivePersonalCoupon(supabase, user.id)) ??
          (await issuePersonalCoupon(supabase, user.id, "reactivation"))

        const result = await sendEmail({
          to: user.email!,
          subject: window.subject,
          html: reactivationEmailHtml({
            name,
            daysInactive: window.days,
            tier,
            cashbackBalance,
            panelUrl: "https://resurte.me/panel",
            ...(coupon
              ? {
                  couponCode: coupon.code,
                  couponDiscountPct: coupon.discount_value,
                  couponExpiresAt: new Date(coupon.expires_at).toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "long",
                  }),
                }
              : {}),
          }),
          tag: `reactivation-${window.days}d`,
        })

        await supabase.from("email_logs").insert({
          user_id: user.id,
          email_to: user.email!,
          email_type: window.type,
          status: result.ok ? "sent" : "failed",
          error: result.error ?? null,
          metadata: {
            days_inactive: window.days,
            tier,
            cashback_balance: cashbackBalance,
            ...(coupon ? { coupon_code: coupon.code } : {}),
          },
        })

        if (result.ok) totalSent++
        else totalFailed++
      } catch (err) {
        logger.error(`[REACTIVATION-${window.days}] Error for user ${user.id}:`, err)
        totalFailed++
      }
    }
  }

  return {
    success: true,
    sent: totalSent,
    failed: totalFailed,
    total: totalProcessed,
  }
}
