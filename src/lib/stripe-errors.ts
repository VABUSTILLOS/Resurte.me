/**
 * Mapeo de códigos de error de Stripe a mensajes accionables en español.
 *
 * Stripe expone errores con `type` (StripeErrorType: card_error,
 * invalid_request_error, api_connection_error, rate_limit_error,
 * authentication_error, api_error) y, en los card_error, un `code`
 * específico (card_declined, insufficient_funds, expired_card, ...).
 */

type StripeErrorType =
  | "card_error"
  | "invalid_request_error"
  | "api_connection_error"
  | "rate_limit_error"
  | "authentication_error"
  | "api_error"

type StripeErrorCode =
  | "card_declined"
  | "insufficient_funds"
  | "expired_card"
  | "incorrect_number"
  | "incorrect_cvc"
  | "processing_error"
  | "authentication_required"
  | "invalid_expiry_month"
  | "invalid_expiry_year"

export interface StripeLikeError {
  type?: string
  code?: string
  message?: string
  decline_code?: string | null
}

const TYPE_MESSAGES: Record<StripeErrorType, string> = {
  card_error: "No pudimos procesar tu tarjeta. Revisa los datos e intenta de nuevo.",
  invalid_request_error:
    "La solicitud de pago no es válida. Recarga la página e intenta de nuevo; si persiste, contacta a soporte.",
  api_connection_error:
    "No pudimos conectar con el procesador de pagos. Revisa tu conexión e intenta de nuevo.",
  rate_limit_error:
    "Se hicieron demasiados intentos en poco tiempo. Espera un momento e intenta de nuevo.",
  authentication_error:
    "No pudimos autenticar el pago con tu banco. Verifica tu método de pago o usa otra tarjeta.",
  api_error:
    "Ocurrió un error interno en el procesador de pagos. Intenta de nuevo en unos minutos.",
}

const CODE_MESSAGES: Record<StripeErrorCode, string> = {
  card_declined:
    "Tu banco rechazó la tarjeta. Usa otra tarjeta o contacta a tu banco para más información.",
  insufficient_funds: "Fondos insuficientes. Usa otra tarjeta o agrega fondos a tu cuenta.",
  expired_card: "Tu tarjeta está vencida. Usa otra tarjeta o actualiza la fecha de vencimiento.",
  incorrect_number: "El número de tarjeta es incorrecto. Verifica el número e intenta de nuevo.",
  incorrect_cvc: "El código de seguridad (CVC) es incorrecto. Verifica los 3 dígitos del reverso.",
  processing_error: "El banco no pudo procesar el pago. Intenta de nuevo en unos minutos.",
  authentication_required:
    "Tu banco requiere confirmar el pago (3D Secure). Completa la verificación para continuar.",
  invalid_expiry_month:
    "El mes de vencimiento es inválido. Verifica la fecha de vencimiento de tu tarjeta.",
  invalid_expiry_year:
    "El año de vencimiento es inválido. Verifica la fecha de vencimiento de tu tarjeta.",
}

/**
 * Devuelve un mensaje de error accionable en español para un error de
 * Stripe, priorizando el `code` específico, luego el `type` genérico.
 * Si no hay match, cae al message crudo o a un fallback en español.
 */
export function stripeErrorMessage(err: StripeLikeError | null | undefined): string {
  if (!err) return "No pudimos procesar el pago. Intenta de nuevo."

  if (err.code && err.code in CODE_MESSAGES) {
    return CODE_MESSAGES[err.code as StripeErrorCode]
  }

  if (err.type && err.type in TYPE_MESSAGES) {
    return TYPE_MESSAGES[err.type as StripeErrorType]
  }

  return err.message || "No pudimos procesar el pago. Intenta de nuevo."
}
