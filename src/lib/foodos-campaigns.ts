// ============================================================
// Motor de ejecución de campañas FoodOS (solo servidor).
//
// Convierte una campaña "scheduled" en envíos reales: selecciona los
// clientes objetivo, elige canal (WhatsApp o SMS), resuelve la variante
// A/B, renderiza el mensaje con placeholders y registra cada envío como
// una campaña hija (sent | failed).
//
// Lo usan:
//  - /api/foodos/campaigns/run (cron diario de Vercel)
//  - El botón "Ejecutar campaña" del panel (server action)
// ============================================================

import { logger } from "@/lib/logger"
import { createServiceClient } from "@/lib/supabase/service"
import { normalizePhone } from "@/lib/foodos"
import {
  audienceMembers,
  filterAbandonedCarts,
  isAudienceKey,
  isBirthdayToday,
  localDateParts,
  SEGMENT_TO_AUDIENCE,
} from "@/lib/foodos-rfm"
import { pickVariant } from "@/lib/messaging/channel"
import { loadMessagingCapabilities, sendMarketingMessage } from "@/lib/messaging/send"
import { isIntegrationConfigured } from "@/lib/integration-status"
import {
  alreadySentByPlatform,
  platformTypeForRestaurantType,
  type PlatformSend,
} from "@/lib/messaging/dedupe"
import type {
  FoodosAutomation,
  FoodosCampaign,
  FoodosCampaignStatus,
  FoodosCustomer,
  FoodosRestaurant,
} from "@/types/foodos"

// México no usa horario de verano desde 2022: America/Mexico_City es
// UTC-6 fijo todo el año. Los crons de Vercel corren en UTC, así que
// la hora local se calcula restando 6h de forma determinista.
const CDMX_OFFSET_MS = 6 * 60 * 60 * 1000

/**
 * Normaliza `scheduled_for` a un valor comparable contra UTC:
 *  - Si ya trae zona (Z/offset), se usa tal cual.
 *  - Si es "hora local naive" (p. ej. del datetime-local del panel),
 *    se interpreta como hora CDMX y se convierte a UTC sumando 6h.
 */
function scheduledForToUTC(value: string): string {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value
  return new Date(new Date(value).getTime() + CDMX_OFFSET_MS).toISOString()
}

export interface CampaignRunResult {
  campaignId: string
  sent: number
  failed: number
  skipped: number
  /** Omitidos porque la plataforma ya contactó a esa persona hoy (Fase 9). */
  skippedByPlatform?: number
}

// Mensajes por defecto cuando la automatización no define uno.
const DEFAULT_MESSAGES: Record<FoodosAutomation["type"], string> = {
  order_confirmation:
    "¡Gracias por tu pedido en {restaurante}! Lo estamos preparando. 🧑‍🍳",
  thank_you:
    "¡Gracias por tu preferencia, {nombre}! Te esperamos pronto en {restaurante}. 🙌",
  winback:
    "{nombre}, ¡te extrañamos en {restaurante}! Vuelve a pedir en {link} 💛",
  season_promo:
    "¡Promo de temporada en {restaurante}! Pide en {link} 🎉",
  off_hours:
    "Antojo de {restaurante}? Pide ahora sin filas en {link} 😋",
  new_product:
    "¡Nuevo platillo en {restaurante}! Descúbrelo en {link} ✨",
  birthday:
    "¡Feliz cumpleaños, {nombre}! 🎂 Todo el equipo de {restaurante} te desea un gran día. Consiéntete hoy: {link}",
  abandoned_cart:
    "{nombre}, tu pedido de {restaurante} se quedó a medias 😅 ¿Lo terminamos? {link}",
  review_request:
    "¡Gracias por tu pedido, {nombre}! ¿Nos regalas una reseña de {restaurante}? Nos toma 30 segundos: {link}",
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://resurte.me"
  )
}

export function renderMessage(
  template: string,
  ctx: {
    customer: FoodosCustomer
    restaurant: FoodosRestaurant
    automation: FoodosAutomation
  }
): string {
  const { customer, restaurant, automation } = ctx
  const link = `${siteOrigin()}/r/${restaurant.slug}`
  return template
    .replaceAll("{nombre}", customer.name?.trim() || "amig@")
    .replaceAll("{restaurante}", restaurant.name)
    .replaceAll("{link}", link)
    .replaceAll(
      "{descuento}",
      automation.incentive_config?.discount_pct
        ? `${automation.incentive_config.discount_pct}%`
        : ""
    )
    .replaceAll("{codigo}", automation.incentive_config?.promo_code ?? "")
}

