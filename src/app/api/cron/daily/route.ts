import { logger } from "@/lib/logger"
/**
 * GET /api/cron/daily
 *
 * Cron diario consolidado: ejecuta secuencialmente los jobs que antes
 * corrían como crons separados en vercel.json (payment-reminders 8:00,
 * reactivation 9:00, abandoned-cart 12:00, foodos/campaigns 0:00), más
 * los que se añadieron después (reorder-reminders, retry-order-emails,
 * reconcile-payments, foodos-payment-reminders, price-index).
 * Un solo cold start diario en vez de varios (ahorro de Active CPU).
 *
 * Protegido con el header Authorization: Bearer <CRON_SECRET> (Vercel Cron
 * lo envía automáticamente cuando CRON_SECRET está configurado).
 */

import { NextRequest, NextResponse } from "next/server"
import { safeSecretEqual } from "@/lib/secret-equal"
import { checkAndSendPaymentReminders } from "@/lib/workflows"
import { checkAndSendFoodosPaymentReminders } from "@/lib/foodos-payment-reminders"
import { retryFailedOrderEmails } from "@/lib/order-emails"
import { runDueFoodosCampaigns } from "@/lib/foodos-campaigns"

// Los 4 jobs comparten un solo presupuesto de tiempo.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  // Fail closed: sin CRON_SECRET configurado el endpoint no se expone.
  if (!cronSecret || !safeSecretEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  const jobs: Array<[string, () => Promise<unknown>]> = [
    ["payment-reminders", () => checkAndSendPaymentReminders()],
    ["foodos-payment-reminders", () => checkAndSendFoodosPaymentReminders()],
    [
      "abandoned-cart",
      async () => {
        const { checkAbandonedCarts } = await import("@/lib/email-workflows")
        return checkAbandonedCarts()
      },
    ],
    [
      "reactivation",
      async () => {
        const { checkInactiveUsers } = await import("@/lib/email-workflows")
        return checkInactiveUsers()
      },
    ],
    [
      "reorder-reminders",
      async () => {
        const { checkReorderReminders } = await import("@/lib/reorder-reminders")
        return checkReorderReminders()
      },
    ],
    ["retry-order-emails", () => retryFailedOrderEmails()],
    ["foodos-campaigns", () => runDueFoodosCampaigns()],
    // Índice público de precios (Fase 6). El snapshot se congela por semana
    // ISO, así que correr a diario solo refresca el punto de la semana en
    // curso con los precios de hoy (idempotente por fecha).
    [
      "price-index",
      async () => {
        const { refreshPriceIndex } = await import("@/lib/price-index-refresh")
        return refreshPriceIndex()
      },
    ],
    // Reconciliación de pagos Stripe (antes cron */15 — Hobby solo permite
    // crons diarios; queda como job del consolidado + endpoint manual).
    [
      "reconcile-payments",
      async () => {
        const { reconcileStalePayments } = await import("@/lib/reconcile-payments")
        return reconcileStalePayments()
      },
    ],
    // Publicación programada de productos (00095): aplica publish_at /
    // unpublish_at vencidos; va ANTES del sync WA para que la cola recoja
    // los cambios de visibilidad recién aplicados.
    [
      "scheduled-publishing",
      async () => {
        const { applyScheduledPublishing } = await import("@/lib/scheduled-publishing")
        return applyScheduledPublishing()
      },
    ],
    // WA5 — vaciar la cola de sync automático del catálogo WhatsApp
    // (cambios de precio/imagen/stock/visibilidad encolados por admin).
    [
      "whatsapp-sync-queue",
      async () => {
        const { processWaSyncQueue } = await import("@/lib/whatsapp-sync-queue")
        return processWaSyncQueue()
      },
    ],
    // WB2/WB5 — resolver handles asíncronos de Meta (errores por producto)
    // y marcar runs huérfanos en 'running'.
    [
      "whatsapp-batch-status",
      async () => {
        const { resolvePendingSyncRuns } = await import("@/lib/whatsapp-batch-status")
        return resolvePendingSyncRuns()
      },
    ],
    // WC2 — motor de automatizaciones WhatsApp: carrito abandonado,
    // reactivación, rating post-entrega, onboarding y cumpleaños,
    // respetando la config persistida en whatsapp_automations.
    [
      "whatsapp-automations",
      async () => {
        const { runWhatsAppAutomations } = await import("@/lib/whatsapp-automations-engine")
        return runWhatsAppAutomations()
      },
    ],
    // Ronda 7 — purga de la papelera de productos: borra definitivamente los
    // que llevan más de 30 días con deleted_at (nunca los que tienen pedidos,
    // porque order_items.product_id es ON DELETE CASCADE).
    [
      "purge-trash",
      async () => {
        const { purgeTrashProducts } = await import("@/lib/trash")
        const { createServiceClient } = await import("@/lib/supabase/service")
        const supabase = await createServiceClient()
        return purgeTrashProducts(supabase)
      },
    ],
  ]

  // Secuencial e independiente: un job que falla no detiene a los demás.
  for (const [name, run] of jobs) {
    try {
      results[name] = await run()
    } catch (err) {
      logger.error(`[CRON-DAILY] ${name} error:`, err)
      results[name] = {
        success: false,
        error: err instanceof Error ? err.message : "Internal error",
      }
    }
  }

  return NextResponse.json({ success: true, jobs: results })
}
