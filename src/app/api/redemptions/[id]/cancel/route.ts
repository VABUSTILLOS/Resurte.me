import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { advanceRedemption } from "@/lib/redemption-actions"
import { isOpenRedemption } from "@/lib/redemptions"
import { notifyUser } from "@/lib/notifications"
import { logger } from "@/lib/logger"
import { rateLimited, rateLimitResponse } from "@/lib/rate-limit"

/**
 * POST /api/redemptions/[id]/cancel
 *
 * El cliente cancela su propia solicitud y recupera los créditos.
 *
 * Existe porque el checkout promete "puedes cancelar cuando quieras desde tu
 * historial y se te devuelven los créditos": sin esta ruta esa frase era falsa
 * —el cliente tenía que escribir a soporte y el reembolso dependía de que un
 * humano lo hiciera—. La devolución la ejecuta `advance_redemption()`, que es
 * la única fuente de verdad del dinero; aquí no se reimplementa nada.
 *
 * `advance_redemption` es service_role-only y no comprueba al dueño (recibe el
 * `id` por parámetro), así que la propiedad se verifica AQUÍ, contra la fila,
 * antes de llamarla.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const redemptionId = Number(id)
    if (!Number.isInteger(redemptionId) || redemptionId <= 0) {
      return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 })
    }

    const supabaseClient = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `redeem-cancel:${user.id}`, 10, 60)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    // Propiedad + estado, en una sola lectura. `user_id` va en el predicado:
    // el id de otra persona no resuelve.
    const { data: row, error: readError } = await supabase
      .from("redemptions")
      .select("id, user_id, status, service_name, cost_credits, refunded_at")
      .eq("id", redemptionId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (readError) {
      logger.error("[API redemption cancel] lectura:", readError.message)
      return NextResponse.json({ error: "No se pudo leer la solicitud" }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 })
    }
    if (!isOpenRedemption(row.status)) {
      // Ya está entregada o cancelada: no hay nada que cancelar y no se toca el saldo.
      return NextResponse.json(
        { error: "Esta solicitud ya está cerrada", status: row.status },
        { status: 409 }
      )
    }

    const result = await advanceRedemption({
      id: redemptionId,
      status: "cancelled",
      actor: "Cliente",
      note: "Cancelada por el cliente desde su historial",
    })

    if (!result.ok) {
      logger.error("[API redemption cancel] advance:", result.error)
      return NextResponse.json(
        { error: result.error ?? "No se pudo cancelar la solicitud" },
        { status: 400 }
      )
    }

    if (result.refunded) {
      void notifyUser({
        userId: user.id,
        type: "redemption",
        title: "Solicitud cancelada",
        body: `Te devolvimos ${row.cost_credits} créditos de ${row.service_name}.`,
        actionUrl: "/recompensas",
      })
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      refunded: result.refunded,
    })
  } catch (err) {
    logger.error("[API redemption cancel] error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    )
  }
}
