// Decisión de consentimiento de cookies, compartida por el banner y por
// cualquier otro flotante de primera visita que compita por el mismo tap.
//
// El banner guarda la decisión en crudo (string plano, no JSON) porque nació
// antes del registro de schemas de `src/lib/storage`. Este módulo conserva ese
// formato a propósito: cambiarlo invalidaría las decisiones ya guardadas y
// haría reaparecer el banner a todo el mundo.
//
// Fuente única de la clave: si el banner y los lectores usaran literales
// distintos, el gate de `useToolGuide` fallaría en silencio y la guía volvería
// a tapar el banner.

import type { StorageLike } from "./storage"

export const COOKIE_CONSENT_KEY = "resurte_cookie_consent"

/** "accepted" = todo; "essential" = solo necesarias. */
export type CookieConsentDecision = "accepted" | "essential"

const DECISIONS = ["accepted", "essential"] as const

export function isConsentDecision(value: unknown): value is CookieConsentDecision {
  return typeof value === "string" && (DECISIONS as readonly string[]).includes(value)
}

function getStorage(): StorageLike | null {
  if (typeof globalThis === "undefined") return null
  return (globalThis as { localStorage?: StorageLike }).localStorage ?? null
}

/**
 * Decisión guardada, o `null` si el usuario todavía no ha decidido.
 *
 * `null` significa "el banner está —o va a estar— en pantalla": mientras eso
 * pase, ningún otro flotante debe pedirle un tap al usuario. Es la señal que
 * usa `useToolGuide` para no auto-abrirse encima del banner.
 */
export function readConsentDecision(
  storage: StorageLike | null = getStorage(),
): CookieConsentDecision | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(COOKIE_CONSENT_KEY)
    return isConsentDecision(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeConsentDecision(
  decision: CookieConsentDecision,
  storage: StorageLike | null = getStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(COOKIE_CONSENT_KEY, decision)
  } catch {
    // Storage no disponible (modo privado, cuota): la decisión no persiste y el
    // banner reaparecerá en la próxima visita. Es la degradación correcta —
    // consentir es una obligación, no un detalle de UX.
  }
}
