// ============================================================
// Dedupe entre los dos motores de mensajería (Fase 9)
// ============================================================
// Resurte.me tiene dos motores de mensajes que NO son duplicados y no deben
// fusionarse, porque cambian en las cuatro cosas que importan:
//
//   | | plataforma | restaurante |
//   |---|---|---|
//   | config | `whatsapp_automations` (admin) | `foodos_automations` (dueño) |
//   | destinatarios | clientes del marketplace | clientes del restaurante |
//   | bitácora | `whatsapp_automation_sends` | `foodos_campaigns` (hija) |
//   | envío | WhatsApp Cloud API directa | `messaging/send` (canal + SMS) |
//
// Fusionarlos obligaría a que la config de un restaurante pisara la de la
// plataforma (o al revés), y filtraría la audiencia de un inquilino a otro.
//
// Lo que SÍ se comparte es el dedupe: hay cuatro intenciones que existen en
// ambos motores (cumpleaños, carrito abandonado, reactivación y reseña) y un
// mismo teléfono puede ser cliente del marketplace y cliente de un restaurante
// a la vez. Sin esta capa, esa persona recibiría dos mensajes del mismo tipo
// el mismo día, que es exactamente el spam que el dueño no puede ver ni
// controlar desde su panel.
//
// Este módulo es puro: recibe los envíos ya leídos. La lectura vive en el
// motor del restaurante.
// ============================================================

import { localDateParts } from "@/lib/local-date"

/** Intención compartida entre los dos motores. */
export interface SharedIntent {
  /** Nombre canónico, para logs y reportes. */
  intent: string
  /** `automation_type` en `whatsapp_automations` (plataforma). */
  platformType: string
  /** `type` en `foodos_automations` (restaurante). */
  restaurantTypes: string[]
}

/**
 * Las cuatro intenciones que existen en los dos motores.
 *
 * `order_confirmation`, `thank_you`, `season_promo`, `off_hours` y
 * `new_product` solo existen del lado del restaurante: la plataforma no manda
 * mensajes transaccionales de pedidos ajenos, así que no compiten con nada.
 */
export const SHARED_INTENTS: readonly SharedIntent[] = [
  { intent: "birthday", platformType: "birthday", restaurantTypes: ["birthday"] },
  {
    intent: "abandoned_cart",
    platformType: "cart_abandonment",
    restaurantTypes: ["abandoned_cart"],
  },
  { intent: "reactivation", platformType: "reactivation", restaurantTypes: ["winback"] },
  {
    intent: "review_request",
    platformType: "post_delivery_rating",
    restaurantTypes: ["review_request"],
  },
] as const

/**
 * Identidad del destinatario para comparar teléfonos capturados por flujos
 * distintos. `profiles.phone` y `foodos_customers.phone` no se normalizan al
 * guardarse, así que el mismo número puede estar como `5512345678`,
 * `525512345678` o `5215512345678`. Sin esto el dedupe no coincidiría nunca.
 *
 * Devuelve `null` cuando no hay dígitos suficientes para afirmar que dos
 * números son la misma persona: preferimos no deduplicar a silenciar a alguien.
 */
export function recipientIdentity(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (digits.length < 10) return null
  // Formas mexicanas con código de país: 52 + 10 dígitos, o 521 + 10 dígitos
  // (el 1 extra de móvil que añaden algunos flujos de WhatsApp).
  if (digits.length === 13 && digits.startsWith("521")) return digits.slice(3)
  if (digits.length === 12 && digits.startsWith("52")) return digits.slice(2)
  if (digits.length === 10) return digits
  // Otro país o formato: se compara tal cual, sin inventar una equivalencia.
  return digits
}

/** La intención compartida de un `type` de `foodos_automations`, o null. */
export function intentForRestaurantType(type: string | null | undefined): SharedIntent | null {
  const wanted = (type ?? "").trim()
  if (!wanted) return null
  return SHARED_INTENTS.find((s) => s.restaurantTypes.includes(wanted)) ?? null
}

/** El `automation_type` de la plataforma equivalente, o null. */
export function platformTypeForRestaurantType(type: string | null | undefined): string | null {
  return intentForRestaurantType(type)?.platformType ?? null
}

