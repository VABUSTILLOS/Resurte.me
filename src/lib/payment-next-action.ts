/**
 * Instrucciones de pago de métodos locales asíncronos (OXXO, SPEI, CoDi).
 *
 * Módulo sin dependencias de servidor: lo consumen tanto
 * `createPaymentIntentForOrder` (servidor) como el formulario de pago
 * (cliente), que recibe `next_action` en el resultado de `confirmPayment`.
 *
 * Stripe tipa `display_details` como unión por método de pago, así que aquí
 * se lee de forma defensiva: no todos los campos existen en todos los métodos.
 */

export interface PaymentNextAction {
  /** Tipo de acción reportado por Stripe (p.ej. "display_details"). */
  type: string
  /** ISO 8601 en que caduca el voucher/CLABE. */
  expiresAt: string | null
  /** OXXO: referencia numérica del voucher. */
  voucherNumber: string | null
  /** OXXO: imagen PNG del código de barras. */
  barcodeImageUrl: string | null
  /** Página alojada por Stripe con el voucher o las instrucciones. */
  hostedInstructionsUrl: string | null
  /** SPEI: CLABE interbancaria destino. */
  clabe: string | null
  /** SPEI: banco receptor. */
  bankName: string | null
  /** SPEI/CoDi: referencia numérica de la operación. */
  reference: string | null
  /** CoDi: imagen PNG del QR. */
  qrImageUrl: string | null
  /** CoDi: imagen SVG del QR. */
  qrSvgUrl: string | null
}

/** Campos ausentes; `type` siempre lo aporta Stripe. */
export const EMPTY_NEXT_ACTION: Omit<PaymentNextAction, "type"> = {
  expiresAt: null,
  voucherNumber: null,
  barcodeImageUrl: null,
  hostedInstructionsUrl: null,
  clabe: null,
  bankName: null,
  reference: null,
  qrImageUrl: null,
  qrSvgUrl: null,
}

/** true si la acción trae al menos un dato que el cliente pueda mostrar. */
export function hasDisplayableDetails(action: PaymentNextAction): boolean {
  return Boolean(
    action.voucherNumber ||
      action.barcodeImageUrl ||
      action.clabe ||
      action.qrImageUrl ||
      action.hostedInstructionsUrl
  )
}

/**
 * Normaliza `payment_intent.next_action` (o el `next_action` de un
 * PaymentIntent serializado) a `PaymentNextAction`. Devuelve `null` cuando no
 * hay acción pendiente — el caso de un pago con tarjeta ya confirmado.
 */
export function parsePaymentNextAction(nextAction: unknown): PaymentNextAction | null {
  if (!nextAction || typeof nextAction !== "object") return null
  const action = nextAction as { type?: unknown; display_details?: unknown }
  const type = typeof action.type === "string" ? action.type : "unknown"

  const details =
    action.display_details && typeof action.display_details === "object"
      ? (action.display_details as Record<string, unknown>)
      : null
  if (!details) return { ...EMPTY_NEXT_ACTION, type }

  const str = (value: unknown) => (typeof value === "string" && value ? value : null)
  const barcode =
    details.barcode && typeof details.barcode === "object"
      ? (details.barcode as Record<string, unknown>)
      : null

  return {
    type,
    expiresAt: str(details.expires_at),
    voucherNumber: str(details.number),
    barcodeImageUrl: str(barcode?.image_url_png),
    hostedInstructionsUrl:
      str(details.hosted_voucher_url) ?? str(details.hosted_instructions_url),
    clabe: str(details.clabe),
    bankName: str(details.bank_name),
    reference: str(details.reference),
    qrImageUrl: str(details.image_url_png),
    qrSvgUrl: str(details.image_url_svg),
  }
}
