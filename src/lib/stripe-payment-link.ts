import { getStripe } from "@/lib/stripe"
import { buildTrackingUrl } from "@/lib/order-emails"
import { toCents } from "@/lib/payment-validation"
import { logger } from "@/lib/logger"
import {
  getOrderPaymentSummary,
  type OrderForPayments,
  type ServiceClient,
} from "@/lib/order-payments"

/**
 * Link de pago con tarjeta por pedido (Ola 4): una Checkout Session
 * hospedada por Stripe, creada para UN pedido y por su saldo exacto
 * leído de la BD — nunca por un monto que mande el cliente.
 *
 * Por qué Checkout Session y no Payment Link de catálogo: el monto
 * es el saldo vivo del pedido (cambia con cada abono), y la sesión
 * permite fijarlo por creación, ligar el PaymentIntent al pedido
 * con metadata (`order_id` + `order_payment_link`) y caducarlo a
 * las ~24 h. El webhook existente recibe el `payment_intent.
 * succeeded` de esa sesión y lo deriva al libro de pagos
 * (`handleOrderPaymentLinkSucceeded`): el pedido se marca pagado
 * solo cuando el libro cubre el total.
 *
 * Reutilización: el último link generado se guarda en
 * `orders.payment_link_*` (00233) y se reutiliza si es por el
 * mismo monto y no ha caducado; un saldo distinto genera otro.
 * Las columnas son best-effort: sin la migración, cada llamada
 * crea una sesión nueva y todo lo demás funciona igual.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurte.me").replace(/\/$/, "")

/** Una sesión de Stripe vive hasta 24 h; el link se reutiliza hasta las 23 h. */
const LINK_REUSE_TTL_MS = 23 * 60 * 60 * 1000
const SESSION_TTL_SECONDS = 24 * 60 * 60 - 60

export interface PaymentLinkOrder extends OrderForPayments {
  customer_email?: string | null
  restore_token?: string | null
  city_slug?: string | null
}

export type PaymentLinkErrorCode =
  | "stripe_not_configured"
  | "no_balance"
  | "invalid_amount"

export class PaymentLinkError extends Error {
  code: PaymentLinkErrorCode
  constructor(code: PaymentLinkErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export interface OrderPaymentLink {
  url: string
  sessionId: string | null
  /** Monto del link (el saldo completo o el abono elegido). */
  amount: number
  /** Saldo del pedido al momento de generarlo. */
  balance: number
  /** true si se devolvió el link ya generado en vez de crear otro. */
  reused: boolean
}

export interface PersistedLink {
  sessionId: string | null
  url: string | null
  amount: number | null
  createdAt: string | null
}

/** Lee el link persistido del pedido (null si no hay o si faltan las columnas). */
export async function readPersistedOrderPaymentLink(
  supabase: ServiceClient,
  orderId: number
): Promise<PersistedLink | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("payment_link_session_id, payment_link_url, payment_link_amount, payment_link_created_at")
    .eq("id", orderId)
    .maybeSingle()
  if (error) {
    // 42703 = columnas de 00233 sin aplicar: el link no se persiste
    // y cada generación crea su sesión. No es un fallo del pago.
    if (error.code !== "42703") {
      logger.warn("stripe.link.read_failed", { orderId, error: error.message })
    }
    return null
  }
  if (!data) return null
  return {
    sessionId: data.payment_link_session_id ?? null,
    url: data.payment_link_url ?? null,
    amount: data.payment_link_amount != null ? Number(data.payment_link_amount) : null,
    createdAt: data.payment_link_created_at ?? null,
  }
}

async function persistLink(
  supabase: ServiceClient,
  orderId: number,
  link: { sessionId: string; url: string; amount: number }
): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({
      payment_link_session_id: link.sessionId,
      payment_link_url: link.url,
      payment_link_amount: link.amount,
      payment_link_created_at: new Date().toISOString(),
    })
    .eq("id", orderId)
  if (error && error.code !== "42703") {
    logger.warn("stripe.link.persist_failed", { orderId, error: error.message })
  }
}

