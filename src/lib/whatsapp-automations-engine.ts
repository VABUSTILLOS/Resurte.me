// ============================================================
// Motor de automatizaciones WhatsApp (WC1–WC3).
// La config se persiste en whatsapp_automations (admin); este
// módulo es quien la LEE y la RESPETA al disparar envíos.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { createServiceClient } from "@/lib/supabase/service"
import { sendTemplate, sendTextMessage } from "@/lib/whatsapp"
import {
  alreadySentByRestaurant,
  type RestaurantSend,
} from "@/lib/messaging/dedupe"
import { DEFAULT_TIMEZONE } from "@/lib/local-date"

export interface WaAutomationConfig {
  is_active: boolean
  trigger_delay_hours: number
  config: Record<string, unknown>
  template_id: number | null
}

/** Defaults si la fila no existe o la tabla no responde (no romper crons). */
export const AUTOMATION_DEFAULTS: Record<string, WaAutomationConfig> = {
  payment_recovery: {
    is_active: true,
    trigger_delay_hours: 1,
    config: { levels: [1, 24, 48] },
    template_id: null,
  },
  cart_abandonment: {
    is_active: true,
    trigger_delay_hours: 2,
    config: {},
    template_id: null,
  },
  birthday: {
    is_active: false,
    trigger_delay_hours: 0,
    config: { discount_percent: 15, coupon_code: "CUMPLE15", send_at_hour: 10 },
    template_id: null,
  },
  reactivation: {
    is_active: false,
    trigger_delay_hours: 720,
    config: { inactive_days: 30, discount_amount: 50, coupon_code: "TEAMO50" },
    template_id: null,
  },
  post_delivery_rating: {
    is_active: true,
    trigger_delay_hours: 24,
    config: { rating_link: "https://resurte.me/calificar" },
    template_id: null,
  },
  onboarding: {
    is_active: true,
    trigger_delay_hours: 0,
    config: { discount_percent: 10, coupon_code: "BIENVENIDO10" },
    template_id: null,
  },
}

/**
 * Lee la config persistida de una automatización.
 * null = sin fila (el caller decide si usa defaults).
 */
export async function getAutomationConfig(
  supabase: SupabaseClient,
  type: string
): Promise<WaAutomationConfig | null> {
  try {
    const { data, error } = await supabase
      .from("whatsapp_automations")
      .select("is_active, trigger_delay_hours, config, template_id")
      .eq("automation_type", type)
      .maybeSingle()
    if (error) {
      logger.warn("No se pudo leer whatsapp_automations", { type, error: error.message })
      return null
    }
    if (!data) return null
    return {
      is_active: data.is_active as boolean,
      trigger_delay_hours: (data.trigger_delay_hours as number) ?? 0,
      config: (data.config as Record<string, unknown>) ?? {},
      template_id: (data.template_id as number | null) ?? null,
    }
  } catch (err) {
    logger.warn("getAutomationConfig falló (fallback a defaults)", {
      type,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/** Config efectiva: persistida o defaults (pure). */
export function effectiveAutomationConfig(
  persisted: WaAutomationConfig | null,
  type: string
): WaAutomationConfig {
  return persisted ?? AUTOMATION_DEFAULTS[type] ?? {
    is_active: false,
    trigger_delay_hours: 0,
    config: {},
    template_id: null,
  }
}

/** Niveles de recordatorio de pago (horas), validados (pure). */
export function resolveReminderLevels(cfg: WaAutomationConfig): number[] {
  const levels = cfg.config?.levels
  if (
    Array.isArray(levels) &&
    levels.length > 0 &&
    levels.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
  ) {
    return [...(levels as number[])].sort((a, b) => a - b)
  }
  return [1, 24, 48]
}

/** ¿Toca enviar ahora? Ventana ±0.5 h como el cron horario (pure). */
export function isReminderDue(hoursSinceCreation: number, levels: number[]): boolean {
  return levels.some((level) => Math.abs(hoursSinceCreation - level) <= 0.5)
}

/** Llave de dedupe por cliente + tipo + día (pure). */
export function automationDedupeKey(type: string, recipient: string, day: string): string {
  return `${type}:${recipient}:${day}`
}

// ============================================================
// WC2 — Motor de disparo + WC3 — bitácora/dedupe de envíos
// ============================================================

export interface AutomationSendResult {
  active: boolean
  sent: number
  skipped: number
  failed: number
  errors: string[]
}

const emptyResult = (active: boolean): AutomationSendResult => ({
  active,
  sent: 0,
  skipped: 0,
  failed: 0,
  errors: [],
})

// ---------- Helpers puros: fecha CDMX y textos ----------

export interface CdmxDateParts { year: number; month: number; day: number; hour: number }

/** Fecha/hora actual en America/Mexico_City (pure, testeable). */
export function cdmxDateParts(now: Date = new Date()): CdmxDateParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)])
  )
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour === 24 ? 0 : (parts.hour ?? 0),
  }
}

