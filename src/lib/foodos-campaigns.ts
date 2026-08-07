// ============================================================
// Motor de ejecución de campañas FoodOS (solo servidor).
//
// Convierte una campaña "scheduled" en envíos reales por
// WhatsApp: selecciona los clientes objetivo de la
// automatización, renderiza el mensaje con placeholders y
// registra cada envío como una campaña hija (sent | failed).
//
// Lo usan:
//  - /api/foodos/campaigns/run (cron diario de Vercel)
//  - El botón "Ejecutar campaña" del panel (server action)
// ============================================================

import { createServiceClient } from "@/lib/supabase/service"
import { normalizePhone } from "@/lib/foodos"
import { sendTextMessage } from "@/lib/whatsapp"
import type {
  FoodosAutomation,
  FoodosCampaign,
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

export async function fetchTargetCustomers(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  automation: FoodosAutomation,
  restaurantId: string
): Promise<FoodosCustomer[]> {
  const cfg = automation.trigger_config ?? {}

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

  const { data: campaign } = await supabase
    .from("foodos_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle()
  if (!campaign) throw new Error("Campaña no encontrada")
  if (campaign.status !== "scheduled") {
    return { campaignId, sent: 0, failed: 0, skipped: 0 }
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
    return { campaignId, sent: 0, failed: 0, skipped: 1 }
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
    return { campaignId, sent: 0, failed: 0, skipped: 1 }
  }
  // Automatizaciones inactivas no deben enviar.
  if (!automation.is_active) {
    await supabase
      .from("foodos_campaigns")
      .update({ status: "failed", error: "Automatización inactiva" })
      .eq("id", campaignId)
    return { campaignId, sent: 0, failed: 0, skipped: 1 }
  }

  let targets = await fetchTargetCustomers(
    supabase,
    automation as FoodosAutomation,
    campaign.restaurant_id
  )
  if (campaign.customer_id) {
    targets = targets.filter((c) => c.id === campaign.customer_id)
  }

  const isParent = !campaign.customer_id
  let sent = 0
  let failed = 0
  let skipped = 0
  const childRows: Record<string, unknown>[] = []

  for (const customer of targets) {
    const phone = normalizePhone(customer.phone)
    if (!phone) {
      skipped++
      continue
    }

    const message = renderMessage(
      automation.message?.trim() ||
        DEFAULT_MESSAGES[automation.type as FoodosAutomation["type"]],
      {
        customer,
        restaurant: restaurant as FoodosRestaurant,
        automation: automation as FoodosAutomation,
      }
    )

    let status: FoodosCampaign["status"] = "sent"
    let error: string | null = null
    try {
      await sendTextMessage({ to: phone, text: message })
      sent++
    } catch (err) {
      status = "failed"
      error = err instanceof Error ? err.message : "Error desconocido"
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
        channel: campaign.channel ?? "whatsapp",
      })
    } else {
      await supabase
        .from("foodos_campaigns")
        .update({
          status,
          error,
          sent_at: status === "sent" ? new Date().toISOString() : null,
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
          ? "Sin clientes objetivo para esta automatización"
          : failed > 0
            ? `${failed} envío(s) fallidos de ${sent + failed}`
            : null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaignId)
  }

  return { campaignId, sent, failed, skipped }
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
      console.error(
        `[FOODOS-CAMPAIGN] ${row.id}:`,
        err instanceof Error ? err.message : err
      )
    }
  }
  return { processed: results.length, results }
}
