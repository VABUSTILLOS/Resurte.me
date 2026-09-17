// ============================================================
// Envío de marketing multicanal.
//
// Único punto por el que sale un mensaje de campaña de FoodOS. Existe
// para arreglar un bug real: el motor anterior llamaba
// `sendTextMessage({ to, text })` sin config, así que TODAS las campañas
// salían por el WhatsApp global de la plataforma en vez del WhatsApp del
// restaurante que las enviaba.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { getRestaurantWhatsAppConfig } from "@/lib/foodos-whatsapp"
import { normalizePhone } from "@/lib/foodos"
import { sendTextMessage, type WhatsAppConfig } from "@/lib/whatsapp"
import { resolveChannel, type ChannelReason, type OutboundChannel } from "./channel"
import { resolveSmsAdapter } from "./sms"
import type { FoodosMarketingChannel } from "@/types/foodos"

export interface MessagingCapabilities {
  whatsapp: boolean
  sms: boolean
  /** Config del restaurante; `null` = se usa la global si existe. */
  waConfig: WhatsAppConfig | null
}

/**
 * Credenciales globales de WhatsApp de la plataforma. Se comprueba a mano
 * porque `getConfig` de `@/lib/whatsapp` no se exporta; replicar la regla
 * (token + phone number id) es más barato que abrir el módulo.
 */
function globalWhatsAppAvailable(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  )
}

/**
 * Resuelve las capacidades UNA vez por corrida de campaña. Se hace fuera
 * del bucle de destinatarios porque descifrar el token y consultar la
 * conexión por cliente sería un desperdicio y un riesgo de rate limit.
 */
export async function loadMessagingCapabilities(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<MessagingCapabilities> {
  let waConfig: WhatsAppConfig | null = null
  try {
    waConfig = await getRestaurantWhatsAppConfig(supabase, restaurantId)
  } catch (err) {
    // Sin este aviso, un fallo de la conexión del restaurante cae en silencio
    // al WhatsApp global de la plataforma: justo el bug que este módulo evita.
    logger.warn("messaging.wa-config", {
      restaurantId,
      error: err instanceof Error ? err.message : String(err),
    })
    waConfig = null
  }
  return {
    whatsapp: waConfig !== null || globalWhatsAppAvailable(),
    sms: resolveSmsAdapter() !== null,
    waConfig,
  }
}

interface AttemptResult {
  ok: boolean
  provider: string | null
  error: string | null
}

async function attemptWhatsApp(
  caps: MessagingCapabilities,
  to: string,
  text: string
): Promise<AttemptResult> {
  try {
    await sendTextMessage(
      { to: normalizePhone(to), text },
      caps.waConfig ?? undefined
    )
    return { ok: true, provider: "meta", error: null }
  } catch (err) {
    return {
      ok: false,
      provider: "meta",
      error: err instanceof Error ? err.message : "Error de WhatsApp",
    }
  }
}

async function attemptSms(to: string, text: string): Promise<AttemptResult> {
  const adapter = resolveSmsAdapter()
  if (!adapter) return { ok: false, provider: null, error: "SMS no configurado" }
  // Mismo blindaje que attemptWhatsApp: el contrato de sendMarketingMessage es
  // "nunca lanza". Un adaptador que lance no puede tumbar la corrida de campañas.
  try {
    const result = await adapter.send({ to, text })
    return result.ok
      ? { ok: true, provider: result.provider, error: null }
      : { ok: false, provider: result.provider, error: result.error }
  } catch (err) {
    return {
      ok: false,
      provider: "sms",
      error: err instanceof Error ? err.message : "Error de SMS",
    }
  }
}

async function attempt(
  channel: OutboundChannel,
  caps: MessagingCapabilities,
  to: string,
  text: string
): Promise<AttemptResult> {
  return channel === "sms" ? attemptSms(to, text) : attemptWhatsApp(caps, to, text)
}

export interface SendMarketingMessageParams {
  caps: MessagingCapabilities
  to: string
  text: string
  preferred: FoodosMarketingChannel
  smsOptIn: boolean
}

export interface SendMarketingResult {
  ok: boolean
  /** Canal por el que salió (o se intentó salir). */
  channel: OutboundChannel | null
  provider: string | null
  reason: ChannelReason
  error: string | null
}

/**
 * Envía un mensaje por el canal que corresponda. **Nunca lanza**: devuelve
 * el motivo para que el motor lo persista en `foodos_campaigns.error`.
 */
export async function sendMarketingMessage(
  params: SendMarketingMessageParams
): Promise<SendMarketingResult> {
  const { caps, to, text, preferred, smsOptIn } = params
  const decision = resolveChannel(preferred, {
    whatsapp: caps.whatsapp,
    sms: caps.sms,
    smsOptIn,
  })

  if (!decision.channel) {
    return {
      ok: false,
      channel: null,
      provider: null,
      reason: decision.reason,
      error: null,
    }
  }

  const primary = await attempt(decision.channel, caps, to, text)
  if (primary.ok) {
    return {
      ok: true,
      channel: decision.channel,
      provider: primary.provider,
      reason: "ok",
      error: null,
    }
  }

  // Solo `both` ofrece respaldo: el restaurante pidió expresamente que el
  // mensaje salga por donde sea.
  if (decision.fallback) {
    const secondary = await attempt(decision.fallback, caps, to, text)
    if (secondary.ok) {
      return {
        ok: true,
        channel: decision.fallback,
        provider: secondary.provider,
        reason: "ok",
        error: null,
      }
    }
  }

  return {
    ok: false,
    channel: decision.channel,
    provider: primary.provider,
    reason: "ok",
    error: primary.error,
  }
}
