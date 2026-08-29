import { logger } from "@/lib/logger"
// ============================================================
// RECORDATORIOS DE RECOMPRA (cron diario)
// ============================================================
// Detecta clientes cuyo intervalo típico de recompra se cumple hoy y les
// envía un email de "es momento de resurtir". Dedupe por ciclo: no se
// vuelve a enviar hasta que el cliente haga otro pedido.

import { createServiceClient } from "@/lib/supabase/service"
import { sendEmail, reorderReminderEmailHtml } from "@/lib/email"
import { computeReorderIntervalDays } from "@/lib/reorder-heuristics"
import type { CronResult } from "@/lib/email-workflows"

const DAY_MS = 24 * 60 * 60 * 1000
/** Solo se consideran pedidos de los últimos 120 días para la cadencia. */
const HISTORY_DAYS = 120
/** Tolerancia: recordar dentro de [intervalo, intervalo + 2] días. */
const WINDOW_DAYS = 2
/** Tope de pedidos escaneados por corrida (protege el presupuesto del cron). */
const MAX_ORDERS_SCANNED = 5000

export async function checkReorderReminders(): Promise<CronResult> {
  const supabase = await createServiceClient()

  const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS).toISOString()
  const { data: orders, error } = await supabase
    .from("orders")
    .select("user_id, created_at")
    .not("user_id", "is", null)
    .neq("status", "cancelled")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ORDERS_SCANNED)

  if (error) {
    logger.error("[REORDER-REMINDER] Query error:", error)
    return { success: false, sent: 0, failed: 0, total: 0, message: error.message }
  }

  if (!orders || orders.length === 0) {
    return { success: true, sent: 0, failed: 0, total: 0, message: "No orders in window" }
  }

  // Agrupa las fechas de pedido por usuario (más reciente primero).
  const byUser = new Map<string, string[]>()
  for (const o of orders as { user_id: string; created_at: string }[]) {
    const list = byUser.get(o.user_id)
    if (list) list.push(o.created_at)
    else byUser.set(o.user_id, [o.created_at])
  }

  // Candidatos: su intervalo típico se cumple hoy (dentro de la ventana).
  const now = Date.now()
  const candidates: { userId: string; daysSince: number }[] = []
  for (const [userId, dates] of byUser) {
    const interval = computeReorderIntervalDays(dates)
    if (interval === null) continue
    const lastOrderAt = new Date(dates[0]!).getTime()
    const daysSince = (now - lastOrderAt) / DAY_MS
    if (daysSince >= interval && daysSince <= interval + WINDOW_DAYS) {
      candidates.push({ userId, daysSince: Math.floor(daysSince) })
    }
  }

  if (candidates.length === 0) {
    return { success: true, sent: 0, failed: 0, total: 0, message: "No candidates today" }
  }

  // Dedupe por ciclo: si ya se envió un recordatorio DESPUÉS de su último
  // pedido, no repetir hasta que vuelva a comprar.
  const { data: alreadySent } = await supabase
    .from("email_logs")
    .select("user_id, created_at")
    .eq("email_type", "reorder_reminder")
    .in("user_id", candidates.map((c) => c.userId))

  const lastReminderAt = new Map<string, number>()
  for (const log of alreadySent ?? []) {
    const t = new Date(log.created_at as string).getTime()
    const prev = lastReminderAt.get(log.user_id as string)
    if (prev === undefined || t > prev) lastReminderAt.set(log.user_id as string, t)
  }

  let sent = 0
  let failed = 0
  let processed = 0

  for (const { userId, daysSince } of candidates) {
    const lastOrderAt = new Date(byUser.get(userId)![0]!).getTime()
    const remindedAt = lastReminderAt.get(userId)
    if (remindedAt !== undefined && remindedAt > lastOrderAt) continue

    processed++
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId)
      const email = authUser?.user?.email
      if (!email) {
        failed++
        continue
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle()
      const name = profile?.full_name?.split(" ")[0] ?? "chef"

      const result = await sendEmail({
        to: email,
        subject: "🥑 ¿Toca resurtir? Tus insumos te esperan",
        html: reorderReminderEmailHtml({
          name,
          daysSinceLastOrder: daysSince,
          shopUrl: "https://resurte.me/?utm_source=reorder_reminder&utm_medium=email",
        }),
        tag: "reorder-reminder",
      })

      await supabase.from("email_logs").insert({
        user_id: userId,
        email_to: email,
        email_type: "reorder_reminder",
        status: result.ok ? "sent" : "failed",
        error: result.error ?? null,
        metadata: { days_since_last_order: daysSince, resend_id: result.id },
      })

      if (result.ok) sent++
      else failed++
    } catch (err) {
      logger.error(`[REORDER-REMINDER] Error for user ${userId}:`, err)
      failed++
    }
  }

  return { success: true, sent, failed, total: processed }
}
