import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { advanceRedemption } from "@/lib/redemption-actions"
import { isRedemptionStatus, type RedemptionStatus } from "@/lib/redemptions"
import { logger } from "@/lib/logger"

/**
 * /api/admin/redemptions — la cola operativa de servicios canjeados.
 *
 * Existe porque `advance_redemption()` es service_role-only y no hay forma de
 * que el navegador del equipo la llame: sin esta ruta, el estado de una
 * solicitud quedaba congelado en 'requested' para siempre y el cliente veía
 * "Te avisaremos en cada paso" sin que existiera ningún paso.
 *
 * GET  — la cola (por defecto abiertas; `?status=all` incluye cerradas).
 * POST — mueve una solicitud: transición, asignación, nota o entrega.
 */

const OPEN_STATUSES = ["requested", "in_progress"] as const

export async function GET(request: NextRequest) {
  const { response } = await requireAdmin()
  if (response) return response

  try {
    const supabase = await createServiceClient()
    const status = request.nextUrl.searchParams.get("status")

    let query = supabase
      .from("redemptions")
      .select(
        "id, user_id, service_id, service_name, cost_credits, concept, status, brief, assigned_to, due_at, started_at, delivered_at, cancelled_at, refunded_at, cancel_reason, deliverable_url, deliverable_note, created_at, status_updated_at"
      )
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(300)

    query = status === "all" ? query : query.in("status", [...OPEN_STATUSES])

    const { data, error } = await query
    if (error) {
      logger.error("[admin/redemptions] GET:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data ?? []

    // El brief no trae el contacto; el email vive en auth.users.
    const emailById = new Map<string, string>()
    const userIds = [...new Set(rows.map((r) => r.user_id as string))]
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const { data: userData } = await supabase.auth.admin.getUserById(uid)
          if (userData?.user?.email) emailById.set(uid, userData.user.email)
        } catch {
          // Best-effort: la cola se muestra aunque falte el correo.
        }
      })
    )

    return NextResponse.json({
      redemptions: rows.map((r) => ({ ...r, email: emailById.get(r.user_id as string) ?? null })),
    })
  } catch (err) {
    logger.error("[admin/redemptions] GET error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireAdmin()
  if (response) return response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 })
    }

    // `status` ausente = sólo metadatos. `null` explícito también, por el
    // contrato de advance_redemption: null significa "no transiciones".
    let nextStatus: RedemptionStatus | null | undefined
    if ("status" in body) {
      if (body.status === null || body.status === "") {
        nextStatus = null
      } else if (isRedemptionStatus(body.status)) {
        nextStatus = body.status
      } else {
        return NextResponse.json({ error: "Estado desconocido" }, { status: 400 })
      }
    }

    const asString = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

    const supabase = await createServiceClient()
    const { data: before } = await supabase
      .from("redemptions")
      .select("id, status, service_name, user_id, cost_credits")
      .eq("id", id)
      .maybeSingle()

    if (!before) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 })
    }

    const result = await advanceRedemption({
      id,
      status: nextStatus,
      actor: user?.email ?? "Admin",
      note: asString(body.note),
      assignedTo: asString(body.assigned_to),
      deliverableUrl: asString(body.deliverable_url),
      deliverableNote: asString(body.deliverable_note),
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "No se pudo actualizar la solicitud" },
        { status: 400 }
      )
    }

    await logAdminAction(supabase, {
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: "redemption_status_update",
      entity: "redemptions",
      entityId: id,
      detail: {
        service_name: before.service_name,
        previous_status: before.status,
        new_status: result.status,
        changed: result.changed,
        refunded: result.refunded,
        credits: before.cost_credits,
        assigned_to: asString(body.assigned_to),
      },
    })

    return NextResponse.json({
      success: true,
      status: result.status,
      changed: result.changed,
      refunded: result.refunded,
    })
  } catch (err) {
    logger.error("[admin/redemptions] POST error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    )
  }
}
