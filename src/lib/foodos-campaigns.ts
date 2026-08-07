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
import { segmentCustomer, normalizePhone } from "@/lib/foodos"
import { sendTextMessage } from "@/lib/whatsapp"
import type {
  FoodosAutomation,
  FoodosCampaign,
  FoodosCustomer,
  FoodosRestaurant,
} from "@/types/foodos"

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

function renderMessage(
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
// Selección de clientes objetivo según el tipo de automatización
// ------------------------------------------------------------

function targetCustomers(
  automation: FoodosAutomation,
  customers: FoodosCustomer[]
): FoodosCustomer[] {
  const cfg = automation.trigger_config ?? {}
  const segment = cfg.target_segment

  if (automation.type === "winback") {
    const days = Number(cfg.days_without_order) || 30
    const cutoff = Date.now() - days * 86_400_000
    return customers.filter((c) => {
      if (!c.last_order_at) return false
      return new Date(c.last_order_at).getTime() < cutoff
    })
  }

  if (segment) {
    return customers.filter((c) => segmentCustomer(c) === segment)
  }

  return customers
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

  const { data: allCustomers } = await supabase
    .from("foodos_customers")
    .select("*")
    .eq("restaurant_id", campaign.restaurant_id)

  let targets = targetCustomers(
    automation as FoodosAutomation,
    (allCustomers as FoodosCustomer[]) ?? []
  )
  if (campaign.customer_id) {
    targets = targets.filter((c) => c.id === campaign.customer_id)
  }

  const isParent = !campaign.customer_id
  let sent = 0
  let failed = 0
  let skipped = 0

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
      await supabase.from("foodos_campaigns").insert({
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

  if (isParent) {
    await supabase
      .from("foodos_campaigns")
      .update({
        status: failed > 0 && sent === 0 ? "failed" : "sent",
        error:
          failed > 0 ? `${failed} envío(s) fallidos de ${sent + failed}` : null,
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
  const { data: due } = await supabase
    .from("foodos_campaigns")
    .select("id")
    .eq("status", "scheduled")
    .or(`scheduled_for.is.null,scheduled_for.lte.${new Date().toISOString()}`)
    .order("created_at")
    .limit(limit)

  const results: CampaignRunResult[] = []
  for (const row of due ?? []) {
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
