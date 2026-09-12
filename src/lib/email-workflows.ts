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

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Batch-resuelve emails de auth para un conjunto de usuarios.
 * Una llamada paginada a listUsers en vez de un getUserById por usuario;
 * cae a getUserById solo para ids no presentes en el listado (p. ej. borrados).
 */
export async function resolveAuthEmails(
  supabase: ServiceClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const wanted = new Set(userIds)
  const emails = new Map<string, string>()
  if (wanted.size === 0) return emails

  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data) break
    for (const u of data.users) {
      if (u.email && wanted.has(u.id)) emails.set(u.id, u.email)
    }
    if (data.users.length < 1000 || emails.size === wanted.size) break
    page++
  }

  for (const id of wanted) {
    if (emails.has(id)) continue
    const { data } = await supabase.auth.admin.getUserById(id)
    const email = data?.user?.email
    if (email) emails.set(id, email)
  }
  return emails
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

  // Aplana los pedidos a procesar de todos los toques para precargar en batch.
  const processable = new Map<AbandonedCartTouch, AbandonedOrder[]>()
  const allToProcess: AbandonedOrder[] = []
  for (const [touch, touchOrders] of byTouch) {
    const toProcess = touchOrders.filter((o) => !sentKeys.has(`${touch.type}:${o.id}`))
    total += toProcess.length
    processable.set(touch, toProcess)
    allToProcess.push(...toProcess)
  }

  // Batch: emails de auth (1 listado paginado en vez de 1 query por pedido).
  const authEmails = await resolveAuthEmails(
    supabase,
    [...new Set(allToProcess.map((o) => o.user_id).filter((id): id is string => !!id))],
  )

  // Batch: conteo de items por pedido (1 query en vez de 1 por pedido).
  const itemCountByOrder = new Map<number, number>()
  if (allToProcess.length > 0) {
    const { data: allItems } = await supabase
      .from("order_items")
      .select("order_id")
      .in("order_id", allToProcess.map((o) => o.id))
    for (const it of (allItems ?? []) as { order_id: number }[]) {
      // El preview original leía con limit(5) por pedido.
      itemCountByOrder.set(it.order_id, Math.min((itemCountByOrder.get(it.order_id) ?? 0) + 1, 5))
    }
  }

  // Los logs se acumulan y se insertan en una sola query al final.
  const logRows: Record<string, unknown>[] = []

  for (const [touch, toProcess] of processable) {
    for (const order of toProcess) {
      try {
        // Email: cuenta auth si existe; si es guest, el capturado en checkout
        let email: string | null = null
        if (order.user_id) {
          email = authEmails.get(order.user_id) ?? null
        }
        if (!email) email = order.customer_email ?? null

        if (!email) {
          logRows.push({
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

        const itemCount = itemCountByOrder.get(order.id) ?? 0
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

        logRows.push({
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

  if (logRows.length > 0) {
    const { error: logErr } = await supabase.from("email_logs").insert(logRows)
    if (logErr) logger.error("[ABANDONED-CART] Error inserting email_logs:", logErr)
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

  // Un solo listado de usuarios para las 3 ventanas (antes: 1 query por ventana).
  const { data: inactiveUsers, error: userErr } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  })

  if (userErr) {
    logger.error("[REACTIVATION] Error listing users:", userErr)
    return { success: false, sent: 0, failed: 0, total: 0, message: String(userErr) }
  }

  const users = inactiveUsers?.users ?? []

  // Candidatos por ventana: último sign-in hace ~window.days días (±2).
  const candidatesByWindow = new Map<(typeof REACTIVATION_WINDOWS)[number], typeof users>()
  const allCandidateIds = new Set<string>()
  for (const window of REACTIVATION_WINDOWS) {
    const candidates = users.filter((u) => {
      if (!u.email) return false
      const lastSignIn = u.last_sign_in_at
      if (!lastSignIn) return false
      const diffDays = (Date.now() - new Date(lastSignIn).getTime()) / (1000 * 60 * 60 * 24)
      return diffDays >= window.days - 2 && diffDays <= window.days + 2
    })
    candidatesByWindow.set(window, candidates)
    for (const u of candidates) allCandidateIds.add(u.id)
  }

  if (allCandidateIds.size === 0) {
    return { success: true, sent: 0, failed: 0, total: 0 }
  }

  const candidateIds = [...allCandidateIds]

  // Batch: dedupe de los 3 tipos para todos los candidatos (1 query).
  const { data: alreadySent } = await supabase
    .from("email_logs")
    .select("user_id, email_type")
    .in("email_type", REACTIVATION_WINDOWS.map((w) => w.type))
    .in("user_id", candidateIds)

  const sentKeys = new Set(
    (alreadySent ?? []).map(
      (e: { user_id: string; email_type: string }) => `${e.email_type}:${e.user_id}`,
    ),
  )

  // Batch: profiles, wallets y último tier de cashback (3 queries totales,
  // antes eran 3 por usuario).
  const [{ data: profiles }, { data: wallets }, { data: tierOrders }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", candidateIds),
    supabase.from("wallets").select("user_id, balance_credits").in("user_id", candidateIds),
    supabase
      .from("orders")
      .select("user_id, cashback_tier, created_at")
      .in("user_id", candidateIds)
      .not("cashback_tier", "is", null)
      .order("created_at", { ascending: false }),
  ])

  const nameByUser = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]),
  )
  const balanceByUser = new Map(
    (wallets ?? []).map((w: { user_id: string; balance_credits: number }) => [
      w.user_id,
      w.balance_credits,
    ]),
  )
  const tierByUser = new Map<string, string>()
  for (const o of (tierOrders ?? []) as { user_id: string; cashback_tier: string }[]) {
    // Ya vienen ordenados desc: el primero por usuario es el más reciente.
    if (!tierByUser.has(o.user_id)) tierByUser.set(o.user_id, o.cashback_tier)
  }

  let totalSent = 0
  let totalFailed = 0
  let totalProcessed = 0
  const logRows: Record<string, unknown>[] = []

  for (const window of REACTIVATION_WINDOWS) {
    for (const user of candidatesByWindow.get(window) ?? []) {
      totalProcessed++

      try {
        if (sentKeys.has(`${window.type}:${user.id}`)) continue // Already sent

        const name = nameByUser.get(user.id)?.split(" ")[0] ?? "chef"
        const cashbackBalance = balanceByUser.get(user.id) ?? 0
        const tier = tierByUser.get(user.id) ?? "Verde"

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

        logRows.push({
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

  if (logRows.length > 0) {
    const { error: logErr } = await supabase.from("email_logs").insert(logRows)
    if (logErr) logger.error("[REACTIVATION] Error inserting email_logs:", logErr)
  }

  return {
    success: true,
    sent: totalSent,
    failed: totalFailed,
    total: totalProcessed,
  }
}