/** Borra el link persistido si corresponde a la sesión dada (al caducar). Best-effort. */
export async function clearPersistedOrderPaymentLink(
  supabase: ServiceClient,
  sessionId: string
): Promise<void> {
  try {
    await supabase
      .from("orders")
      .update({
        payment_link_session_id: null,
        payment_link_url: null,
        payment_link_amount: null,
        payment_link_created_at: null,
      })
      .eq("payment_link_session_id", sessionId)
  } catch (err) {
    logger.warn("stripe.link.clear_failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Devuelve el link de pago del pedido, reutilizando el vigente o
 * creando una Checkout Session nueva. Sin `amount`, el link es por
 * el saldo completo; con `amount`, por ese abono (anticipo).
 *
 * Lanza `PaymentLinkError` cuando no hay link posible: Stripe sin
 * configurar, pedido ya pagado / sin saldo, o monto fuera de rango.
 */
export async function getOrCreateOrderPaymentLink(
  supabase: ServiceClient,
  order: PaymentLinkOrder,
  opts: { amount?: number } = {}
): Promise<OrderPaymentLink> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new PaymentLinkError(
      "stripe_not_configured",
      "STRIPE_SECRET_KEY no está configurada: no se puede generar el link de pago"
    )
  }

  const summary = await getOrderPaymentSummary(supabase, order)
  const balanceCents = toCents(summary.balance)
  if (summary.isPaidStatus || balanceCents <= 0) {
    throw new PaymentLinkError("no_balance", "El pedido ya está pagado: no tiene saldo por cobrar")
  }

  const amountCents = opts.amount != null ? toCents(opts.amount) : balanceCents
  if (amountCents <= 0 || amountCents > balanceCents) {
    throw new PaymentLinkError(
      "invalid_amount",
      "El monto del link debe ser mayor a cero y no pasar del saldo del pedido"
    )
  }

  const persisted = await readPersistedOrderPaymentLink(supabase, order.id)
  if (
    persisted?.url &&
    persisted.amount != null &&
    toCents(persisted.amount) === amountCents &&
    persisted.createdAt &&
    Date.now() - new Date(persisted.createdAt).getTime() < LINK_REUSE_TTL_MS
  ) {
    return {
      url: persisted.url,
      sessionId: persisted.sessionId,
      amount: amountCents / 100,
      balance: summary.balance,
      reused: true,
    }
  }

  const trackingUrl =
    order.restore_token && order.city_slug
      ? buildTrackingUrl(order.city_slug, order.id, order.restore_token)
      : SITE_URL
  const isPartial = amountCents < balanceCents

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "mxn",
          product_data: {
            name: `Pedido #${order.id} — Resurte.me`,
            description: isPartial
              ? "Anticipo de tu pedido. El resto lo pagas con otro abono o contra entrega."
              : "Pago completo de tu pedido.",
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    // La metadata viaja al PaymentIntent: es el puente que el
    // webhook usa para registrar el pago en el libro del pedido.
    payment_intent_data: {
      metadata: { order_id: String(order.id), order_payment_link: "1" },
    },
    metadata: { order_id: String(order.id), order_payment_link: "1" },
    success_url: trackingUrl,
    cancel_url: trackingUrl,
    ...(order.customer_email ? { customer_email: order.customer_email } : {}),
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  })

  if (!session.url) {
    throw new Error("Stripe no devolvió URL para la sesión de pago")
  }

  await persistLink(supabase, order.id, {
    sessionId: session.id,
    url: session.url,
    amount: amountCents / 100,
  })

  logger.info("stripe.link.created", {
    orderId: order.id,
    sessionId: session.id,
    amount: amountCents / 100,
    partial: isPartial,
  })

  return {
    url: session.url,
    sessionId: session.id,
    amount: amountCents / 100,
    balance: summary.balance,
    reused: false,
  }
}
