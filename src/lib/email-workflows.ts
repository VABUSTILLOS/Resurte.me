import { logger } from "@/lib/logger"
/**
 * Email Workflow Engine — Resurte.me
 * ===================================
 * Cron-triggered email jobs for cart recovery & reactivation.
 *
 * Jobs:
 *  1. checkAbandonedCarts()  — Emails users who left items in cart 2-24h ago
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

export async function checkAbandonedCarts(): Promise<CronResult> {
  const supabase = await createServiceClient()

  const now = new Date()
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const { data: orders, error: orderErr } = await supabase
    .from("orders")
    .select("id, user_id, total, created_at")
    .eq("status", "pending")
    .eq("payment_status", "pending")
    // Los pedidos en efectivo (cash_on_delivery) quedan "pending" hasta que la
    // tienda los confirma, pero NO son carritos abandonados: ya son pedidos
    // reales en espera. Solo los métodos con pago anticipado pueden abandonarse.
    .not("payment_method", "eq", "cash_on_delivery")
    .gte("created_at", twentyFourHoursAgo)
    .lte("created_at", twoHoursAgo)
    .order("created_at", { ascending: false })

  if (orderErr) {
    logger.error("[ABANDONED-CART] Query error:", orderErr)
    return { success: false, sent: 0, failed: 0, total: 0, message: orderErr.message }
  }

  if (!orders || orders.length === 0) {
    return { success: true, sent: 0, failed: 0, total: 0, message: "No abandoned carts found" }
  }

  const orderIds = orders.map((o) => o.id)
  const { data: alreadySent } = await supabase
    .from("email_logs")
    .select("order_id")
    .eq("email_type", "abandoned_cart")
    .in("order_id", orderIds)

  const sentOrderIds = new Set((alreadySent ?? []).map((e: { order_id: number }) => e.order_id))
  const toProcess = orders.filter((o) => !sentOrderIds.has(o.id))

  if (toProcess.length === 0) {
    return { success: true, sent: 0, failed: 0, total: 0, message: "All already notified" }
  }

  let sent = 0
  let failed = 0

  for (const order of toProcess) {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(order.user_id)
      const email = authUser?.user?.email

      if (!email) {
        await supabase.from("email_logs").insert({
          user_id: order.user_id,
          email_to: "unknown",
          email_type: "abandoned_cart",
          order_id: order.id,
          status: "failed",
          error: "No email on user profile",
          metadata: { reason: "no_email" },
        })
        failed++
        continue
      }

      const { data: items } = await supabase
        .from("order_items")
        .select("quantity, unit_price")
        .eq("order_id", order.id)
        .limit(5)

      const itemCount = items?.length ?? 0
      const itemsPreview = `${itemCount} producto(s) · Total: $${(order.total ?? 0).toFixed(2)} MXN`
      const cartUrl = `https://resurte.me/cart?restore=${order.id}`

      const result = await sendEmail({
        to: email,
        subject: "👋 Tu carrito te espera en Resurte.me",
        html: abandonedCartEmailHtml({ itemCount, itemsPreview, cartUrl }),
        tag: "abandoned-cart",
      })

      await supabase.from("email_logs").insert({
        user_id: order.user_id,
        email_to: email,
        email_type: "abandoned_cart",
        order_id: order.id,
        status: result.ok ? "sent" : "failed",
        error: result.error ?? null,
        metadata: { item_count: itemCount, total: order.total, resend_id: result.id },
      })

      if (result.ok) sent++
      else failed++
    } catch (err) {
      logger.error(`[ABANDONED-CART] Error processing order ${order.id}:`, err)
      failed++
    }
  }

  return { success: true, sent, failed, total: toProcess.length }
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
