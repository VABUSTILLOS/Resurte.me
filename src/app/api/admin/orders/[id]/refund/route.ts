import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { getStripe } from "@/lib/stripe"
import { buildRefundParams, isConnectRoutingEnabled } from "@/lib/stripe-connect"
import { isRefundableStatus, refundableCents, resolveRefundOutcome } from "@/lib/refund"

export const runtime = "nodejs"

/**
 * POST /api/admin/orders/[id]/refund — inicia un reembolso (total o parcial).
 *
 * Antes de esta ruta no existía **una sola llamada a `refunds.create`** en el
 * repositorio: la app sabía recibir reembolsos por webhook pero no iniciarlos.
 * Un admin que necesitaba devolver dinero sólo podía abrir el Dashboard de
 * Stripe, y ahí se topaba con la trampa de los *destination charges*.
 *
 * ── Por qué el reembolso se crea aquí y no se "arregla" en el webhook ──
 *
 * `reverse_transfer` y `refund_application_fee` sólo se pueden decidir al
 * **crear** el reembolso. El webhook `charge.refunded` llega después y ya no
 * puede revertir la transferencia: si el reembolso se hizo a mano desde el
 * Dashboard sin esas banderas, Stripe le devuelve el dinero al cliente con
 * fondos de **la plataforma** mientras el restaurante conserva lo que ya se le
 * liquidó. La plataforma paga el reembolso de su bolsillo y el restaurante se
 * queda el cobro de un pedido que ya no existe. Ver `buildRefundParams`.
 *
 * ── Decisiones que conviene no deshacer sin pensarlo ──
 *
 *  1. **El monto sale del importe realmente cobrado, no de `orders.total`.**
 *     Se lee el PaymentIntent en Stripe. `orders.total` puede no coincidir
 *     (propina añadida al PaymentIntent, cupón aplicado después), y comparar
 *     contra el total del pedido declararía "reembolso total" uno que dejó
 *     dinero sin devolver.
 *
 *  2. **Idempotencia por acumulado, no por bandera.** El estado se recalcula
 *     desde `refunded_amount_cents` + el importe de este reembolso, con la
 *     misma función que usa el webhook (`resolveRefundOutcome`). Un segundo
 *     reembolso parcial sobre el mismo pedido es legítimo (devolver la
 *     propina un día y el platillo al siguiente) y no debe rebotar.
 *
 *  3. **Se escribe el estado aquí además de en el webhook.** No es doble
 *     fuente: los dos aplican la misma regla pura sobre datos distintos (aquí
 *     el importe que devuelve `refunds.create`, allí el `amount_refunded`
 *     acumulado del cargo). Escribir sólo en el webhook dejaría el panel
 *     mintiendo mientras el webhook no llegue, y un webhook mal configurado
 *     es precisamente el escenario que esta ruta viene a hacer improbable.
 *
 *  4. **El reembolso no toca `orders.status`.** Devolver dinero no cancela el
 *     pedido ni lo reabre: son ejes distintos y el admin decide el estado por
 *     separado. Mezclarlos haría que reembolsar la propina de un pedido
 *     entregado lo devolviera a la cocina.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response } = await requireAdmin({ permission: "pedidos" })
    if (response) return response

    const { id } = await params
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
    }
    const orderId = Number(id)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
    }

    const requestedAmount = (body as { amount_cents?: unknown }).amount_cents
    if (
      requestedAmount !== undefined &&
      (!Number.isInteger(requestedAmount) || (requestedAmount as number) <= 0)
    ) {
      return NextResponse.json(
        { error: "amount_cents debe ser un entero de centavos mayor que 0" },
        { status: 400 }
      )
    }

    const reasonRaw = (body as { reason?: unknown }).reason
    const reason =
      typeof reasonRaw === "string" && reasonRaw.trim()
        ? reasonRaw.trim().slice(0, 200)
        : null

    const supabase = await createServiceClient()

    const { data: order, error: readError } = await supabase
      .from("orders")
      .select(
        "id, payment_status, stripe_payment_intent_id, connected_account_id, application_fee_amount, refunded_amount_cents"
      )
      .eq("id", orderId)
      .maybeSingle()

    if (readError) {
      logger.error("admin.refund.read_failed", { orderId, error: readError.message })
      return NextResponse.json({ error: "No se pudo leer el pedido" }, { status: 500 })
    }
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const paymentStatus = String(order.payment_status ?? "")
    if (!isRefundableStatus(paymentStatus)) {
      return NextResponse.json(
        {
          error: `Un pedido en estado de pago "${paymentStatus}" no se puede reembolsar`,
          payment_status: paymentStatus,
        },
        { status: 409 }
      )
    }

    const paymentIntentId =
      typeof order.stripe_payment_intent_id === "string"
        ? order.stripe_payment_intent_id
        : null
    if (!paymentIntentId) {
      return NextResponse.json(
        { error: "El pedido no tiene un cobro de Stripe asociado" },
        { status: 409 }
      )
    }

    const stripe = getStripe()

    // El importe cobrado lo manda Stripe, no `orders.total`: ver decisión #1.
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    const chargeId =
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id
    if (!chargeId) {
      return NextResponse.json(
        { error: "El cobro todavía no tiene un cargo asociado en Stripe" },
        { status: 409 }
      )
    }

    const charge = await stripe.charges.retrieve(chargeId)
    const chargedCents = charge.amount
    const alreadyRefundedCents = order.refunded_amount_cents ?? charge.amount_refunded ?? 0

    const remaining = refundableCents(chargedCents, alreadyRefundedCents)
    if (remaining <= 0) {
      return NextResponse.json(
        { error: "El pedido ya está reembolsado por completo" },
        { status: 409 }
      )
    }

    const amountCents = (requestedAmount as number | undefined) ?? remaining
    if (amountCents > remaining) {
      return NextResponse.json(
        {
          error: `Sólo quedan ${remaining} centavos por reembolsar`,
          refundable_cents: remaining,
        },
        { status: 400 }
      )
    }

    // Connect apagado ⇒ el cargo vive contra la cuenta de la plataforma y no
    // hay transferencia que revertir. La bandera de entorno decide, pero el
    // dato real es la cuenta conectada guardada en el pedido: si el pedido se
    // enrutó, hay que revertir aunque la bandera se apague después.
    const routed = Boolean(order.connected_account_id) || isConnectRoutingEnabled()

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountCents,
      metadata: reason ? { order_id: String(orderId), reason } : { order_id: String(orderId) },
      ...buildRefundParams({
        routed,
        applicationFeeAmount: order.application_fee_amount ?? null,
      }),
    })

    const outcome = resolveRefundOutcome({
      totalCents: chargedCents,
      alreadyRefundedCents,
      refundAmountCents: refund.amount ?? amountCents,
    })

    const { error: writeError } = await supabase
      .from("orders")
      .update({
        payment_status: outcome.status,
        refunded_amount_cents: outcome.refundedAmountCents,
        stripe_refund_id: refund.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)

    if (writeError) {
      // El dinero ya salió: no se puede deshacer, pero el panel no debe
      // quedarse mintiendo. Se registra fuerte y se responde 500 para que el
      // admin sepa que tiene que revisar, no para que reintente a ciegas.
      logger.error("admin.refund.write_failed", {
        orderId,
        refundId: refund.id,
        error: writeError.message,
      })
      return NextResponse.json(
        {
          error:
            "El reembolso se envió a Stripe pero no se pudo registrar en el pedido. Revisa el pedido antes de reintentar.",
          refund_id: refund.id,
        },
        { status: 500 }
      )
    }

    await logAdminAction(supabase, {
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: "order_refund",
      entity: "orders",
      entityId: orderId,
      detail: {
        amount_cents: refund.amount ?? amountCents,
        refunded_amount_cents: outcome.refundedAmountCents,
        status: outcome.status,
        routed,
        refund_id: refund.id,
        reason,
      },
    })

    logger.info("admin.refund.created", {
      orderId,
      refundId: refund.id,
      amountCents: refund.amount ?? amountCents,
      status: outcome.status,
      routed,
    })

    return NextResponse.json({
      ok: true,
      refund_id: refund.id,
      amount_cents: refund.amount ?? amountCents,
      refunded_amount_cents: outcome.refundedAmountCents,
      payment_status: outcome.status,
      reversed_transfer: routed,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido"
    logger.error("admin.refund.failed", { error: message })
    return NextResponse.json({ error: "No se pudo procesar el reembolso" }, { status: 500 })
  }
}
