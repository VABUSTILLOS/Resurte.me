import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { redeemCredits } from "@/lib/wallet-actions"
import { getRewardServices } from "@/lib/reward-services"
import { notifyUser } from "@/lib/notifications"
import { logger } from "@/lib/logger"
import { rateLimited, rateLimitResponse } from "@/lib/rate-limit"
import { normalizeRedemptionBrief, formatRedemptionDueDate } from "@/lib/redemptions"
import { attachRedemptionBrief } from "@/lib/redemption-actions"

/**
 * POST /api/redeem
 *
 * Crea una solicitud de servicio de la Tienda de Crecimiento: verifica la
 * sesión, valida el servicio contra el catálogo, ejecuta el débito real del
 * monedero vía `redeem_service()` y guarda el brief que el cliente capturó en
 * el checkout, para que el equipo que ejecuta el servicio tenga el contexto.
 *
 * Body: { service_id: string, brief?: { restaurant_name, maps_url?, social_handle?, notes? } }
 * Respuesta: { success, newBalance, redemption: { id, status, due_at, ... } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { service_id, brief: rawBrief } = body as { service_id?: string; brief?: unknown }

    if (!service_id) {
      return NextResponse.json({ error: "service_id es requerido" }, { status: 400 })
    }

    // El brief se valida ANTES de debitar: rechazarlo después de cobrar
    // dejaría al cliente sin créditos y sin servicio.
    const briefResult = normalizeRedemptionBrief(rawBrief)
    if (!briefResult.ok) {
      return NextResponse.json({ error: briefResult.error }, { status: 400 })
    }
    const brief = briefResult.brief

    // Buscar el servicio en el catálogo (nunca confiar en cost/name del cliente)
    const service = (await getRewardServices()).find((s) => s.id === service_id)
    if (!service) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }

    // ── Sesión activa ──
    const supabaseClient = await createClient()
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const supabase = await createServiceClient()

    // ── Rate limit por usuario (canje de dinero real) ──
    const rate = await rateLimited(supabase, `redeem:${user.id}`, 10, 60)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    // ── Idempotencia: evitar doble-débito por doble-click/retry ──
    // Si el usuario ya canjeó este mismo servicio en los últimos 5 minutos,
    // devolvemos la redemción existente en lugar de debitar otra vez.
    // (El RPC redeem_service ya bloquea la fila del wallet con FOR UPDATE,
    // pero eso solo cubre concurrencia; un doble-click secuencial pasaría
    // dos veces. Este chequeo dedupe ese caso.)
    const dedupeWindowMinutes = 5
    const { data: existing } = await supabase
      .from("redemptions")
      .select("id, service_id, service_name, cost_credits, created_at, status, due_at")
      .eq("user_id", user.id)
      .eq("service_id", service.id)
      .gte("created_at", new Date(Date.now() - dedupeWindowMinutes * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)

    const redemption = existing?.[0]
    if (redemption) {
      return NextResponse.json({
        success: true,
        already_redeemed: true,
        redemption: {
          id: redemption.id,
          service_id: redemption.service_id,
          service_name: redemption.service_name,
          cost_credits: redemption.cost_credits,
          status: redemption.status,
          due_at: redemption.due_at,
        },
      })
    }

    // ── Ejecutar el canje con débito real (atómico) ──
    // Delegado a la server action redeemCredits, que usa el RPC
    // redeem_service (FOR UPDATE) para el débito atómico del monedero.
    const result = await redeemCredits(user.id, {
      id: service.id,
      name: service.name,
      cost: service.cost,
    })

    if (!result.success) {
      logger.error("[API redeem] rpc error:", result.error)
      return NextResponse.json(
        { error: result.error ?? "No se pudo completar el canje" },
        { status: 400 }
      )
    }

    // El débito ya ocurrió: a partir de aquí un fallo no puede convertirse en
    // un error HTTP, o el cliente reintentaría sobre créditos ya gastados.
    const redemptionId = Number(result.redemptionId)
    const hasId = Number.isFinite(redemptionId) && redemptionId > 0

    let status: string | null = "requested"
    let dueAt: string | null = null

    if (hasId) {
      const attached = await attachRedemptionBrief(redemptionId, user.id, brief)
      if (!attached.ok) {
        // El brief es contexto operativo, no dinero: la solicitud ya está en la
        // cola del equipo y el panel la marca como incompleta.
        logger.error("[API redeem] no se pudo guardar el brief:", attached.error)
      }
      status = attached.status ?? status
      dueAt = attached.due_at ?? null
    } else {
      logger.error("[API redeem] canje sin folio:", result.redemptionId)
    }

    // Notificación persistente del canje (best-effort).
    void notifyUser({
      userId: user.id,
      type: "redemption",
      title: `Solicitaste: ${service.name}`,
      body: dueAt
        ? `-${service.cost.toLocaleString("es-MX")} créditos · comprometido para el ${formatRedemptionDueDate(dueAt)}`
        : `-${service.cost.toLocaleString("es-MX")} créditos · nuestro equipo se pondrá en contacto contigo`,
      actionUrl: "/recompensas",
    })

    return NextResponse.json({
      success: true,
      newBalance: result.newBalance,
      redemption: {
        id: hasId ? redemptionId : null,
        service_id: service.id,
        service_name: service.name,
        cost_credits: service.cost,
        status,
        due_at: dueAt,
      },
    })
  } catch (err) {
    logger.error("[API redeem] error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    )
  }
}
