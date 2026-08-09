import { getStripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/service"
import { toCents } from "@/lib/payment-validation"
import type Stripe from "stripe"
import { logger } from "@/lib/logger"

export class PaymentIntentError extends Error {
  status: number
  /**
   * Código máquina opcional para que el cliente distinga entre 409
   * reintentables (order_not_confirmed) y permanentes (no_payment_method,
   * out_of_stock) sin depender de inspeccionar el mensaje.
   */
  code?: string

  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
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

export type ProcessUpsellResult =
  | {
      status: "succeeded"
      paymentIntentId: string
      orderUpsellId: number
      amount: number
    }
  | {
      status: "requires_action"
      clientSecret: string
      paymentIntentId: string
      orderUpsellId: number
    }

export interface ProcessUpsellParams {
  orderId: number
  productId: number
  quantity: number
  /** Llave de idempotencia generada por el cliente (una por visita). */
  idempotencyKey: string
  userId?: string | null
  guestToken?: string | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Cobra un 1-click upsell off-session sobre una orden YA pagada, reutilizando
 * el método de pago guardado (stripe_payment_method_id) del cargo base.
 *
 * Contratos de la mecánica SamCart:
 *  · El cliente solo envía product_id + quantity + idempotency_key. El precio
 *    y el descuento se derivan server-side de `products` y `bump_rules`.
 *  · Si el pago base no guardó método (wallet/Link sin setup_future_usage), se
 *    rechaza con 409 — la orden base permanece intacta y el modal cae al
 *    downsell o confirmación final.
 *  · Idempotencia: un `order_upsells` pagado con la misma idempotency_key
 *    devuelve el resultado original sin cobrar dos veces (200).
 *  · Nunca muta orders.total ni payment_status de la orden base.
 *
 * Lanza PaymentIntentError si el pedido no admite upsell (404/403/409) o si
 * el banco rechaza el cargo (402).
 */
export async function processUpsellForOrder(
  params: ProcessUpsellParams
): Promise<ProcessUpsellResult> {
  const supabase = await createServiceClient()
  const stripe = getStripe()

  const qty = Math.floor(Number(params.quantity))
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
    throw new PaymentIntentError("Cantidad de upsell inválida", 400)
  }
  const key = params.idempotencyKey?.trim()
  if (!key) {
    throw new PaymentIntentError("idempotency_key es requerida", 400)
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, user_id, payment_status, status, stripe_payment_method_id, stripe_customer_id, address_id, store_id")
    .eq("id", params.orderId)
    .maybeSingle()

  if (error || !order) {
    throw new PaymentIntentError("Pedido no encontrado", 404)
  }
  if (order.payment_status !== "paid" || order.status !== "confirmed") {
    throw new PaymentIntentError(
      "El pedido aún no está confirmado",
      409,
      "order_not_confirmed"
    )
  }
  if (!order.stripe_payment_method_id) {
    throw new PaymentIntentError(
      "No hay método de pago guardado para este pedido",
      409,
      "no_payment_method"
    )
  }

  // Propiedad del pedido (misma regla que createPaymentIntentForOrder).
  if (order.user_id && params.userId && order.user_id !== params.userId) {
    throw new PaymentIntentError("No autorizado para este pedido", 403)
  }
  if (!order.user_id && params.userId) {
    throw new PaymentIntentError("No autorizado para este pedido", 403)
  }
  if (!order.user_id && params.guestToken && order.address_id) {
    const { data: addr } = await supabase
      .from("addresses")
      .select("guest_token")
      .eq("id", order.address_id)
      .maybeSingle()
    if (addr && addr.guest_token && addr.guest_token !== params.guestToken) {
      throw new PaymentIntentError("No autorizado para este pedido", 403)
    }
  }

  // Idempotencia: un upsell ya registrado para esta llave. Si está pagado,
  // devolvemos el resultado original sin volver a cobrar. Si quedó en
  // requires_action (3DS/SCA), consultamos el PaymentIntent real en Stripe
  // para reconciliar: si el cliente terminó la autenticación, se marca pagado
  // y se insertan sus items (sin crear un cargo nuevo).
  const { data: existingUpsell } = await supabase
    .from("order_upsells")
    .select("id, status, stripe_payment_intent_id, amount")
    .eq("order_id", order.id)
    .eq("idempotency_key", key)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingUpsell?.status === "paid") {
    return {
      status: "succeeded",
      paymentIntentId: existingUpsell.stripe_payment_intent_id!,
      orderUpsellId: existingUpsell.id,
      amount: Number(existingUpsell.amount),
    }
  }

  // Reconciliación de 3DS: el cargo pudo completarse en Stripe tras la
  // verificación bancaria pero antes de que el webhook actualice la fila.
  if (
    existingUpsell &&
    existingUpsell.status === "requires_action" &&
    existingUpsell.stripe_payment_intent_id
  ) {
    let pi
    try {
      pi = await stripe.paymentIntents.retrieve(existingUpsell.stripe_payment_intent_id)
    } catch {
      pi = null
    }
    if (pi?.status === "succeeded") {
      await supabase
        .from("order_upsells")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", existingUpsell.id)
      await supabase.from("order_items").insert({
        order_id: order.id,
        product_id: params.productId,
        quantity: qty,
        unit_price: Number(existingUpsell.amount) / qty,
        item_type: "upsell",
      })
      return {
        status: "succeeded",
        paymentIntentId: existingUpsell.stripe_payment_intent_id,
        orderUpsellId: existingUpsell.id,
        amount: Number(existingUpsell.amount),
      }
    }
    if (pi?.status === "requires_action" && pi.client_secret) {
      return {
        status: "requires_action",
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        orderUpsellId: existingUpsell.id,
      }
    }
    // El intent ya no es recuperable (canceled/failed): marcarlo y continuar
    // con un cargo nuevo en el siguiente intento.
    await supabase
      .from("order_upsells")
      .update({ status: pi?.status ?? "failed" })
      .eq("id", existingUpsell.id)
  }

  // Producto + descuento del upsell (derivados del server, nunca del cliente).
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, price, sale_price, stock_status")
    .eq("id", params.productId)
    .maybeSingle()

  if (productError || !product) {
    throw new PaymentIntentError("Producto de upsell no encontrado", 404)
  }
  if (product.stock_status === "out_of_stock") {
    throw new PaymentIntentError("Producto agotado", 409, "out_of_stock")
  }

  // Si el producto tiene una bump_rule activa, se reutiliza su descuento
  // (el admin define el descuento del upsell ahí); si no, precio completo.
  const { data: bumpRule } = await supabase
    .from("bump_rules")
    .select("discount_pct")
    .eq("product_id", product.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  const effectivePrice = product.sale_price ?? product.price
  const unitPrice = round2(effectivePrice * (1 - (Number(bumpRule?.discount_pct) || 0)))
  const amount = round2(unitPrice * qty)
  if (amount <= 0) {
    throw new PaymentIntentError("Monto de upsell inválido", 400)
  }

  // Registra el cargo (pending) con la idempotency_key del cliente.
  const { data: upsellRow, error: upsellErr } = await supabase
    .from("order_upsells")
    .insert({
      order_id: order.id,
      product_id: product.id,
      quantity: qty,
      unit_price: unitPrice,
      amount,
      status: "pending",
      idempotency_key: key,
    })
    .select("id")
    .single()

  if (upsellErr || !upsellRow) {
    logger.warn("order_upsells insert failed", {
      error: upsellErr?.message ?? "no row",
    })
    throw new PaymentIntentError("Error al registrar el upsell", 500)
  }

  // Cargo off-session con idempotencia de Stripe por order_upsells.id.
  let paymentIntent
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: toCents(amount),
        currency: "mxn",
        payment_method: order.stripe_payment_method_id,
        customer: order.stripe_customer_id ?? undefined,
        off_session: true,
        confirm: true,
        metadata: {
          order_id: String(order.id),
          order_upsell_id: String(upsellRow.id),
          source: "resurte.me-upsell",
        },
      },
      { idempotencyKey: `upsell-${upsellRow.id}` }
    )
  } catch (err) {
    const isAuthRequired =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "authentication_required"
    if (isAuthRequired && "payment_intent" in err) {
      const pi = (err as { payment_intent?: { id: string; client_secret?: string | null } }).payment_intent
      await supabase
        .from("order_upsells")
        .update({ status: "requires_action", stripe_payment_intent_id: pi?.id ?? null })
        .eq("id", upsellRow.id)
      if (!pi?.client_secret) {
        throw new PaymentIntentError("Error al procesar la verificación bancaria", 402)
      }
      return {
        status: "requires_action",
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        orderUpsellId: upsellRow.id,
      }
    }
    // Declinado / fondos insuficientes / error: la orden base permanece intacta.
    await supabase
      .from("order_upsells")
      .update({ status: "failed", stripe_payment_intent_id: null })
      .eq("id", upsellRow.id)
    throw new PaymentIntentError("No se pudo cobrar el upsell", 402)
  }

  if (paymentIntent.status === "succeeded") {
    await supabase
      .from("order_upsells")
      .update({
        status: "paid",
        stripe_payment_intent_id: paymentIntent.id,
        paid_at: new Date().toISOString(),
      })
      .eq("id", upsellRow.id)

    // Items del upsell (item_type='upsell'); NO toca orders.total ni los
    // items standard de la orden base.
    await supabase.from("order_items").insert({
      order_id: order.id,
      product_id: product.id,
      quantity: qty,
      unit_price: unitPrice,
      item_type: "upsell",
    })

    return {
      status: "succeeded",
      paymentIntentId: paymentIntent.id,
      orderUpsellId: upsellRow.id,
      amount,
    }
  }

  if (paymentIntent.status === "requires_action" && paymentIntent.client_secret) {
    await supabase
      .from("order_upsells")
      .update({ status: "requires_action", stripe_payment_intent_id: paymentIntent.id })
      .eq("id", upsellRow.id)
    return {
      status: "requires_action",
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      orderUpsellId: upsellRow.id,
    }
  }

  // Cualquier otro estado (processing, canceled, etc.) → failed, orden intacta.
  await supabase
    .from("order_upsells")
    .update({ status: "failed", stripe_payment_intent_id: paymentIntent.id })
    .eq("id", upsellRow.id)
  throw new PaymentIntentError("No se pudo completar el cobro del upsell", 402)
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
      // Email para que Stripe Link reconozca/prefill al cliente y para el
      // recibo. El drawer y el checkout de página ya lo envían como
      // customer_email; aquí se aplica al intent de pago. Se valida con regex
      // porque Stripe rechaza intents con receipt_email malformado.
      ...(() => {
        const candidate = (order.customer_email ?? params.customerEmail ?? "").trim()
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(candidate) ? { receipt_email: candidate } : {}
      })(),
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
