import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { rateLimited, rateLimitResponse, clientIp } from "@/lib/rate-limit"

/**
 * POST /api/addresses/claim
 *
 * Vincula al usuario autenticado las direcciones creadas durante checkouts
 * anónimos (las que tienen user_id NULL y el mismo guest_token). Se llama tras
 * iniciar sesión / registrarse desde el navegador que hizo la compra anónima.
 * También reclama los platillos del panel (panel_dishes), los datos de las
 * herramientas del panel (panel_entries / panel_rows) y — crítico para el
 * loop de recompra — las ÓRDENES anónimas hechas con esas direcciones (C4):
 * sin ese reclamo, los pedidos de invitado conservan user_id NULL de por
 * vida y nunca aparecen en "Mis pedidos" ni generan cashback tras el
 * registro.
 *
 * Body: { guest_token: string }
 * Auth: requiere sesión activa (auth.uid()).
 *
 * Respuesta: { claimed, dishesClaimed, entriesClaimed, rowsClaimed, ordersClaimed }.
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

    // Rate limit: 10 requests per minute per user
    const ip = clientIp(request)
    const rlKey = `addr-claim:${user.id}:${ip}`
    const rl = await rateLimited(await createServiceClient(), rlKey, 10, 60)
    if (!rl.allowed) {
      return rateLimitResponse(rl)
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

    // Reclamar las ÓRDENES de invitado ligadas a las direcciones recién
    // reclamadas (C4). Es seguro: solo se tocan órdenes cuya dirección
    // tenía el guest_token exacto de este navegador y que aún no tienen
    // dueño. Best-effort: un fallo aquí no impide reclamar lo demás.
    let ordersClaimed = 0
    const claimedAddressIds = (data ?? []).map((a) => a.id as number)
    if (claimedAddressIds.length > 0) {
      const { data: claimedOrders, error: ordersError } = await supabase
        .from("orders")
        .update({ user_id: user.id })
        .in("address_id", claimedAddressIds)
        .is("user_id", null)
        .select("id")
      if (ordersError) {
        logger.error("Guest orders claim error:", ordersError)
      } else {
        ordersClaimed = claimedOrders?.length ?? 0
      }
    }

    // Mismo reclamo para los platillos del panel guardados como anónimo.
    // Best-effort: un fallo aquí no impide reclamar las direcciones.
    let dishesClaimed = 0
    const { data: dishes, error: dishesError } = await supabase
      .from("panel_dishes")
      .update({ user_id: user.id, guest_token: null })
      .eq("guest_token", token)
      .is("user_id", null)
      .select("id")
    if (dishesError) {
      logger.error("Panel dishes claim error:", dishesError)
    } else {
      dishesClaimed = dishes?.length ?? 0
    }

    // Mismo reclamo para las herramientas del panel (panel_entries).
    // Best-effort: un fallo aquí no impide reclamar las direcciones.
    let entriesClaimed = 0
    const { data: entries, error: entriesError } = await supabase
      .from("panel_entries")
      .update({ user_id: user.id, guest_token: null })
      .eq("guest_token", token)
      .is("user_id", null)
      .select("id")
    if (entriesError) {
      logger.error("Panel entries claim error:", entriesError)
    } else {
      entriesClaimed = entries?.length ?? 0
    }

    // Mismo reclamo para las filas por entidad (panel_rows, 00057).
    // Best-effort: un fallo aquí no impide reclamar las direcciones.
    let rowsClaimed = 0
    const { data: panelRows, error: rowsError } = await supabase
      .from("panel_rows")
      .update({ user_id: user.id, guest_token: null })
      .eq("guest_token", token)
      .is("user_id", null)
      .select("id")
    if (rowsError) {
      logger.error("Panel rows claim error:", rowsError)
    } else {
      rowsClaimed = panelRows?.length ?? 0
    }

    return NextResponse.json({ claimed: data?.length ?? 0, dishesClaimed, entriesClaimed, rowsClaimed, ordersClaimed })
  } catch (err) {
    logger.error("Claim address error:", err)
    return NextResponse.json(
      { error: "Error interno al vincular las direcciones" },
      { status: 500 }
    )
  }
}
