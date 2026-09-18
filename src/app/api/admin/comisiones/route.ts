import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { getCommissionRate } from "@/lib/comercializacion/commissions"
import { validateAccrualInput } from "@/lib/comercializacion/commission-ledger"
import { rpcErrorResponse } from "./rpc-errors"

export const runtime = "nodejs"

/**
 * POST /api/admin/comisiones — devenga (o re-devenga) el periodo de un vendedor.
 *
 * El devengo lo calcula la base (`accrue_commission_period`, 00155): resuelve
 * la atribución vendedor→cliente y corta el mes en hora local. Esta ruta solo
 * valida la entrada, aplica la tasa global cuando no se manda una explícita y
 * traduce el error.
 *
 * No hay GET: la lectura del ledger vive en `getCommissionLedger()`
 * (`@/lib/comercializacion/actions/commissions-admin`), que es la acción que
 * ya consume /admin/comisiones. Una sola ruta de lectura, no dos.
 *
 * `commission_periods` tiene RLS sin políticas: es dinero de terceros y el
 * único canal son estas rutas, con el service client, tras `requireAdmin({ permission: "comisiones" })`.
 *
 * Body: { sellerId: uuid, month: "AAAA-MM", rate?: number }
 */
export async function POST(request: NextRequest) {
  const { user: adminUser, response: adminDenied } = await requireAdmin({ permission: "comisiones" })
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
    }

    const parsed = validateAccrualInput({
      sellerId: body.sellerId,
      monthKey: body.month,
      rate: body.rate,
    })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    // La tasa se congela en el primer devengo y la base no la sobrescribe al
    // re-devengar (decisión 1 de 00155): cambiarla aquí no reescribe lo ya
    // devengado, solo aplica si el periodo es nuevo.
    const rate = parsed.value.rate ?? getCommissionRate()
    const supabase = await createServiceClient()

    const { data, error } = await supabase.rpc("accrue_commission_period", {
      p_seller_id: parsed.value.sellerId,
      p_period_start: parsed.value.periodStart,
      p_period_end: parsed.value.periodEnd,
      p_rate: rate,
    })

    if (error) {
      logger.error("[ADMIN-COMISIONES] accrue error:", error)
      return rpcErrorResponse(error, "Error al devengar el periodo")
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "commission_accrue",
      entity: "commission_periods",
      entityId: data.id,
      detail: {
        sellerId: parsed.value.sellerId,
        periodStart: parsed.value.periodStart,
        periodEnd: parsed.value.periodEnd,
        rate,
        revenue: data.revenue,
        orderCount: data.order_count,
        amountDue: data.amount_due,
        status: data.status,
      },
    })

    return NextResponse.json({ period: data }, { status: 201 })
  } catch (error) {
    logger.error("[ADMIN-COMISIONES] accrue error:", error)
    return NextResponse.json({ error: "Error al devengar el periodo" }, { status: 500 })
  }
}