/** ¿Es el cumpleaños (mes/día) en la fecha CDMX dada? (pure) */
export function isBirthdayToday(birthday: string, parts: CdmxDateParts): boolean {
  const [, month, day] = birthday.split("-").map(Number)
  return month === parts.month && day === parts.day
}

export function buildCartAbandonmentText(p: { total: number }): string {
  return `🛒 Dejaste productos en tu carrito de Resurte.me (total: $${p.total.toFixed(2)} MXN). Completa tu pedido aquí: https://resurte.me/cart`
}

function buildReactivationText(p: { coupon: string; amount: number }): string {
  return `¡Te extrañamos! Vuelve a surtir tu negocio con Resurte.me y usa el cupón ${p.coupon} por $${p.amount} MXN de descuento: https://resurte.me`
}

function buildRatingText(p: { link: string }): string {
  return `Gracias por tu pedido en Resurte.me ⭐ ¿Nos ayudas con tu calificación? ${p.link}`
}

function buildOnboardingText(p: { coupon: string; percent: number }): string {
  return `¡Gracias por tu primer pedido en Resurte.me! En tu siguiente compra usa el cupón ${p.coupon} y obtén ${p.percent}% de descuento: https://resurte.me`
}

export function buildBirthdayText(p: { name: string; coupon: string; percent: number }): string {
  return `🎂 ¡Feliz cumpleaños${p.name ? `, ${p.name}` : ""}! Celebra con ${p.percent}% de descuento en Resurte.me usando el cupón ${p.coupon}: https://resurte.me`
}

// ---------- Envío con dedupe + bitácora ----------

async function resolveTemplateName(
  supabase: SupabaseClient,
  templateId: number | null
): Promise<string | null> {
  if (templateId == null) return null
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("template_name")
    .eq("id", templateId)
    .maybeSingle()
  return (data?.template_name as string) ?? null
}

/**
 * Envía un mensaje de automatización con dedupe (dedupe_key UNIQUE) y
 * bitácora en whatsapp_automation_sends. Plantilla si está asignada;
 * fallback a texto libre (ventana de servicio de 24 h).
 */
