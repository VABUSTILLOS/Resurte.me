import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
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

    // ── Ejecutar el canje con débito real (atómico) ──
    const { data, error } = await supabase.rpc("redeem_service", {
      p_user_id: user.id,
      p_service_id: service.id,
      p_service_name: service.name,
      p_cost: service.cost,
    })

    if (error) {
      console.error("[API redeem] rpc error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = data?.[0]
    if (!result?.success) {
      const message = result?.error_msg ?? "No se pudo completar el canje"
      return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      newBalance: result.new_balance,
      redemption: {
        id: result.redemption_id,
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
