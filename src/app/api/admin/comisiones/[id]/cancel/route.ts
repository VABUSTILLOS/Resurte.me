import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { validateCancellationInput } from "@/lib/comercializacion/commission-ledger"
import { rpcErrorResponse } from "../../rpc-errors"

export const runtime = "nodejs"

/**
 * POST /api/admin/comisiones/[id]/cancel — anula un periodo devengado.
 *
 * El motivo es obligatorio y se guarda en `notes`: un periodo anulado sin
 * explicación es indistinguible de un error de captura.
 *
 * Body: { reason: string }
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

    const parsed = validateCancellationInput({ reason: body.reason })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data, error } = await supabase.rpc("cancel_commission_period", {
      p_period_id: id,
      p_reason: parsed.value.reason,
    })

    if (error) {
      logger.error("[ADMIN-COMISIONES] cancel error:", error)
      return rpcErrorResponse(error, "Error al cancelar el periodo")
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "commission_cancel",
      entity: "commission_periods",
      entityId: id,
      detail: { sellerId: data.seller_id, reason: parsed.value.reason },
    })

    return NextResponse.json({ period: data })
  } catch (error) {
    logger.error("[ADMIN-COMISIONES] cancel error:", error)
    return NextResponse.json({ error: "Error al cancelar el periodo" }, { status: 500 })
  }
}
