import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { onOrderStatusChange } from "@/lib/workflows"
import { logAdminAction } from "@/lib/audit-log"
import {
  applyOrderCancellationEffects,
  CANCEL_REFUSAL_MESSAGE,
  customerCancelRefusal,
} from "@/lib/order-cancellation"

export const runtime = "nodejs"

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 60

/**
 * POST /api/orders/[id]/cancel   body: { t?: string }
 *
 * El cliente cancela su propio pedido. Antes de esta ruta la única forma de
 * cancelar era pedírselo a un administrador, que es justo la clase de tarea
 * que un autoservicio debe quitar de encima.
 *
 * Autorización — dos caminos, los mismos dos que ya tiene el seguimiento:
 *   · `t` = `restore_token` del pedido (UUID aleatorio por pedido, migración
 *     00063). Es la capability URL que el invitado sin cuenta ya usa para
 *     ver su pedido, así que puede cancelarlo sin registrarse.
 *   · Sesión iniciada cuyo `id` es el `orders.user_id`.
 * Sin uno de los dos, la respuesta es 404 (no 403): distinguir "no es tuyo"
 * de "no existe" convierte la ruta en un oráculo de qué ids existen.
 *
 * Qué NO se puede cancelar desde aquí — y por qué:
 *   · Un pedido despachado o entregado (`out_for_delivery`, `delivered`).
 *   · Un pedido con cobro hecho o en vuelo (`paid`, `processing`, …). No hay
 *     maquinaria de reembolso para pedidos en este repo, así que cancelarlo
 *     desde aquí sería quitar el pedido y quedarse con el dinero. La ruta lo
 *     rechaza con el motivo y la vía de contacto en vez de simular que hizo
 *     algo.
 *   · Un pedido ya cancelado.
 *
 * La cascada de recursos (devolver inventario, liberar el cupón) NO se
 * duplica aquí: se llama a la misma función que usa el admin, para que las
 * dos puertas al estado `cancelled` hagan exactamente lo mismo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // Solo enteros positivos: Number() aceptaría "1e3", negativos, etc.
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
  }
  const orderId = Number(id)

  // El token puede venir en el cuerpo (preferido) o en la query, porque el
  // cliente ya lo tiene en la URL de la página y así no hay que copiarlo.
  let token: string | null = null
  try {
    const body = (await request.json()) as { t?: unknown }
    if (typeof body?.t === "string" && body.t) token = body.t
  } catch {
    // Sin cuerpo JSON se cae al query param; no es un error.
  }
  if (!token) token = request.nextUrl.searchParams.get("t")

  try {
    const supabase = await createServiceClient()

    // Mutación, no polling: tope estrecho por IP. El seguimiento se refresca
    // cada 20 s; cancelar se hace una vez.
    const rate = await rateLimited(
      supabase,
      `order-cancel:${clientIp(request)}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SECONDS
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    // La sesión es opcional: el invitado cancela con su token.
    let sessionUserId: string | null = null
    try {
      const session = await createClient()
      const {
        data: { user },
      } = await session.auth.getUser()
      sessionUserId = user?.id ?? null
    } catch (err) {
      logger.warn("[ORDER-CANCEL] No se pudo leer la sesión", { err: String(err) })
    }

    const SELECT_CON_CUPON = "id, status, payment_status, user_id, restore_token, coupon_code"
    const SELECT_BASE = "id, status, payment_status, user_id, restore_token"

    // `coupon_code` (migración 00146) puede no existir en un entorno viejo:
    // reintenta sin ella en vez de dejar la cancelación inservible.
    let { data: order, error } = await supabase
      .from("orders")
      .select(SELECT_CON_CUPON)
      .eq("id", orderId)
      .maybeSingle()

    if (error?.code === "42703") {
      ;({ data: order, error } = await supabase
        .from("orders")
        .select(SELECT_BASE)
        .eq("id", orderId)
        .maybeSingle())
    }

    if (error) {
      logger.error("[ORDER-CANCEL] query error:", error)
      return NextResponse.json({ error: "No se pudo consultar el pedido" }, { status: 500 })
    }
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const tokenOk = token !== null && order.restore_token === token
    const ownerOk = sessionUserId !== null && order.user_id === sessionUserId
    if (!tokenOk && !ownerOk) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const refusal = customerCancelRefusal(order.status, order.payment_status)
    if (refusal) {
      return NextResponse.json(
        { error: CANCEL_REFUSAL_MESSAGE[refusal], reason: refusal },
        { status: 409 }
      )
    }

    const oldStatus = order.status
    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({
        updated_at: new Date().toISOString(),
        status: "cancelled",
        // Mismo criterio que la ruta de admin: cerrar la ventana de pago solo
        // si seguía abierta. No se pisa un `expired` ni un `failed` previo.
        ...(order.payment_status === "pending" ? { payment_status: "failed" as const } : {}),
      })
      .eq("id", orderId)
      // Compare-and-swap: si otro canceló (o el admin cambió el estado) entre
      // la lectura y esta escritura, no se toca la fila. Sin esto, dos
      // cancelaciones simultáneas devolverían el inventario dos veces.
      .eq("status", oldStatus)
      .select("id, status, payment_status")

    if (updateError) {
      logger.error("[ORDER-CANCEL] update error:", updateError)
      return NextResponse.json(
        { error: "No se pudo cancelar el pedido", details: updateError.message },
        { status: 500 }
      )
    }
    if (!Array.isArray(updated) || updated.length === 0) {
      return NextResponse.json(
        { error: "El pedido cambió mientras lo cancelabas. Recarga la página." },
        { status: 409 }
      )
    }

    // Devolver inventario y liberar el cupón: la misma cascada que el admin.
    await applyOrderCancellationEffects(supabase, {
      orderId,
      oldStatus,
      couponCode: order.coupon_code,
    })

    try {
      await onOrderStatusChange(orderId, oldStatus, "cancelled")
    } catch (workflowErr) {
      logger.error("[ORDER-CANCEL] Workflow error (non-blocking):", workflowErr)
    }

    // Bitácora: `actorId` solo se atribuye cuando quien canceló ES el dueño
    // del pedido. Un invitado con token no tiene actor, y atribuirle la
    // acción a la sesión de quien esté en ese navegador sería mentir.
    await logAdminAction(supabase, {
      actorId: ownerOk ? sessionUserId : null,
      actorEmail: null,
      action: "order_cancelled_by_customer",
      entity: "orders",
      entityId: orderId,
      detail: { from: oldStatus, via: ownerOk ? "sesion" : "token" },
    })

    return NextResponse.json(
      {
        order: {
          id: orderId,
          status: "cancelled",
          payment_status: updated[0]?.payment_status ?? null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[ORDER-CANCEL] unexpected error:", err)
    return NextResponse.json({ error: "No se pudo cancelar el pedido" }, { status: 500 })
  }
}
