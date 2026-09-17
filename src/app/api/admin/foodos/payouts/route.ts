import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { validatePayoutInput } from "@/lib/foodos-payouts"
import { rpcErrorResponse } from "@/lib/rpc-error-response"

export const runtime = "nodejs"

/**
 * POST /api/admin/foodos/payouts — registra una dispersión a un restaurante.
 *
 * `STRIPE_CONNECT_ENABLED` no existe en producción, así que el dinero con
 * tarjeta de FoodOS cae en la cuenta de Resurte.me y hay que transferirlo a
 * mano. Hasta 00157 no había dónde anotar que ya se hizo.
 *
 * Esta ruta no decide el monto: lo teclea quien dispersa, después de ver el
 * saldo que calcula `foodos_payout_balances()`. Lo que sí garantiza la base es
 * que el monto no exceda el saldo pendiente, que el comprobante no se repita
 * por restaurante y que la fila no se pueda editar ni borrar después.
 *
 * Solo POST: el libro es append-only y corregir significa registrar otra
 * dispersión. No hay PATCH ni DELETE a propósito.
 *
 * Body: { restaurantId, periodStart?, periodEnd?, settledAmount, feeAmount?,
 *         reference, notes? }
 */
export async function POST(request: NextRequest) {
  const { user: adminUser, response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
    }

    const parsed = validatePayoutInput({
      restaurantId: body.restaurantId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      settledAmount: body.settledAmount,
      feeAmount: body.feeAmount,
      reference: body.reference,
      notes: body.notes,
    })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc("record_foodos_payout", {
      p_restaurant_id: parsed.value.restaurantId,
      p_period_start: parsed.value.periodStart,
      p_period_end: parsed.value.periodEnd,
      p_settled_amount: parsed.value.settledAmount,
      p_fee_amount: parsed.value.feeAmount,
      p_reference: parsed.value.reference,
      p_actor: adminUser?.id ?? null,
      p_notes: parsed.value.notes,
    })

    if (error) {
      logger.error("[ADMIN-FOODOS] payout error:", error)
      return rpcErrorResponse(error, "Error al registrar la dispersión")
    }

    const payout = (data ?? null) as { id?: number } | null
    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "foodos_payout_record",
      entity: "foodos_payouts",
      entityId: payout?.id ?? null,
      detail: {
        restaurantId: parsed.value.restaurantId,
        periodStart: parsed.value.periodStart,
        periodEnd: parsed.value.periodEnd,
        settledAmount: parsed.value.settledAmount,
        feeAmount: parsed.value.feeAmount,
        reference: parsed.value.reference,
        notes: parsed.value.notes,
      },
    })

    return NextResponse.json({ payout: data })
  } catch (error) {
    logger.error("[ADMIN-FOODOS] payout error:", error)
    return NextResponse.json({ error: "Error al registrar la dispersión" }, { status: 500 })
  }
}
