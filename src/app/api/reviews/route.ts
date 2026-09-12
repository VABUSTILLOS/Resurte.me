import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse, type ServiceClient } from "@/lib/rate-limit"

export const runtime = "nodejs"

const MAX_COMMENT_LENGTH = 500

interface ReviewOrderRow {
  id: number
  user_id: string | null
  status: string
  restore_token: string | null
}

/**
 * Autoriza la operación sobre la reseña de un pedido:
 *   · sesión del dueño del pedido, o
 *   · restore_token del pedido (capability URL enviada por WhatsApp/email,
 *     mismo patrón que /api/cart/restore).
 * Devuelve el pedido si está autorizado; null en caso contrario.
 */
async function authorizeOrder(
  supabase: ServiceClient,
  orderId: number,
  token: string | null
): Promise<ReviewOrderRow | null> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, user_id, status, restore_token")
    .eq("id", orderId)
    .maybeSingle()

  if (error) {
    logger.error("[REVIEWS] order fetch error:", error)
    return null
  }
  if (!order) return null

  // Capability URL: token opaco del pedido (invitados por WhatsApp/email).
  if (token && order.restore_token && token === order.restore_token) {
    return order as ReviewOrderRow
  }

  // Sesión del dueño del pedido.
  const supabaseClient = await createClient()
  const {
    data: { user },
  } = await supabaseClient.auth.getUser()
  if (user && order.user_id && order.user_id === user.id) {
    return order as ReviewOrderRow
  }

  return null
}

/**
 * GET /api/reviews?pedido=<id>&t=<restore_token>
 * Prefill de la página /calificar: confirma que el pedido es reseñable
 * (entregado) y devuelve la reseña existente si ya la tiene.
 * Respuesta genérica 404 cuando no existe o no está autorizado, para no
 * filtrar la existencia del pedido.
 */
export async function GET(request: NextRequest) {
  const orderId = Number(request.nextUrl.searchParams.get("pedido"))
  const token = request.nextUrl.searchParams.get("t")

  if (!orderId || isNaN(orderId)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
  }

  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `reviews:${clientIp(request)}`, 30, 60)
    if (!rate.allowed) return rateLimitResponse(rate)

    const order = await authorizeOrder(supabase, orderId, token)
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const { data: review } = await supabase
      .from("order_reviews")
      .select("rating, comment, created_at")
      .eq("order_id", orderId)
      .maybeSingle()

    return NextResponse.json(
      {
        orderId: order.id,
        delivered: order.status === "delivered",
        review: review ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[REVIEWS] GET unexpected error:", err)
    return NextResponse.json({ error: "No se pudo cargar el pedido" }, { status: 500 })
  }
}

/**
 * POST /api/reviews
 * Crea o actualiza la reseña de un pedido entregado (upsert por order_id).
 * Body: { order_id: number, rating: 1-5, comment?: string, token?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const orderId = Number(body?.order_id)
    const rating = Number(body?.rating)
    const token = typeof body?.token === "string" ? body.token : null
    const comment =
      typeof body?.comment === "string" ? body.comment.trim().slice(0, MAX_COMMENT_LENGTH) : ""

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "La calificación debe ser de 1 a 5 estrellas" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `reviews:${clientIp(request)}`, 10, 60)
    if (!rate.allowed) return rateLimitResponse(rate)

    const order = await authorizeOrder(supabase, orderId, token)
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }
    if (order.status !== "delivered") {
      return NextResponse.json(
        { error: "Solo puedes calificar pedidos ya entregados" },
        { status: 409 }
      )
    }

    // user_id: solo cuando hay sesión del dueño (con token de invitado queda NULL).
    const supabaseClient = await createClient()
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()
    const userId = user && order.user_id === user.id ? user.id : null

    const { error: upsertError } = await supabase.from("order_reviews").upsert(
      {
        order_id: orderId,
        user_id: userId,
        rating,
        comment: comment || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "order_id" }
    )

    if (upsertError) {
      logger.error("[REVIEWS] upsert error:", upsertError)
      return NextResponse.json({ error: "No se pudo guardar tu reseña" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error("[REVIEWS] POST unexpected error:", err)
    return NextResponse.json({ error: "No se pudo guardar tu reseña" }, { status: 500 })
  }
}
