// ============================================================
// Enrutamiento de canal para marketing (núcleo puro).
//
// Decide por dónde sale cada mensaje y en qué variante de una prueba A/B
// cae cada destinatario. Sin red, sin Supabase: solo reglas.
// ============================================================

import type {
  FoodosCampaignVariant,
  FoodosMarketingChannel,
} from "@/types/foodos"

/** Canales que realmente salen por el cable. */
export type OutboundChannel = "whatsapp" | "sms"

export interface ChannelCapabilities {
  /** El restaurante tiene WhatsApp conectado (o hay credenciales globales). */
  whatsapp: boolean
  /** Hay un adaptador de SMS configurado en el servidor. */
  sms: boolean
  /** El cliente dio consentimiento explícito para SMS. */
  smsOptIn: boolean
}

export type ChannelReason =
  | "ok"
  | "whatsapp_unavailable"
  | "sms_unavailable"
  | "no_sms_opt_in"

export interface ChannelDecision {
  channel: OutboundChannel | null
  reason: ChannelReason
  /**
   * Canal alterno a intentar si el principal falla. Solo se ofrece cuando
   * la automatización pidió `both`: elegir "solo WhatsApp" es una decisión
   * explícita y no debe terminar en un SMS sorpresa.
   */
  fallback: OutboundChannel | null
}

/**
 * Resuelve el canal efectivo.
 *
 * Prioridad: WhatsApp primero (es gratis dentro de la ventana de 24 h y
 * admite texto libre), SMS después y solo con opt-in.
 */
export function resolveChannel(
  preferred: FoodosMarketingChannel,
  caps: ChannelCapabilities
): ChannelDecision {
  const smsAllowed = caps.sms && caps.smsOptIn

  if (preferred === "whatsapp") {
    return caps.whatsapp
      ? { channel: "whatsapp", reason: "ok", fallback: null }
      : { channel: null, reason: "whatsapp_unavailable", fallback: null }
  }

  if (preferred === "sms") {
    if (smsAllowed) return { channel: "sms", reason: "ok", fallback: null }
    return {
      channel: null,
      reason: caps.sms ? "no_sms_opt_in" : "sms_unavailable",
      fallback: null,
    }
  }

  // "both": WhatsApp si se puede, si no SMS con opt-in.
  if (caps.whatsapp) {
    return {
      channel: "whatsapp",
      reason: "ok",
      fallback: smsAllowed ? "sms" : null,
    }
  }
  if (smsAllowed) return { channel: "sms", reason: "ok", fallback: null }
  return {
    channel: null,
    reason: caps.sms ? "no_sms_opt_in" : "whatsapp_unavailable",
    fallback: null,
  }
}

// ------------------------------------------------------------
// Pruebas A/B
// ------------------------------------------------------------

/** FNV-1a de 32 bits. Estable entre procesos y versiones de Node. */
function hash32(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Variante determinista por cliente: la misma persona siempre ve la misma
 * variante, y el reparto es reproducible entre corridas (a diferencia de
 * `Math.random()`, que haría que dos envíos del mismo experimento no
 * fueran comparables).
 */
export function pickVariant(
  customerId: string,
  abTest: boolean
): FoodosCampaignVariant | null {
  if (!abTest) return null
  return hash32(customerId) % 2 === 0 ? "a" : "b"
}

/** Reparto real de un experimento, para el reporte de A/B. */
export interface AbTestTally {
  a: { sent: number; failed: number }
  b: { sent: number; failed: number }
}

export function tallyAbTest(
  rows: readonly {
    variant: FoodosCampaignVariant | null
    status: string
  }[]
): AbTestTally {
  const tally: AbTestTally = {
    a: { sent: 0, failed: 0 },
    b: { sent: 0, failed: 0 },
  }
  for (const row of rows) {
    if (row.variant !== "a" && row.variant !== "b") continue
    const bucket = tally[row.variant]
    if (row.status === "sent") bucket.sent++
    else if (row.status === "failed") bucket.failed++
  }
  return tally
}
