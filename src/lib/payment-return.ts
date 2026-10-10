/**
 * La vuelta de un cobro con tarjeta que **salió del navegador** (CoDi y el 3DS
 * que el banco no resuelve inline).
 *
 * `StripePaymentForm` confirma con `redirect: "if_required"` y una `return_url`,
 * así que el banco puede llevarse al cliente y devolverlo a la MISMA página con
 * `redirect_status=succeeded` y el `payment_intent`. Al volver, la página se
 * recarga: `createdOrderId`, el `clientSecret` y el paso del checkout murieron
 * con ella, y el post-pago —limpiar el carrito, guardar `last_order`, navegar a
 * la confirmación— **nunca corre**. El síntoma: el carrito se quedaba con los
 * artículos del pedido ya pagado.
 *
 * Para no tocar flujos ajenos —completar el pago de un pedido viejo desde
 * `/mis-pedidos` también puede salir del navegador— la vuelta solo se reclama si
 * **coincide con el intent que dejó esta pestaña**: la marca la escribe el
 * checkout al crear el PaymentIntent. Vive en `sessionStorage` porque es de la
 * pestaña que pagó: Stripe vuelve en ella.
 */

/** Marca de un cobro con tarjeta en curso en esta pestaña. */
export const PENDING_CARD_KEY = "resurte:pending-card-payment"

/** Parámetros que Stripe añade a la `return_url`. */
export const STRIPE_RETURN_PARAMS = [
  "redirect_status",
  "payment_intent",
  "payment_intent_client_secret",
] as const

export interface PendingCardPayment {
  orderId: number
  /** `pi_…` del intent en curso; `null` si el clientSecret no lo expuso. */
  paymentIntentId: string | null
}

/** sessionStorage de la pestaña, o `null` en SSR y donde esté bloqueado. */
function defaultStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** `pi_xxx` del client secret (`pi_xxx_secret_yyy`); `null` si no es de intent. */
export function paymentIntentIdFromClientSecret(clientSecret: string): string | null {
  const id = clientSecret.split("_secret")[0]
  return id && id.startsWith("pi_") ? id : null
}

/** Guarda el cobro en curso. Nunca lanza: es una comodidad, no un requisito. */
export function savePendingCardPayment(
  payment: PendingCardPayment,
  storage: Storage | null = defaultStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(PENDING_CARD_KEY, JSON.stringify(payment))
  } catch {
    // Cuota llena o modo privado: el checkout sigue funcionando sin esto.
  }
}

/** Lee la marca, o `null` si no hay, está corrupta o no es de un pedido. */
export function readPendingCardPayment(
  storage: Storage | null = defaultStorage()
): PendingCardPayment | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_CARD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { orderId?: unknown; paymentIntentId?: unknown }
    if (typeof parsed?.orderId !== "number" || !Number.isInteger(parsed.orderId)) return null
    return {
      orderId: parsed.orderId,
      paymentIntentId:
        typeof parsed.paymentIntentId === "string" ? parsed.paymentIntentId : null,
    }
  } catch {
    return null
  }
}

/** Olvida la marca (pago confirmado, cancelado o vuelta ya reclamada). */
export function clearPendingCardPayment(storage: Storage | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(PENDING_CARD_KEY)
  } catch {
    // no-op
  }
}

/**
 * ¿Esta vuelta de Stripe cierra el cobro que dejó esta pestaña?
 *
 * Exige `redirect_status=succeeded` **y** que el `payment_intent` devuelto sea el
 * que se dejó en curso. Sin la marca (otro flujo de Stripe, otra pestaña, una
 * compra pagada desde otro dispositivo) devuelve `false`: el post-pago de un
 * cobro ajeno vaciaría un carrito que no tiene nada que ver.
 */
export function isReturnOfPendingPayment(
  search: string,
  pending: PendingCardPayment | null
): boolean {
  if (!pending) return false
  const params = new URLSearchParams(search)
  if (params.get("redirect_status") !== "succeeded") return false
  const intent = params.get("payment_intent")
  // Sin id conocido no se puede verificar: la marca ya dice que esta pestaña
  // dejó un cobro en curso y el pago volvió confirmado.
  if (pending.paymentIntentId === null) return true
  return intent === pending.paymentIntentId
}
