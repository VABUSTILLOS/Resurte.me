import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { redeemCredits } from "@/lib/wallet-actions"
import { SERVICES } from "@/app/recompensas/_components/services-data"

/**
 * POST /api/redeem
 *
 * Canjea Créditos Resurte por un servicio de la Tienda de Crecimiento.
 * Verifica la sesión del usuario, valida el servicio contra el catálogo,
 * y ejecuta el débito real del monedero vía la función redeem_service().
 *
 * Body: { service_id: string }
 * Respuesta: { success, newBalance, redemption }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { service_id } = body as { service_id?: string }

    if (!service_id) {
      return NextResponse.json({ error: "service_id es requerido" }, { status: 400 })
    }

    // Buscar el servicio en el catálogo (nunca confiar en cost/name del cliente)
    const service = SERVICES.find((s) => s.id === service_id)
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

    // ── Idempotencia: evitar doble-débito por doble-click/retry ──
    // Si el usuario ya canjeó este mismo servicio en los últimos 5 minutos,
    // devolvemos la redemción existente en lugar de debitar otra vez.
    // (El RPC redeem_service ya bloquea la fila del wallet con FOR UPDATE,
    // pero eso solo cubre concurrencia; un doble-click secuencial pasaría
    // dos veces. Este chequeo dedupe ese caso.)
    const dedupeWindowMinutes = 5
    const { data: existing } = await supabase
      .from("redemptions")
      .select("id, service_id, service_name, cost_credits, created_at")
      .eq("user_id", user.id)
      .eq("service_id", service.id)
      .gte("created_at", new Date(Date.now() - dedupeWindowMinutes * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)

    if (existing && existing.length > 0) {
      const redemption = existing[0]
      return NextResponse.json({
        success: true,
        already_redeemed: true,
        redemption: {
          id: redemption.id,
          service_id: redemption.service_id,
          service_name: redemption.service_name,
          cost_credits: redemption.cost_credits,
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
      console.error("[API redeem] rpc error:", result.error)
      return NextResponse.json(
        { error: result.error ?? "No se pudo completar el canje" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      newBalance: result.newBalance,
      redemption: {
        id: result.redemptionId ?? null,
        service_id: service.id,
        service_name: service.name,
        cost_credits: service.cost,
      },
    })
  } catch (err) {
    console.error("[API redeem] error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    )
  }
}