async function sendAutomationWhatsApp(
  supabase: SupabaseClient,
  params: {
    type: string
    recipient: string
    dedupeKey: string
    text: string
    userId?: string | null
    orderId?: number | null
    templateId?: number | null
    /** Envíos recientes del motor del restaurante, para el dedupe cruzado. */
    restaurantSends?: readonly RestaurantSend[]
  }
): Promise<"sent" | "skipped" | "failed"> {
  const { type, recipient, dedupeKey, text, userId = null, orderId = null, templateId = null, restaurantSends = [] } = params

  const { count } = await supabase
    .from("whatsapp_automation_sends")
    .select("id", { count: "exact", head: true })
    .eq("dedupe_key", dedupeKey)
  if ((count ?? 0) > 0) return "skipped"

  // Dedupe cruzado: si el restaurante ya le mandó la misma intención hoy, no
  // repetimos el mensaje. Misma zona horaria que usan los crons de la
  // plataforma para que ambos lados cuenten el mismo día.
  if (
    alreadySentByRestaurant({
      sends: restaurantSends,
      platformType: type,
      recipient,
      timezone: DEFAULT_TIMEZONE,
    })
  ) {
    return "skipped"
  }

  let status: "sent" | "failed" = "sent"
  let detail: string | null = null
  try {
    const templateName = await resolveTemplateName(supabase, templateId)
    if (templateName) {
      try {
        const res = await sendTemplate({ to: recipient, templateName })
        detail = res.messages?.[0]?.id ?? null
      } catch (tplErr) {
        logger.warn("Plantilla de automatización falló; fallback a texto", {
          type,
          templateName,
          error: tplErr instanceof Error ? tplErr.message : String(tplErr),
        })
        const res = await sendTextMessage({ to: recipient, text })
        detail = res.messages?.[0]?.id ?? null
      }
    } else {
      const res = await sendTextMessage({ to: recipient, text })
      detail = res.messages?.[0]?.id ?? null
    }
  } catch (err) {
    status = "failed"
    detail = err instanceof Error ? err.message : String(err)
  }

  const { error: insertError } = await supabase.from("whatsapp_automation_sends").insert({
    automation_type: type,
    recipient,
    dedupe_key: dedupeKey,
    user_id: userId,
    order_id: orderId,
    status,
    detail,
  })
  if (insertError) {
    // Conflicto de dedupe en carrera: otro proceso ya lo envió.
    if (insertError.code === "23505") return "skipped"
    logger.warn("No se pudo registrar el envío de automatización", { error: insertError.message })
  }

  return status
}

// ---------- Buscadores de destinatarios ----------

async function runCartAbandonment(
  supabase: SupabaseClient,
  cfg: WaAutomationConfig,
  restaurantSends: readonly RestaurantSend[] = []
): Promise<AutomationSendResult> {
  const result = emptyResult(true)
  const delay = Math.max(1, cfg.trigger_delay_hours || 2)
  const now = Date.now()
  const newest = new Date(now - delay * 3_600_000).toISOString()
  const oldest = new Date(now - (delay + 24) * 3_600_000).toISOString()

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, user_id, customer_phone, total")
    .eq("status", "pending")
    .eq("payment_status", "pending")
    .not("payment_method", "eq", "cash_on_delivery")
    .lte("created_at", newest)
    .gte("created_at", oldest)
    .not("customer_phone", "is", null)
    .limit(200)
  if (error) {
    result.errors.push(error.message)
    return result
  }

  for (const order of orders ?? []) {
    const sendStatus = await sendAutomationWhatsApp(supabase, {
    restaurantSends,
      type: "cart_abandonment",
      recipient: order.customer_phone as string,
      dedupeKey: `cart_abandonment:order:${order.id}`,
      text: buildCartAbandonmentText({ total: Number(order.total) || 0 }),
      userId: order.user_id as string | null,
      orderId: order.id as number,
      templateId: cfg.template_id,
    })
    if (sendStatus === "sent") result.sent++
    else if (sendStatus === "skipped") result.skipped++
    else result.failed++
  }
  return result
}

async function runReactivation(
  supabase: SupabaseClient,
  cfg: WaAutomationConfig,
  restaurantSends: readonly RestaurantSend[] = []
): Promise<AutomationSendResult> {
  const result = emptyResult(true)
  const inactiveDays = Number(cfg.config?.inactive_days) || 30
  const cutoff = new Date(Date.now() - inactiveDays * 86_400_000).toISOString()
  const monthBucket = new Date().toISOString().slice(0, 7)

  // Últimos pedidos entregados (desc); el primero por usuario es su último.
  const { data: orders, error } = await supabase
    .from("orders")
    .select("user_id, created_at")
    .eq("status", "delivered")
    .order("created_at", { ascending: false })
    .limit(1000)
  if (error) {
    result.errors.push(error.message)
    return result
  }

  const lastOrderByUser = new Map<string, string>()
  for (const o of orders ?? []) {
    const uid = o.user_id as string
    if (!lastOrderByUser.has(uid)) lastOrderByUser.set(uid, o.created_at as string)
  }
  const inactiveUserIds = [...lastOrderByUser.entries()]
    .filter(([, lastAt]) => lastAt < cutoff)
    .map(([uid]) => uid)
    .slice(0, 200)
  if (inactiveUserIds.length === 0) return result

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, phone, marketing_consent")
    .in("id", inactiveUserIds)
    .not("phone", "is", null)

  const coupon = String(cfg.config?.coupon_code ?? "TEAMO50")
  const amount = Number(cfg.config?.discount_amount) || 50
  for (const profile of profiles ?? []) {
    if (profile.marketing_consent === false) {
      result.skipped++
      continue
    }
    const phone = profile.phone as string
    const sendStatus = await sendAutomationWhatsApp(supabase, {
    restaurantSends,
      type: "reactivation",
      recipient: phone,
      dedupeKey: `reactivation:${phone}:${monthBucket}`,
      text: buildReactivationText({ coupon, amount }),
      userId: profile.id as string,
      templateId: cfg.template_id,
    })
    if (sendStatus === "sent") result.sent++
    else if (sendStatus === "skipped") result.skipped++
    else result.failed++
  }
  return result
}

