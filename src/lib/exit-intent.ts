/**
 * Lógica pura del exit-intent (abandono de carrito), extraída del componente
 * `ExitIntentCoupon` para poder probarla en aislamiento con Vitest.
 */

/** Regex de email usado en la captura de leads (idéntica a /api/leads). */
export const EXIT_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Determina si un evento `mouseout` del documento cuenta como salida real
 * por el borde superior del viewport (desktop). Un `relatedTarget` no nulo
 * significa que el puntero se movió hacia otro elemento DENTRO de la página,
 * no que está abandonando el sitio.
 */
export function isExitMouseEvent(event: {
  clientY: number
  relatedTarget: EventTarget | null
}): boolean {
  return event.clientY <= 0 && !event.relatedTarget
}

/**
 * Arma el payload de POST /api/leads para la fuente `exit_intent`.
 * Devuelve `null` si el email no es válido (no debe enviarse).
 */
export function buildExitLeadPayload(params: {
  email: string
  phone?: string
  couponCode?: string
}): {
  email: string
  phone?: string
  source: "exit_intent"
  coupon_code?: string
} | null {
  const email = params.email.trim().toLowerCase()
  if (!EXIT_EMAIL_RE.test(email)) return null
  const payload: {
    email: string
    phone?: string
    source: "exit_intent"
    coupon_code?: string
  } = { email, source: "exit_intent" }
  const phone = params.phone?.trim()
  if (phone) payload.phone = phone
  const couponCode = params.couponCode?.trim()
  if (couponCode) payload.coupon_code = couponCode
  return payload
}
