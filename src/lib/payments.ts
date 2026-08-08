import { getStripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/service"

export class PaymentIntentError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface PaymentIntentResult {
  clientSecret: string
  paymentIntentId: string
}

/**
 * Crea un PaymentIntent de Stripe para un pedido pendiente con pago por
 * tarjeta y lo liga al pedido (orders o foodos_orders según `type`).
 *
 * El monto SIEMPRE se deriva del total del pedido en BD (nunca del body del
 * cliente), de modo que el webhook pueda validar `amount_received` contra el
 * mismo valor sin confiar en el frontend.
 *
 * Lanza PaymentIntentError con el status HTTP apropiado si el pedido no es
 * válido para cobrar (no existe, no usa tarjeta o ya no está pendiente).
 */
export async function createPaymentIntentForOrder(params: {
  type: "main" | "foodos"
  orderId: number | string
  userId?: string | null
  guestToken?: string | null
}): Promise<PaymentIntentResult> {
  const supabase = await createServiceClient()
  const stripe = getStripe()

  if (params.type === "main") {
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, user_id, payment_method, payment_status, total, address_id")
      .eq("id", Number(params.orderId))
      .maybeSingle()

    if (error || !order) {
      throw new PaymentIntentError("Pedido no encontrado", 404)
    }
    if (order.payment_method !== "card") {
      throw new PaymentIntentError("El pedido no usa pago con tarjeta")
    }
    if (order.payment_status !== "pending") {
      throw new PaymentIntentError("El pedido ya no está pendiente de pago")
    }

    // Propiedad del pedido:
    //  · autenticado → el pedido debe pertenecer al usuario;
    //  · anónimo → el guest_token debe coincidir con el de la dirección del
    //    pedido (reutiliza el mecanismo de checkout anónimo existente).
    if (order.user_id && params.userId && order.user_id !== params.userId) {
      throw new PaymentIntentError("No autorizado para este pedido", 403)
    }
    if (!order.user_id) {
      if (params.userId) {
        throw new PaymentIntentError("No autorizado para este pedido", 403)
      }
      if (params.guestToken && order.address_id) {
        const { data: addr } = await supabase
          .from("addresses")
          .select("guest_token")
          .eq("id", order.address_id)
          .maybeSingle()
        if (addr && addr.guest_token && addr.guest_token !== params.guestToken) {
          throw new PaymentIntentError("No autorizado para este pedido", 403)
        }
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(order.total) * 100), // MXN cents — total real de BD
      currency: "mxn",
      automatic_payment_methods: { enabled: true },
      metadata: {
        order_id: String(order.id),
        source: "resurte.me",
        user_id: order.user_id ?? "anonymous",
      },
    })

    await supabase
      .from("orders")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", order.id)

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
    }
  }

  // FoodOS (micrositio /r/[slug]): pedidos anónimos con solo nombre/teléfono.
  // Cualquier visitante puede crear un intent para un pedido pendiente de
  // tarjeta; el monto se valida contra el total en BD y el webhook lo verifica
  // de nuevo, así que no hay superficie de abuso monetario.
  const { data: order, error } = await supabase
    .from("foodos_orders")
    .select("id, payment_method, payment_status, total, restaurant_id")
    .eq("id", params.orderId)
    .maybeSingle()

  if (error || !order) {
    throw new PaymentIntentError("Pedido no encontrado", 404)
  }
  if (order.payment_method !== "card") {
    throw new PaymentIntentError("El pedido no usa pago con tarjeta")
  }
  if (order.payment_status !== "pending") {
    throw new PaymentIntentError("El pedido ya no está pendiente de pago")
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(Number(order.total) * 100),
    currency: "mxn",
    automatic_payment_methods: { enabled: true },
    metadata: {
      foodos_order_id: String(order.id),
      restaurant_id: order.restaurant_id,
      source: "resurte.me-foodos",
    },
  })

  await supabase
    .from("foodos_orders")
    .update({ stripe_payment_intent_id: paymentIntent.id })
    .eq("id", order.id)

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  }
}