/** Un envío ya registrado por el motor de la plataforma. */
export interface PlatformSend {
  automation_type: string
  recipient: string
  /** ISO 8601. */
  created_at: string
}

export interface CrossEngineCheck {
  sends: readonly PlatformSend[]
  /** `type` de `foodos_automations` que el restaurante está por enviar. */
  restaurantType: string
  /** Teléfono del cliente del restaurante. */
  recipient: string
  /** Zona del restaurante: define qué es "hoy". */
  timezone: string | null | undefined
  now?: Date
}

/**
 * ¿La plataforma ya le mandó a esta persona un mensaje de la misma intención
 * hoy? Si sí, el motor del restaurante debe saltarse ese destinatario.
 *
 * No consulta por `dedupe_key` a propósito: la llave de la plataforma es
 * `tipo:destinatario:día` con el teléfono tal como se guardó, y el del
 * restaurante puede venir en otro formato. Se compara por identidad de número.
 */
export function alreadySentByPlatform(check: CrossEngineCheck): boolean {
  const platformType = platformTypeForRestaurantType(check.restaurantType)
  if (!platformType) return false

  const target = recipientIdentity(check.recipient)
  if (!target) return false

  const now = check.now ?? new Date()
  const p = localDateParts(check.timezone, now)
  const today = `${p.year}-${p.month}-${p.day}`

  for (const send of check.sends) {
    if (send.automation_type !== platformType) continue
    if (recipientIdentity(send.recipient) !== target) continue
    const when = new Date(send.created_at)
    if (Number.isNaN(when.getTime())) continue
    const q = localDateParts(check.timezone, when)
    if (`${q.year}-${q.month}-${q.day}` === today) return true
  }
  return false
}

/** Los `type` de `foodos_automations` equivalentes a un tipo de la plataforma. */
export function restaurantTypesForPlatformType(platformType: string): string[] {
  const found = SHARED_INTENTS.find((s) => s.platformType === platformType)
  return found ? [...found.restaurantTypes] : []
}

/** Un envío ya registrado por el motor del restaurante. */
export interface RestaurantSend {
  /** `type` de `foodos_automations`; null si la automatización se borró. */
  automation_type: string | null
  /** Teléfono del cliente del restaurante. */
  recipient: string | null
  /** ISO 8601 de `foodos_campaigns.sent_at`. */
  sent_at: string | null
}

export interface CrossEngineCheckFromPlatform {
  sends: readonly RestaurantSend[]
  /** `automation_type` de la plataforma que está por enviar. */
  platformType: string
  /** Teléfono del destinatario de la plataforma. */
  recipient: string
  /**
   * Zona horaria que define "hoy". El motor de la plataforma usa
   * `America/Mexico_City` fijo (sus crons y sus plantillas asumen esa zona),
   * así que se le pasa la misma para que ambos lados cuenten el mismo día.
   */
  timezone: string | null | undefined
  now?: Date
}

/**
 * El espejo de `alreadySentByPlatform`: ¿el restaurante ya le mandó a esta
 * persona un mensaje de la misma intención hoy?
 *
 * Hace falta en los dos sentidos porque el cron diario corre primero las
 * campañas del restaurante y después las de la plataforma, pero el dueño puede
 * disparar una campaña a mano después del cron. Sin este lado, el orden de
 * ejecución decidiría quién gana y el invariante no se sostendría.
 */
export function alreadySentByRestaurant(check: CrossEngineCheckFromPlatform): boolean {
  const restaurantTypes = restaurantTypesForPlatformType(check.platformType)
  if (restaurantTypes.length === 0) return false

  const target = recipientIdentity(check.recipient)
  if (!target) return false

  const now = check.now ?? new Date()
  const p = localDateParts(check.timezone, now)
  const today = `${p.year}-${p.month}-${p.day}`

  for (const send of check.sends) {
    if (!send.automation_type || !restaurantTypes.includes(send.automation_type)) continue
    if (!send.recipient) continue
    if (recipientIdentity(send.recipient) !== target) continue
    if (!send.sent_at) continue
    const when = new Date(send.sent_at)
    if (Number.isNaN(when.getTime())) continue
    const q = localDateParts(check.timezone, when)
    if (`${q.year}-${q.month}-${q.day}` === today) return true
  }
  return false
}