// ------------------------------------------------------------
// Selección de clientes objetivo según el tipo de automatización.
// Los filtros se empujan a la BD para no cargar toda la base.
// ------------------------------------------------------------

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export interface TargetOptions {
  /** Zona del restaurante; determina "hoy" para cumpleaños. */
  timezone?: string | null
  now?: Date
}

async function customersByIds(
  supabase: ServiceClient,
  restaurantId: string,
  ids: readonly string[]
): Promise<FoodosCustomer[]> {
  if (ids.length === 0) return []
  const { data } = await supabase
    .from("foodos_customers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .in("id", [...ids])
  return (data as FoodosCustomer[]) ?? []
}

/**
 * Cumpleaños de hoy: no se puede expresar `EXTRACT(MONTH FROM birthday)`
 * con el query builder, así que se traen solo los que tienen fecha y se
 * filtra en JS con el mes/día local del restaurante.
 */
async function fetchBirthdayTargets(
  supabase: ServiceClient,
  restaurantId: string,
  opts: TargetOptions
): Promise<FoodosCustomer[]> {
  const { data } = await supabase
    .from("foodos_customers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .not("birthday", "is", null)
  const parts = localDateParts(opts.timezone, opts.now)
  return ((data as FoodosCustomer[]) ?? []).filter((c) =>
    isBirthdayToday(c.birthday, parts)
  )
}

/**
 * Carrito abandonado: un pedido creado que sigue sin pagarse ES un
 * checkout iniciado y no terminado. No hace falta instrumentar el
 * storefront ni añadir tablas de carrito.
 */
async function fetchAbandonedCartTargets(
  supabase: ServiceClient,
  automation: FoodosAutomation,
  restaurantId: string,
  opts: TargetOptions
): Promise<FoodosCustomer[]> {
  const now = opts.now ?? new Date()
  const cfg = automation.trigger_config ?? {}
  const hoursAfter = Number(cfg.hours_after) || 2
  const maxAgeDays = 7
  const since = new Date(now.getTime() - maxAgeDays * 86_400_000).toISOString()

  const { data: orders } = await supabase
    .from("foodos_orders")
    .select("customer_id, created_at, total")
    .eq("restaurant_id", restaurantId)
    .eq("payment_status", "pending")
    .neq("status", "cancelled")
    .not("customer_id", "is", null)
    .gte("created_at", since)

  const rows = (orders ?? []) as {
    customer_id: string
    created_at: string
    total: number
  }[]
  const ids = [...new Set(rows.map((o) => o.customer_id))]
  const customers = await customersByIds(supabase, restaurantId, ids)

  const candidates = filterAbandonedCarts(rows, customers, {
    hoursAfter,
    maxAgeDays,
    now,
  })
  const keep = new Set(candidates.map((c) => c.customer_id))
  return customers.filter((c) => keep.has(c.id))
}

/**
 * Petición de reseña: pedidos entregados hace poco que todavía no tienen
 * reseña. Se excluye a quien ya reseñó para no pedir dos veces.
 */
async function fetchReviewRequestTargets(
  supabase: ServiceClient,
  automation: FoodosAutomation,
  restaurantId: string,
  opts: TargetOptions
): Promise<FoodosCustomer[]> {
  const now = opts.now ?? new Date()
  const hoursAfter = Number(automation.trigger_config?.hours_after) || 24
  const since = new Date(now.getTime() - hoursAfter * 3_600_000).toISOString()

  const { data: orders } = await supabase
    .from("foodos_orders")
    .select("id, customer_id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "delivered")
    .not("customer_id", "is", null)
    .gte("created_at", since)

  const rows = (orders ?? []) as { id: string; customer_id: string }[]
  if (rows.length === 0) return []

  const { data: reviews } = await supabase
    .from("foodos_reviews")
    .select("order_id")
    .eq("restaurant_id", restaurantId)
    .in("order_id", rows.map((o) => o.id))
  const reviewed = new Set(
    ((reviews ?? []) as { order_id: string | null }[])
      .map((r) => r.order_id)
      .filter((id): id is string => !!id)
  )

  const ids = [
    ...new Set(rows.filter((o) => !reviewed.has(o.id)).map((o) => o.customer_id)),
  ]
  return customersByIds(supabase, restaurantId, ids)
}

export async function fetchTargetCustomers(
  supabase: ServiceClient,
  automation: FoodosAutomation,
  restaurantId: string,
  opts: TargetOptions = {}
): Promise<FoodosCustomer[]> {
  const cfg = automation.trigger_config ?? {}

  // La audiencia RFM manda sobre el segmento simple: si el dueño eligió
  // "en riesgo", no queremos que un `target_segment` viejo lo sobreescriba.
  if (automation.audience && isAudienceKey(automation.audience)) {
    const { data } = await supabase
      .from("foodos_customers")
      .select("*")
      .eq("restaurant_id", restaurantId)
    const all = (data as FoodosCustomer[]) ?? []
    return audienceMembers(all, automation.audience, opts.now)
  }

  if (automation.type === "birthday") {
    return fetchBirthdayTargets(supabase, restaurantId, opts)
  }
  if (automation.type === "abandoned_cart") {
    return fetchAbandonedCartTargets(supabase, automation, restaurantId, opts)
  }
  if (automation.type === "review_request") {
    return fetchReviewRequestTargets(supabase, automation, restaurantId, opts)
  }

  let query = supabase
    .from("foodos_customers")
    .select("*")
    .eq("restaurant_id", restaurantId)

  if (automation.type === "winback") {
    const days = Number(cfg.days_without_order) || 30
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
    query = query.not("last_order_at", "is", null).lt("last_order_at", cutoff)
  } else if (cfg.target_segment) {
    // Filtro en SQL por la columna `segment`, mantenida por el trigger
    // `trg_foodos_order_customer`. Nota: puede quedar desactualizada con
    // el tiempo; si hace falta precisión, re-evaluar con `segmentCustomer`.
    query = query.eq("segment", cfg.target_segment)
  }

  const { data } = await query
  return (data as FoodosCustomer[]) ?? []
}

/**
 * Audiencia efectiva de una automatización, para auditar por qué se envió.
 * Se guarda en `foodos_campaigns.audience` para poder reproducir un envío
 * aunque después se cambie la configuración de la automatización.
 */
export function effectiveAudience(
  automation: FoodosAutomation
): string | null {
  if (automation.audience && isAudienceKey(automation.audience)) {
    return automation.audience
  }
  const segment = automation.trigger_config?.target_segment
  return segment ? (SEGMENT_TO_AUDIENCE[segment] ?? null) : null
}

// ------------------------------------------------------------
// Ejecución de una campaña
// ------------------------------------------------------------

/**
 * Ejecuta una campaña programada: expande un envío por cliente
 * objetivo y marca la campaña padre como enviada.
 *
 * Si la campaña ya trae `customer_id`, es un envío individual
 * (campaña hija) y solo se procesa ese cliente.
 */
export async function runFoodosCampaign(
  campaignId: string
): Promise<CampaignRunResult> {
  const supabase = await createServiceClient()
  // Un solo reloj para toda la corrida: si se recalculara por cliente, una
  // campaña que cruza medianoche podría saltarse a alguien dos veces.
  const runNow = new Date()

  const { data: campaign } = await supabase
    .from("foodos_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle()
  if (!campaign) throw new Error("Campaña no encontrada")
  if (campaign.status !== "scheduled") {
    return { campaignId, sent: 0, failed: 0, skipped: 0, skippedByPlatform: 0 }
  }

  const { data: restaurant } = await supabase
    .from("foodos_restaurants")
    .select("*")
    .eq("id", campaign.restaurant_id)
    .maybeSingle()
  if (!restaurant) throw new Error("Restaurante no encontrado")

  // No enviar WhatsApp de restaurantes que no están activos (draft/paused).
  if (restaurant.status !== "active") {
    await supabase
      .from("foodos_campaigns")
      .update({
        status: "failed",
        error: `Restaurante inactivo (${restaurant.status})`,
      })
      .eq("id", campaignId)
    return { campaignId, sent: 0, failed: 0, skipped: 1, skippedByPlatform: 0 }
  }

  const { data: automation } = campaign.automation_id
    ? await supabase
        .from("foodos_automations")
        .select("*")
        .eq("id", campaign.automation_id)
        .maybeSingle()
    : { data: null }
  if (!automation) {
    await supabase
      .from("foodos_campaigns")
      .update({ status: "failed", error: "Automatización no encontrada" })
      .eq("id", campaignId)
    return { campaignId, sent: 0, failed: 0, skipped: 1, skippedByPlatform: 0 }
  }
  // Automatizaciones inactivas no deben enviar.
  if (!automation.is_active) {
    await supabase
      .from("foodos_campaigns")
      .update({ status: "failed", error: "Automatización inactiva" })
      .eq("id", campaignId)
    return { campaignId, sent: 0, failed: 0, skipped: 1, skippedByPlatform: 0 }
  }

  const auto = automation as FoodosAutomation
  let targets = await fetchTargetCustomers(supabase, auto, campaign.restaurant_id, {
    timezone: (restaurant as FoodosRestaurant).timezone,
  })
  if (campaign.customer_id) {
    targets = targets.filter((c) => c.id === campaign.customer_id)
  }

  // Capacidades resueltas una vez por corrida: descifrar el token por
  // cliente sería un desperdicio y un riesgo de rate limit.
  const caps = await loadMessagingCapabilities(supabase, campaign.restaurant_id)

  // Sin NINGÚN canal posible no se recorre la lista de destinatarios: antes
  // cada uno se contaba como "omitido" y la campaña sólo terminaba con un
  // "Sin canal disponible" genérico, sin decir qué faltaba conectar. Es un
  // problema de configuración, no un fallo por destinatario, y así se reporta.
  if (!caps.whatsapp && !caps.sms) {
    const error = caps.waConfig === null && !isIntegrationConfigured("whatsapp")
      ? "WhatsApp no está conectado. Conéctalo en FoodOS → WhatsApp para que tus automatizaciones puedan enviarse."
      : "No hay ningún canal de envío disponible (WhatsApp ni SMS)."
    await supabase
      .from("foodos_campaigns")
      .update({ status: "failed", error })
      .eq("id", campaignId)
    logger.warn("foodos-campaigns.no-channel", {
      campaignId,
      restaurantId: campaign.restaurant_id,
      preferred: auto.channel ?? "whatsapp",
    })
    return { campaignId, sent: 0, failed: 0, skipped: 1, skippedByPlatform: 0 }
  }

  // Guardia entre motores (Fase 9): los envíos que la plataforma ya hizo hoy de
  // esta misma intención. Se lee una vez, no por cliente.
  const platformSends = await loadPlatformSendsForToday(
    supabase,
    auto.type,
    (restaurant as FoodosRestaurant).timezone,
    runNow
  )

  const preferredChannel = auto.channel ?? "whatsapp"
  const useAbTest = !!auto.ab_test && !!auto.message_b?.trim()
  const audience = effectiveAudience(auto)
  const templateA = auto.message?.trim() || DEFAULT_MESSAGES[auto.type]
  const templateB = auto.message_b?.trim() || templateA

  const isParent = !campaign.customer_id
  let sent = 0
  let failed = 0
  let skipped = 0
  let skippedByPlatform = 0
  const childRows: {
    restaurant_id: string
    automation_id: string | null
    customer_id: string
    scheduled_for: string | null
    status: FoodosCampaignStatus
    error: string | null
    sent_at: string | null
    channel: string
    variant: string | null
    audience: string | null
    provider: string | null
  }[] = []

  for (const customer of targets) {
    const phone = normalizePhone(customer.phone)
    if (!phone) {
      skipped++
      continue
    }

    // No repetir el mensaje que la plataforma ya mandó hoy a esta persona.
    // Es el único punto donde los dos motores comparten estado.
    if (
      alreadySentByPlatform({
        sends: platformSends,
        restaurantType: auto.type,
        recipient: phone,
        timezone: (restaurant as FoodosRestaurant).timezone,
        now: runNow,
      })
    ) {
      skipped++
      skippedByPlatform++
      continue
    }

    const variant = pickVariant(customer.id, useAbTest)
    const template = variant === "b" ? templateB : templateA
    const message = renderMessage(template, {
      customer,
      restaurant: restaurant as FoodosRestaurant,
      automation: auto,
    })

    const result = await sendMarketingMessage({
      caps,
      to: phone,
      text: message,
      preferred: preferredChannel,
      smsOptIn: !!customer.sms_opt_in,
    })

    let status: FoodosCampaign["status"] = "sent"
    let error: string | null = null
    if (result.ok) {
      sent++
    } else if (result.channel === null) {
      // Sin canal disponible no es un fallo del proveedor: se cuenta como
      // omitido para no ensuciar la tasa de error de la campaña.
      skipped++
      continue
    } else {
      status = "failed"
      error = result.error
      failed++
    }

    if (isParent) {
      // Un registro hijo por cliente: historial auditable por destinatario.
      // Se acumulan y se insertan en un solo round-trip al final.
      childRows.push({
        restaurant_id: campaign.restaurant_id,
        automation_id: campaign.automation_id,
        customer_id: customer.id,
        scheduled_for: campaign.scheduled_for,
        status,
        error,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        channel: result.channel ?? preferredChannel,
        variant,
        audience,
        provider: result.provider,
      })
    } else {
      await supabase
        .from("foodos_campaigns")
        .update({
          status,
          error,
          sent_at: status === "sent" ? new Date().toISOString() : null,
          variant,
          audience,
          provider: result.provider,
          channel: result.channel ?? preferredChannel,
        })
        .eq("id", campaignId)
    }
  }

  if (isParent && childRows.length > 0) {
    await supabase.from("foodos_campaigns").insert(childRows)
  }

  if (isParent) {
    const noRecipients = sent === 0 && failed === 0
    await supabase
      .from("foodos_campaigns")
      .update({
        // Sin destinatarios no es un envío exitoso: se marca fallida
        status: noRecipients || (failed > 0 && sent === 0) ? "failed" : "sent",
        error: noRecipients
          ? skippedByPlatform > 0 && skippedByPlatform === skipped
            ? "La plataforma ya contactó a estos clientes hoy"
            : skipped > 0
              ? "Sin canal disponible para los clientes objetivo"
              : "Sin clientes objetivo para esta automatización"
          : failed > 0
            ? `${failed} envío(s) fallidos de ${sent + failed}`
            : null,
        sent_at: new Date().toISOString(),
        audience,
      })
      .eq("id", campaignId)
  }

  return { campaignId, sent, failed, skipped, skippedByPlatform }
}

/**
 * Envíos de la plataforma de la misma intención en las últimas 48 h.
 *
 * La ventana es de 48 h y no de "hoy" para que el filtro de día local lo haga
 * `alreadySentByPlatform`, que conoce la zona del restaurante. Pedirle a
 * Postgres el día local obligaría a codificar el offset en la consulta.
 *
 * Nunca lanza: si la tabla no responde, el dedupe entre motores se degrada a
 * "sin datos" en vez de impedir que la campaña salga.
 */
async function loadPlatformSendsForToday(
  supabase: ServiceClient,
  restaurantType: string,
  timezone: string | null | undefined,
  now: Date
): Promise<PlatformSend[]> {
  const platformType = platformTypeForRestaurantType(restaurantType)
  if (!platformType) return []

  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
  try {
    const { data, error } = await supabase
      .from("whatsapp_automation_sends")
      .select("automation_type, recipient, created_at")
      .eq("automation_type", platformType)
      .gte("created_at", since)
    if (error) {
      logger.warn("No se pudo leer el dedupe entre motores", {
        error: error.message,
        platformType,
        timezone: timezone ?? null,
      })
      return []
    }
    return (data ?? []) as PlatformSend[]
  } catch (err) {
    logger.warn("Dedupe entre motores inalcanzable", {
      error: err instanceof Error ? err.message : String(err),
      platformType,
    })
    return []
  }
}

/**
 * Procesa el lote de campañas vencidas (lo usa el cron diario).
 */
export async function runDueFoodosCampaigns(
  limit = 25
): Promise<{ processed: number; results: CampaignRunResult[] }> {
  const supabase = await createServiceClient()
  // Trae las programadas y filtra vencimiento en JS: `scheduled_for`
  // puede venir como hora naive CDMX y normalizarla no es expresable
  // en el filtro SQL.
  const { data: scheduled } = await supabase
    .from("foodos_campaigns")
    .select("id, scheduled_for")
    .eq("status", "scheduled")
    .order("created_at")
    .limit(200)

  const now = Date.now()
  const due = (scheduled ?? []).filter((c) => {
    if (!c.scheduled_for) return true
    return new Date(scheduledForToUTC(c.scheduled_for)).getTime() <= now
  })
  const batch = due.slice(0, limit)

  const results: CampaignRunResult[] = []
  for (const row of batch) {
    try {
      results.push(await runFoodosCampaign(row.id))
    } catch (err) {
      results.push({
        campaignId: row.id,
        sent: 0,
        failed: 0,
        skipped: 1,
      })
      logger.error(
        `[FOODOS-CAMPAIGN] ${row.id}:`,
        err instanceof Error ? err.message : err
      )
    }
  }
  return { processed: results.length, results }
}
