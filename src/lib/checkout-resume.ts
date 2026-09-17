/**
 * K13 — reanudar el checkout donde se quedó el cliente.
 *
 * Solo se persiste el **paso**, nunca datos del pedido: la dirección, el
 * teléfono y el correo viven en el estado del componente y en el servidor. Un
 * refresco a mitad del flujo —o la vuelta de la redirección a Stripe— devuelve
 * al cliente al mismo paso en vez de al principio.
 *
 * `sessionStorage` y no `localStorage`: el paso solo tiene sentido para el
 * intento de compra en curso. Los artículos del carrito sí sobreviven a cerrar
 * el navegador, pero reanudar tres días después en "pago" sin una dirección
 * recién confirmada sería peor que empezar de nuevo. La redirección de Stripe
 * ocurre en la misma pestaña, así que ese caso —el que más duele— sí se cubre.
 */

import type { Step } from "@/components/checkout/checkout-shared"

/** Clave de sessionStorage (prefijo `resurte:` del resto del checkout). */
export const CHECKOUT_STEP_KEY = "resurte:checkout-step"

/** Paso con el que arranca el flujo cuando no hay nada que reanudar. */
export const FIRST_STEP: Step = "address"

const STEPS: readonly Step[] = ["address", "schedule", "review", "payment"]

function isStep(value: unknown): value is Step {
  return typeof value === "string" && (STEPS as readonly string[]).includes(value)
}

/** Normaliza el valor guardado. `null` si está vacío, corrupto o no es un paso. */
export function parseCheckoutStep(raw: string | null | undefined): Step | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  return isStep(value) ? value : null
}

/**
 * Paso al que reanudar, o `null` si no hay nada reanudable (el llamante decide
 * entonces con qué paso arranca).
 *
 * `payment` es un paso legítimo pero **no** se reanuda: depende de un
 * PaymentIntent que vive en memoria y muere con la página, así que volver ahí
 * dejaría al cliente en un callejón sin salida. Se retrocede a `review`, el
 * paso más avanzado que sí se puede reconstruir sin perder progreso.
 */
export function resumeCheckoutStep(raw: string | null | undefined): Step | null {
  const step = parseCheckoutStep(raw)
  if (!step) return null
  return step === "payment" ? "review" : step
}

/** sessionStorage de la pestaña, o `null` en SSR y en navegadores que lo bloquean. */
function defaultStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Lee el paso guardado. Nunca lanza: sin almacenamiento disponible devuelve
 * `null`, que el llamante interpreta como "empezar de nuevo".
 */
export function readCheckoutStep(storage: Storage | null = defaultStorage()): Step | null {
  if (!storage) return null
  try {
    return resumeCheckoutStep(storage.getItem(CHECKOUT_STEP_KEY))
  } catch {
    return null
  }
}

/** Guarda el paso. Nunca lanza: reanudar es una comodidad, no un requisito. */
export function saveCheckoutStep(
  step: Step,
  storage: Storage | null = defaultStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(CHECKOUT_STEP_KEY, step)
  } catch {
    // Cuota llena o modo privado: el checkout sigue funcionando sin esto.
  }
}

/** Olvida el paso (pedido pagado, carrito vaciado o flujo abandonado). */
export function clearCheckoutStep(storage: Storage | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(CHECKOUT_STEP_KEY)
  } catch {
    // no-op
  }
}
