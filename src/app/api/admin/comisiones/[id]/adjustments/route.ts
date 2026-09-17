import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { validateAdjustmentInput } from "@/lib/comercializacion/commission-ledger"
import { rpcErrorResponse } from "../../rpc-errors"

export const runtime = "nodejs"

/**
 * POST /api/admin/comisiones/[id]/adjustments — agrega un ajuste al periodo.
 *
 * No hay GET: los movimientos los devuelve `getCommissionLedger()` junto
 * con el periodo, en la misma lectura que ya hace /admin/comisiones.
 *
 * Los ajustes son append-only: el trigger `sync_commission_adjustments`
 * (00155) recalcula `commission_periods.adjustments` y `amount_due` —que es
 * columna generada— en la misma transacción. No hay edición ni borrado: para
 * corregir se agrega el movimiento contrario, y así queda el rastro.
 *
 * Body: { amount: number, reason: string }
 */
function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: adminUser, response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const { id: rawId } = await params
    const id = parseId(rawId)
    if (id === null) {
      return NextResponse.json({ error: "Periodo inválido" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
    }

    const parsed = validateAdjustmentInput({ amount: body.amount, reason: body.reason })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // El trigger exige que el periodo exista y esté devengado; si no, la
    // inserción falla con 23514/23503 y se traduce abajo.
    const { data, error } = await supabase
      .from("commission_adjustments")
      .insert({
        period_id: id,
        amount: parsed.value.amount,
        reason: parsed.value.reason,
        created_by: adminUser?.id ?? null,
      })
      .select("*")
      .single()

    if (error) {
      logger.error("[ADMIN-COMISIONES] adjust error:", error)
      return rpcErrorResponse(error, "Error al registrar el ajuste")
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "commission_adjust",
      entity: "commission_adjustments",
      entityId: data.id,
      detail: {
        periodId: id,
        amount: parsed.value.amount,
        reason: parsed.value.reason,
      },
    })

    return NextResponse.json({ adjustment: data }, { status: 201 })
  } catch (error) {
    logger.error("[ADMIN-COMISIONES] adjust error:", error)
    return NextResponse.json({ error: "Error al registrar el ajuste" }, { status: 500 })
  }
}
