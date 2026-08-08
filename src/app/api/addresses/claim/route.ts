import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

/**
 * POST /api/addresses/claim
 *
 * Vincula al usuario autenticado las direcciones creadas durante checkouts
 * anónimos (las que tienen user_id NULL y el mismo guest_token). Se llama tras
 * iniciar sesión / registrarse desde el navegador que hizo la compra anónima.
 *
 * Body: { guest_token: string }
 * Auth: requiere sesión activa (auth.uid()).
 *
 * Respuesta: { claimed: number } — cuántas direcciones se vincularon.
 */
export async function POST(request: NextRequest) {
  try {
    // Solo usuarios con sesión pueden reclamar direcciones
    const supabaseClient = await createClient()
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = (await request.json()) as { guest_token?: string }
    const token = body.guest_token?.trim()
    if (!token) {
      return NextResponse.json({ error: "Falta guest_token" }, { status: 400 })
    }

    // Service role para hacer el UPDATE (RLS no permite tocar direcciones
    // de otro usuario, y estas aún no tienen dueño).
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("addresses")
      .update({ user_id: user.id, guest_token: null })
      .eq("guest_token", token)
      .is("user_id", null)
      .select("id")

    if (error) {
      logger.error("Address claim error:", error)
      return NextResponse.json(
        { error: "Error al vincular las direcciones", detail: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ claimed: data?.length ?? 0 })
  } catch (err) {
    logger.error("Claim address error:", err)
    return NextResponse.json(
      { error: "Error interno al vincular las direcciones" },
      { status: 500 }
    )
  }
}
