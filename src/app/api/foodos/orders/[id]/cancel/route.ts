import { NextResponse, type NextRequest } from "next/server"
import { after } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"
import {
  FOODOS_CANCEL_REFUSAL_MESSAGE,
  foodosCustomerCancelRefusal,
} from "@/lib/foodos-order-status"

export const runtime = "nodejs"

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 60

/**
 * POST /api/foodos/orders/[id]/cancel   body: { slug: string }
 *
 * El comensal cancela su propio pedido FoodOS. Antes de esta ruta el único
 * camino era llamar al restaurante y pedirle al dueño que lo cancelara desde
 * el panel: una tarea que el comensal puede hacer solo mientras el pedido
 * todavía no ha empezado.
 *
 * Autorización — la misma capability que el seguimiento
 * (`GET /api/foodos/orders/[id]/track`): el par UUID del pedido + slug del
 * restaurante. No hay sesión de comensal en FoodOS (se pide sin cuenta), así
 * que el enlace ES la credencial, igual que en las facturas de take.app. Por
 * eso se exige que el restaurante siga `active`: un slug retirado deja de
 * autorizar.
 *
 * Qué NO se puede cancelar desde aquí — y por qué:
 *   · Un pedido que el restaurante ya confirmó o empezó. A partir de ahí hay
 *     insumos y cocina comprometidos; la vía es hablar con el restaurante.
 *   · Un pedido con pago registrado (`paid`, `processing`, `refunded`). No hay
 *     devolución automática en FoodOS, así que cancelarlo desde aquí sería
 *     quitar el pedido y quedarse con el dinero.
 *   · Un pedido ya cancelado.
 * En los tres casos se responde con el motivo, no con un botón escondido.
 *
 * Cascada — cancelar no es solo escribir el estado: hay que **liberar el cupón**
 * (`usage_count`), que se consumió al crear el pedido con
 * `increment_foodos_coupon_usage`. La operación inversa es la RPC
 * `decrement_foodos_coupon_usage` (migración 00186). Si el cupón no se puede
 * liberar, la cancelación NO se deshace: el pedido está cancelado y el contador
 * se corrige a mano; dejar el pedido a medias sería peor.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServiceClient()

    // Escritura, no polling: tope más estrecho que el del seguimiento.
    const rate = await rateLimited(
      supabase,
      `foodos_cancel:${clientIp(request)}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SECONDS
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const { id } = await params
    // El slug puede venir en el cuerpo (preferido) o en la query.
    let slug: string | null = null
    try {
      const body = (await request.json()) as { slug?: unknown }
      if (typeof body?.slug === "string" && body.slug) slug = body.slug
    } catch {
      // Sin cuerpo JSON se cae al query param; no es un error.
    }
    if (!slug) slug = request.nextUrl.searchParams.get("slug")

    if (!id || !slug) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
    }

    const { data: restaurant } = await supabase
      .from("foodos_restaurants")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle()
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 })
    }

    const { data: order, error } = await supabase
      .from("foodos_orders")
      .select("id, status, payment_status, restaurant_id, coupon_code")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle()

    if (error) {
      logger.error("[FOODOS-CANCEL] query error:", error)
      return NextResponse.json({ error: "No se pudo consultar el pedido" }, { status: 500 })
    }
    // Un id ajeno y uno inexistente responden igual: no se filtra qué pedidos
    // existen.
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const refusal = foodosCustomerCancelRefusal(order.status, order.payment_status)
    if (refusal) {
      return NextResponse.json(
        { error: FOODOS_CANCEL_REFUSAL_MESSAGE[refusal], reason: refusal },
        { status: 409 }
      )
    }

    const oldStatus = order.status
    const { data: updated, error: updateError } = await supabase
      .from("foodos_orders")
      .update({
        updated_at: new Date().toISOString(),
        status: "cancelled",
        // Cerrar la ventana de pago solo si seguía abierta. No se pisa un
        // `failed`/`expired` previo.
        ...(order.payment_status === "pending" ? { payment_status: "failed" as const } : {}),
      })
      .eq("id", id)
      // Compare-and-swap: si el restaurante confirmó el pedido entre la lectura
      // y esta escritura, no se toca la fila. Sin esto, el comensal cancelaría
      // un pedido que ya está en la cocina.
      .eq("status", oldStatus)
      .select("id, status, payment_status")

    if (updateError) {
      logger.error("[FOODOS-CANCEL] update error:", updateError)
      return NextResponse.json({ error: "No se pudo cancelar el pedido" }, { status: 500 })
    }
    if (!Array.isArray(updated) || updated.length === 0) {
      return NextResponse.json(
        { error: "El pedido cambió mientras lo cancelabas. Recarga la página." },
        { status: 409 }
      )
    }

    // Liberar el cupón que el alta del pedido consumió. Best-effort: el pedido
    // ya está cancelado y deshacerlo sería peor.
    if (order.coupon_code) {
      try {
        const { error: couponError } = await supabase.rpc("decrement_foodos_coupon_usage", {
          p_restaurant_id: order.restaurant_id,
          p_code: order.coupon_code,
        })
        if (couponError) {
          logger.warn("[FOODOS-CANCEL] no se pudo liberar el cupón", {
            orderId: id,
            code: order.coupon_code,
            error: couponError.message,
          })
        }
      } catch (couponErr) {
        logger.warn("[FOODOS-CANCEL] excepción liberando el cupón", {
          orderId: id,
          error: String(couponErr),
        })
      }
    }

    // Aviso al comensal: `status:cancelled` ya está en `EMAIL_EVENTS`, así que
    // se enviará en cuanto haya proveedor de correo. Dentro de `after()` para
    // no hacerle esperar al mensajero.
    after(() => {
      void notifyFoodosCustomer(id, "status:cancelled")
    })

    return NextResponse.json(
      {
        order: {
          id,
          status: "cancelled",
          payment_status: updated[0]?.payment_status ?? null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[FOODOS-CANCEL] unexpected error:", err)
    return NextResponse.json({ error: "No se pudo cancelar el pedido" }, { status: 500 })
  }
}
