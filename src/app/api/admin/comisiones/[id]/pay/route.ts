import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { validatePaymentInput } from "@/lib/comercializacion/commission-ledger"
import { rpcErrorResponse } from "../../rpc-errors"

export const runtime = "nodejs"

/**
 * POST /api/admin/comisiones/[id]/pay — marca el periodo como pagado.
 *
 * Registrar el pago es un egreso: la RPC exige referencia cuando hay algo que
 * pagar, y el periodo deja de ser editable (guarda de 00155). Por eso esta
 * ruta no acepta un pago sin comprobante.
 *
 * Body: { reference: string, notes?: string, amountDue?: number }
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

    const supabase = await createServiceClient()

    // El monto lo define la base: se lee para decidir si la referencia es
    // obligatoria, nunca se confía en el que manda el cliente.
    const { data: current, error: readError } = await supabase
      .from("commission_periods")
      .select("id, amount_due, status, seller_id")
      .eq("id", id)
      .maybeSingle()

    if (readError) throw readError
    if (!current) {
      return NextResponse.json({ error: "El periodo no existe" }, { status: 404 })
    }

    const amountDue = Number(current.amount_due)
    const parsed = validatePaymentInput(
      { reference: body.reference, notes: body.notes },
      amountDue
    )
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { data, error } = await supabase.rpc("pay_commission_period", {
      p_period_id: id,
      p_actor: adminUser?.id ?? null,
      p_reference: parsed.value.reference,
      p_notes: parsed.value.notes,
    })

    if (error) {
      logger.error("[ADMIN-COMISIONES] pay error:", error)
      return rpcErrorResponse(error, "Error al registrar el pago")
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "commission_pay",
      entity: "commission_periods",
      entityId: id,
      detail: {
        sellerId: current.seller_id,
        amountDue,
        reference: parsed.value.reference,
        notes: parsed.value.notes,
      },
    })

    return NextResponse.json({ period: data })
  } catch (error) {
    logger.error("[ADMIN-COMISIONES] pay error:", error)
    return NextResponse.json({ error: "Error al registrar el pago" }, { status: 500 })
  }
}
