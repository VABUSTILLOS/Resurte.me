import { getStripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/service"
import { toCents } from "@/lib/payment-validation"
import type Stripe from "stripe"
import { logger } from "@/lib/logger"

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
  /**
   * true cuando el cliente autorizó guardar su método de pago y el intent fue
   * creado con `setup_future_usage: "off_session"` (requisito para los
   * 1-click upsells). false en caso contrario.
   */
  saveCardEnabled: boolean
}

/**
 * Busca o crea el Stripe Customer del cliente para poder reutilizar su método
 * de pago off-session (1-click upsells).
 *
 * · Autenticado → reutiliza el customer de la orden pagada más reciente del
 *   usuario (si existe) o crea uno nuevo con metadata user_id.
 * · Anónimo → reutiliza el customer ligado al guest_token (dentro de la misma
 *   sesión de navegación) o crea uno nuevo con metadata guest_token.
 *
 * Nunca lanza: si Stripe falla, devuelve null y el pago base continúa sin
 * guardado de método (fail-open — jamás bloquea el checkout por esto).
 */
async function findOrCreateStripeCustomer(params: {
  stripe: Stripe
  orderId: number
  userId?: string | null
  guestToken?: string | null
  email?: string | null
}): Promise<string | null> {
  const { stripe, orderId, userId, guestToken, email } = params
  const supabase = await createServiceClient()

  try {
    if (userId) {
      const { data: prior } = await supabase
        .from("orders")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .not("stripe_customer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (prior?.stripe_customer_id) return prior.stripe_customer_id
    }

    if (!userId && guestToken) {
      // Paso 1: addresses con el guest_token (límite acotado).
      const { data: addresses } = await supabase
        .from("addresses")
        .select("id")
        .eq("guest_token", guestToken)
        .limit(10)
      const addressIds = (addresses ?? []).map((a) => a.id)
      if (addressIds.length > 0) {
        // Paso 2: orden pagada con customer ya asociado a esas direcciones.
        const { data: prior } = await supabase
          .from("orders")
          .select("stripe_customer_id")
          .in("address_id", addressIds)
          .not("stripe_customer_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (prior?.stripe_customer_id) return prior.stripe_customer_id
      }
    }

    const customer = await stripe.customers.create({
      email: email?.trim() || undefined,
      metadata: {
        source: "resurte.me",
        order_id: String(orderId),
        ...(userId ? { user_id: userId } : {}),
        ...(!userId && guestToken ? { guest_token: guestToken } : {}),
      },
    })
    return customer.id
  } catch (error) {
    logger.warn("findOrCreateStripeCustomer failed, continue without saved PM", {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Crea un PaymentIntent de Stripe para un pedido pendiente con pago por
 * tarjeta y lo liga al pedido (orders o foodos_orders según `type`).
 *
 * El monto SIEMPRE se deriva del total del pedido en BD (nunca del body del
 * cliente), de modo que el webhook pueda validar `amount_received` contra el
 * mismo valor sin confiar en el frontend.
 *
 * Cuando `saveCardConsent` es true y el pedido usa tarjeta, se crea/reutiliza
 * un Stripe Customer y se fija `setup_future_usage: "off_session"` para poder
 * cobrar los 1-click upsells sin pedir la tarjeta de nuevo. Si el guardado no
 * es posible (wallet/Link, Stripe falla), el pago base NO se bloquea.
 *
 * Lanza PaymentIntentError con el status HTTP apropiado si el pedido no es
 * válido para cobrar (no existe, no usa tarjeta o ya no está pendiente).
 */
export async function createPaymentIntentForOrder(params: {
  type: "main" | "foodos"
  orderId: number | string
  userId?: string | null
  guestToken?: string | null
  saveCardConsent?: boolean
  customerEmail?: string | null
}): Promise<PaymentIntentResult> {
  const supabase = await createServiceClient()
  const stripe = getStripe()

  if (params.type === "main") {
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, user_id, payment_method, payment_status, total, address_id, customer_email")
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

    // Guardado de método de pago (solo main + consentimiento explícito).
    let customerId: string | null = null
    let saveCardEnabled = false
    if (params.saveCardConsent) {
      customerId = await findOrCreateStripeCustomer({
        stripe,
        orderId: order.id,
        userId: order.user_id ?? params.userId ?? null,
        guestToken: !order.user_id ? params.guestToken : null,
        email: order.customer_email ?? params.customerEmail,
      })
      if (customerId) saveCardEnabled = true
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: toCents(order.total), // MXN cents — total real de BD
      currency: "mxn",
      automatic_payment_methods: { enabled: true },
      ...(customerId ? { customer: customerId } : {}),
      ...(saveCardEnabled
        ? {
            payment_method_options: {
              card: { setup_future_usage: "off_session" },
            },
          }
        : {}),
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
      saveCardEnabled,
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
    amount: toCents(order.total),
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
    saveCardEnabled: false, // FoodOS no ofrece upsells off-session
  }
}