async function runPostDeliveryRating(
  supabase: SupabaseClient,
  cfg: WaAutomationConfig,
  restaurantSends: readonly RestaurantSend[] = []
): Promise<AutomationSendResult> {
  const result = emptyResult(true)
  const delay = Math.max(1, cfg.trigger_delay_hours || 24)
  const now = Date.now()
  const newest = new Date(now - delay * 3_600_000).toISOString()
  const oldest = new Date(now - (delay + 24) * 3_600_000).toISOString()

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, user_id, customer_phone")
    .eq("status", "delivered")
    .lte("updated_at", newest)
    .gte("updated_at", oldest)
    .not("customer_phone", "is", null)
    .limit(200)
  if (error) {
    result.errors.push(error.message)
    return result
  }

  const link = String(cfg.config?.rating_link ?? "https://resurte.me/calificar")
  for (const order of orders ?? []) {
    const sendStatus = await sendAutomationWhatsApp(supabase, {
    restaurantSends,
      type: "post_delivery_rating",
      recipient: order.customer_phone as string,
      dedupeKey: `post_delivery_rating:order:${order.id}`,
      text: buildRatingText({ link }),
      userId: order.user_id as string | null,
      orderId: order.id as number,
      templateId: cfg.template_id,
    })
    if (sendStatus === "sent") result.sent++
    else if (sendStatus === "skipped") result.skipped++
    else result.failed++
  }
  return result
}

async function runOnboarding(
  supabase: SupabaseClient,
  cfg: WaAutomationConfig,
  restaurantSends: readonly RestaurantSend[] = []
): Promise<AutomationSendResult> {
  const result = emptyResult(true)
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString()

  // Pedidos entregados recientes; onboarding solo si es el PRIMERO del usuario.
  const { data: recent, error } = await supabase
    .from("orders")
    .select("id, user_id, customer_phone")
    .eq("status", "delivered")
    .gte("created_at", since)
    .not("customer_phone", "is", null)
    .limit(200)
  if (error) {
    result.errors.push(error.message)
    return result
  }

  const coupon = String(cfg.config?.coupon_code ?? "BIENVENIDO10")
  const percent = Number(cfg.config?.discount_percent) || 10
  for (const order of recent ?? []) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", order.user_id as string)
      .eq("status", "delivered")
    if ((count ?? 0) !== 1) continue

    const sendStatus = await sendAutomationWhatsApp(supabase, {
    restaurantSends,
      type: "onboarding",
      recipient: order.customer_phone as string,
      dedupeKey: `onboarding:user:${order.user_id}`,
      text: buildOnboardingText({ coupon, percent }),
      userId: order.user_id as string,
      orderId: order.id as number,
      templateId: cfg.template_id,
    })
    if (sendStatus === "sent") result.sent++
    else if (sendStatus === "skipped") result.skipped++
    else result.failed++
  }
  return result
}

