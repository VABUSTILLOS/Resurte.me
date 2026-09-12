import { logger } from "@/lib/logger"
/**
 * GET /api/cron/daily
 *
 * Cron diario consolidado: ejecuta secuencialmente los 4 jobs que antes
 * corrían como crons separados en vercel.json (payment-reminders 8:00,
 * reactivation 9:00, abandoned-cart 12:00, foodos/campaigns 0:00).
 * Un solo cold start diario en vez de cuatro (ahorro de Active CPU).
 *
 * Protegido con el header Authorization: Bearer <CRON_SECRET> (Vercel Cron
 * lo envía automáticamente cuando CRON_SECRET está configurado).
 */

import { NextRequest, NextResponse } from "next/server"
import { checkAndSendPaymentReminders } from "@/lib/workflows"
import { retryFailedOrderEmails } from "@/lib/order-emails"
import { runDueFoodosCampaigns } from "@/lib/foodos-campaigns"

// Los 4 jobs comparten un solo presupuesto de tiempo.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  // Fail closed: sin CRON_SECRET configurado el endpoint no se expone.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  const jobs: Array<[string, () => Promise<unknown>]> = [
    ["payment-reminders", () => checkAndSendPaymentReminders()],
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
    // Reconciliación de pagos Stripe (antes cron */15 — Hobby solo permite
    // crons diarios; queda como job del consolidado + endpoint manual).
    [
      "reconcile-payments",
      async () => {
        const { reconcileStalePayments } = await import("@/lib/reconcile-payments")
        return reconcileStalePayments()
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
