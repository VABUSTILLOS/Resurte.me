import { NextRequest, NextResponse } from "next/server"
import { reconcileStalePayments } from "@/lib/reconcile-payments"
import { logger } from "@/lib/logger"

/**
 * GET /api/cron/reconcile-payments
 *
 * Endpoint protegido (CRON_SECRET) que envuelve reconcileStalePayments()
 * (@/lib/reconcile-payments). La corrida programada vive en el cron diario
 * consolidado (/api/cron/daily) — el plan Hobby solo permite crons diarios;
 * este endpoint queda para ejecución manual/externa.
 */

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  // Fail closed: sin CRON_SECRET configurado el endpoint no se expone.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await reconcileStalePayments()
    return NextResponse.json(result)
  } catch (err) {
    logger.error("reconcile-payments error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