async function runBirthday(
  supabase: SupabaseClient,
  cfg: WaAutomationConfig,
  restaurantSends: readonly RestaurantSend[] = []
): Promise<AutomationSendResult> {
  const result = emptyResult(true)
  const parts = cdmxDateParts()
  const day = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, birthday, marketing_consent")
    .not("birthday", "is", null)
    .not("phone", "is", null)
    .limit(1000)
  if (error) {
    result.errors.push(error.message)
    return result
  }

  const coupon = String(cfg.config?.coupon_code ?? "CUMPLE15")
  const percent = Number(cfg.config?.discount_percent) || 15
  for (const profile of profiles ?? []) {
    if (!isBirthdayToday(profile.birthday as string, parts)) continue
    if (profile.marketing_consent === false) {
      result.skipped++
      continue
    }
    const phone = profile.phone as string
    const sendStatus = await sendAutomationWhatsApp(supabase, {
    restaurantSends,
      type: "birthday",
      recipient: phone,
      dedupeKey: automationDedupeKey("birthday", phone, day),
      text: buildBirthdayText({
        name: String(profile.full_name ?? "").split(" ")[0] ?? "",
        coupon,
        percent,
      }),
      userId: profile.id as string,
      templateId: cfg.template_id,
    })
    if (sendStatus === "sent") result.sent++
    else if (sendStatus === "skipped") result.skipped++
    else result.failed++
  }
  return result
}

// ---------- Runner del cron ----------

const ENGINE_JOBS: Record<
  string,
  (
    supabase: SupabaseClient,
    cfg: WaAutomationConfig,
    restaurantSends: readonly RestaurantSend[]
  ) => Promise<AutomationSendResult>
> = {
  cart_abandonment: runCartAbandonment,
  reactivation: runReactivation,
  post_delivery_rating: runPostDeliveryRating,
  onboarding: runOnboarding,
  birthday: runBirthday,
}

/**
 * Ejecuta las automatizaciones activas respetando la config persistida.
 * Llamado por el cron diario (job "whatsapp-automations").
 */
export async function runWhatsAppAutomations(): Promise<Record<string, AutomationSendResult>> {
  const supabase = await createServiceClient()
  const results: Record<string, AutomationSendResult> = {}
  const restaurantSends = await loadRestaurantSends(supabase, new Date())

  for (const [type, run] of Object.entries(ENGINE_JOBS)) {
    try {
      const cfg = effectiveAutomationConfig(await getAutomationConfig(supabase, type), type)
      if (!cfg.is_active) {
        results[type] = emptyResult(false)
        continue
      }
      results[type] = await run(supabase, cfg, restaurantSends)
    } catch (err) {
      logger.error("runWhatsAppAutomations: falló una automatización", {
        type,
        error: err instanceof Error ? err.message : String(err),
      })
      results[type] = {
        ...emptyResult(true),
        failed: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      }
    }
  }

  return results
}

/**
 * Envíos recientes del motor del restaurante (`foodos_campaigns` en estado
 * `sent`), con el teléfono del cliente resuelto por el embed de PostgREST.
 *
 * Ventana de 48 h: el filtro fino de "mismo día local" lo hace
 * `alreadySentByRestaurant`, que sí conoce la zona del restaurante.
 *
 * Nunca lanza: si la lectura falla, devuelve `[]` y la plataforma sigue
 * enviando (mejor un mensaje de más que un cron caído).
 */
async function loadRestaurantSends(
  supabase: SupabaseClient,
  now: Date
): Promise<RestaurantSend[]> {
  const since = new Date(now.getTime() - 48 * 3_600_000).toISOString()
  try {
    const { data, error } = await supabase
      .from("foodos_campaigns")
      .select("sent_at, foodos_automations(type), foodos_customers(phone)")
      .eq("status", "sent")
      .gte("sent_at", since)
    if (error) {
      logger.warn("No se pudo leer las campañas del restaurante para el dedupe", {
        error: error.message,
      })
      return []
    }
    type Embedded = {
      sent_at: string | null
      foodos_automations: { type: string | null } | null
      foodos_customers: { phone: string | null } | null
    }
    return ((data ?? []) as unknown as Embedded[]).map((row) => ({
      automation_type: row.foodos_automations?.type ?? null,
      recipient: row.foodos_customers?.phone ?? null,
      sent_at: row.sent_at,
    }))
  } catch (err) {
    logger.warn("Excepción leyendo campañas del restaurante para el dedupe", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
