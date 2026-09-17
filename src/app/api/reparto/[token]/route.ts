import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { clientIp, rateLimitResponse, rateLimited } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { advanceDelivery, deliverWithPin, listCourierJobs, loadCourierByToken } from "@/lib/flotilla/deliveries"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"

export const runtime = "nodejs"

const TOKEN_MIN_LENGTH = 16
const ACTIONS = new Set(["picked_up", "delivered", "failed"])

/**
 * API del repartidor.
 *
 * No hay sesión de Supabase en este flujo: el `access_token` del
 * repartidor es una capability URL (mismo patrón que el UUID del pedido
 * en el tracking público). El token solo abre SUS entregas, no da acceso
 * al restaurante ni a datos de otros repartidores.
 *
 * GET  /api/reparto/[token]  → sesión + entregas abiertas
 * POST /api/reparto/[token]  → { delivery_id, action, pin?, note?, lat?, lng? }
 *
 * El PIN de entrega es de 4 dígitos, así que además del rate limit por IP
 * se limita por entrega: sin eso un token filtrado permitiría adivinarlo
 * por fuerza bruta.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token || token.length < TOKEN_MIN_LENGTH) {
      return NextResponse.json({ error: "Enlace no válido" }, { status: 404 })
    }

    const supabase = await createServiceClient()

    const rate = await rateLimited(
      supabase,
      `reparto:${clientIp(request)}`,
      60,
      60
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const session = await loadCourierByToken(supabase, token)
    if (!session) {
      return NextResponse.json({ error: "Enlace no válido o revocado" }, { status: 404 })
    }

    const jobs = await listCourierJobs(supabase, {
      courierId: session.courier.id,
      restaurantId: session.restaurant?.id ?? "",
    })

    return NextResponse.json({
      courier: session.courier,
      restaurant: session.restaurant,
      jobs,
    })
  } catch (err) {
    logger.error("[REPARTO] GET falló", err)
    return NextResponse.json({ error: "No se pudo cargar el reparto" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token || token.length < TOKEN_MIN_LENGTH) {
      return NextResponse.json({ error: "Enlace no válido" }, { status: 404 })
    }

    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `reparto_action:${clientIp(request)}`, 60, 60)
    if (!rate.allowed) return rateLimitResponse(rate)

    const session = await loadCourierByToken(supabase, token)
    if (!session) {
      return NextResponse.json({ error: "Enlace no válido o revocado" }, { status: 404 })
    }
    const restaurantId = session.restaurant?.id
    if (!restaurantId) {
      return NextResponse.json({ error: "Restaurante no disponible" }, { status: 409 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const deliveryId = String(body?.delivery_id ?? "").trim()
    const action = String(body?.action ?? "").trim()
    if (!deliveryId || !ACTIONS.has(action)) {
      return NextResponse.json({ error: "Petición no válida" }, { status: 400 })
    }

    // Propiedad: el token solo puede mover SUS entregas. Las funciones de
    // la capa de servidor validan el restaurante, no el repartidor, así
    // que la comprobación va aquí.
    const { data: owned } = await supabase
      .from("foodos_deliveries")
      .select("id")
      .eq("id", deliveryId)
      .eq("restaurant_id", restaurantId)
      .eq("courier_id", session.courier.id)
      .maybeSingle()
    if (!owned) {
      return NextResponse.json({ error: "Entrega no asignada a ti" }, { status: 404 })
    }

    const lat = Number(body?.lat)
    const lng = Number(body?.lng)
    const point =
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}

    if (action === "delivered") {
      // Límite por entrega: el PIN son 4 dígitos.
      const pinRate = await rateLimited(supabase, `reparto_pin:${deliveryId}`, 8, 300)
      if (!pinRate.allowed) return rateLimitResponse(pinRate)

      const result = await deliverWithPin(supabase, {
        deliveryId,
        restaurantId,
        pin: typeof body?.pin === "string" ? body.pin : null,
        actor: "courier",
      })
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 409 })
      }
      notifyOrderStatus(result.orderId, result.orderStatus)
      return NextResponse.json({ ok: true, status: result.status })
    }

    const result = await advanceDelivery(supabase, {
      deliveryId,
      restaurantId,
      status: action === "picked_up" ? "picked_up" : "failed",
      actor: "courier",
      note: typeof body?.note === "string" ? body.note.slice(0, 300) : null,
      ...point,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }
    notifyOrderStatus(result.orderId, result.orderStatus)
    return NextResponse.json({ ok: true, status: result.status })
  } catch (err) {
    logger.error("[REPARTO] POST falló", err)
    return NextResponse.json({ error: "No se pudo actualizar la entrega" }, { status: 500 })
  }
}

/**
 * Avisa al comensal del hito de su pedido.
 *
 * `after()` y no fire-and-forget: una promesa suelta se cancela al
 * resolver la respuesta. Solo se dispara cuando el estado del pedido
 * cambió de verdad, porque el aviso no es idempotente.
 */
function notifyOrderStatus(orderId: string | undefined, orderStatus: string | undefined): void {
  if (!orderId || !orderStatus) return
  after(() => {
    void notifyFoodosCustomer(orderId, `status:${orderStatus}` as never)
  })
}
