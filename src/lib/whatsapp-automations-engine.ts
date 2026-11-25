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
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { isMissingRelationError } from "@/lib/sale-window"

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
  // Flujos por condición (Ola 6): las reglas viven en config.rules
  // y las evalúa runConditionalFlows contra cada pedido nuevo.
  // Nace APAGADO y sin reglas: nada se envía hasta que el panel
  // lo encienda y agregue reglas. Requiere la migración 00235
  // (el valor del ENUM); sin ella la fila ni siquiera se puede
  // guardar y este default inactivo es el comportamiento.
  conditional_flows: {
    is_active: false,
    trigger_delay_hours: 0,
    config: { rules: [] },
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
  // Bucket mensual del restaurante (no UTC): con UTC el mes cambiaba a las
  // 18:00 locales del último día, adelantando el reinicio del tope.
  const monthBucket = dayKeyOf(DEFAULT_TIMEZONE).slice(0, 7)

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

// ============================================================
// Flujos automáticos por condición (Ola 6)
// ============================================================
// Un tipo de automatización más del motor (no un motor nuevo):
// la fila `conditional_flows` de whatsapp_automations guarda en
// su config un arreglo de REGLAS. El cron diario evalúa cada
// regla contra los pedidos creados en las últimas ~26 h: si la
// condición del cliente/pedido se cumple, sale la plantilla
// elegida (o el texto, dentro de ventana) por el mismo
// sendAutomationWhatsApp de siempre, con dedupe por
// (regla, pedido): un evento jamás dispara dos veces la misma
// regla, aunque el cron corra de nuevo.
//
// Condiciones disponibles (evaluables con datos que ya existen):
// - first_order:        es el primer pedido del cliente.
// - order_count_gte:    el cliente lleva >= threshold pedidos.
// - order_total_gte:    el pedido suma >= threshold MXN.
// - active_recurrence:  el cliente tiene una recurrencia activa
//                       (Ola 5; sin la 00234, siempre falso).

export type ConditionalFlowCondition =
  | "first_order"
  | "order_count_gte"
  | "order_total_gte"
  | "active_recurrence"

export const CONDITIONAL_FLOW_CONDITIONS: readonly ConditionalFlowCondition[] = [
  "first_order",
  "order_count_gte",
  "order_total_gte",
  "active_recurrence",
]

/** ¿La condición necesita el umbral numérico (threshold)? */
export function conditionalFlowNeedsThreshold(
  condition: ConditionalFlowCondition
): boolean {
  return condition === "order_count_gte" || condition === "order_total_gte"
}

export interface ConditionalFlowRule {
  id: string
  name: string
  condition: ConditionalFlowCondition
  /** Umbral de las condiciones *_gte; null en las demás. */
  threshold: number | null
  /** Plantilla aprobada a enviar; vacío = solo texto. */
  template_name: string
  /** Texto libre (fallback si la plantilla falla, o el mensaje si no hay plantilla). */
  text: string
  is_active: boolean
}

/**
 * Lee y valida las reglas desde el config JSONB (puro). Una
 * regla sin condición válida o sin nada que enviar (ni
 * plantilla ni texto) se descarta: mejor una regla de menos
 * que un envío vacío.
 */
export function parseConditionalFlowRules(
  config: Record<string, unknown> | null | undefined
): ConditionalFlowRule[] {
  const raw = config?.rules
  if (!Array.isArray(raw)) return []
  const rules: ConditionalFlowRule[] = []
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return
    const r = item as Record<string, unknown>
    const condition = r.condition as ConditionalFlowCondition
    if (!CONDITIONAL_FLOW_CONDITIONS.includes(condition)) return
    const templateName = typeof r.template_name === "string" ? r.template_name.trim() : ""
    const text = typeof r.text === "string" ? r.text.trim() : ""
    if (!templateName && !text) return
    const thresholdRaw = Number(r.threshold)
    rules.push({
      id: typeof r.id === "string" && r.id ? r.id : `rule-${index + 1}`,
      name: typeof r.name === "string" && r.name ? r.name : `Regla ${index + 1}`,
      condition,
      threshold:
        conditionalFlowNeedsThreshold(condition) && Number.isFinite(thresholdRaw)
          ? thresholdRaw
          : null,
      template_name: templateName,
      text,
      is_active: r.is_active !== false,
    })
  })
  return rules
}

/** Hechos del cliente/pedido contra los que se evalúa una regla. */
export interface ConditionalFlowFacts {
  /** Pedidos del cliente (sin cancelados) hasta este pedido, inclusive. */
  orderCount: number
  /** Total de ESTE pedido. */
  orderTotal: number
  /** ¿Tiene una recurrencia activa en recurring_orders? */
  hasActiveRecurrence: boolean
}

/** ¿Se cumple la condición con estos hechos? (puro) */
export function evaluateFlowCondition(
  rule: Pick<ConditionalFlowRule, "condition" | "threshold">,
  facts: ConditionalFlowFacts
): boolean {
  switch (rule.condition) {
    case "first_order":
      return facts.orderCount === 1
    case "order_count_gte":
      return rule.threshold != null && facts.orderCount >= rule.threshold
    case "order_total_gte":
      return rule.threshold != null && facts.orderTotal >= rule.threshold
    case "active_recurrence":
      return facts.hasActiveRecurrence
  }
}

/**
 * Sustituye los marcadores del texto de la regla (puro):
 * {nombre} (primer nombre), {pedido} (#id) y {total} ($ MXN).
 */
export function renderFlowText(
  text: string,
  facts: { customerName: string | null; orderId: number; orderTotal: number }
): string {
  const firstName = (facts.customerName ?? "").trim().split(/\s+/)[0] ?? ""
  return text
    .replaceAll("{nombre}", firstName)
    .replaceAll("{pedido}", `#${facts.orderId}`)
    .replaceAll("{total}", `$${facts.orderTotal.toFixed(2)} MXN`)
    .replace(/\s{2,}/g, " ")
    .trim()
}

/** Resuelve el id de una plantilla por nombre, solo si está aprobada. */
async function resolveApprovedTemplateId(
  supabase: SupabaseClient,
  templateName: string
): Promise<number | null> {
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("id")
    .eq("template_name", templateName)
    .eq("status", "approved")
    .maybeSingle()
  return (data?.id as number) ?? null
}

/** Usuarios con recurrencia activa (Ola 5); sin la 00234, nadie. */
async function fetchActiveRecurrenceUserIds(
  supabase: SupabaseClient,
  userIds: readonly string[]
): Promise<Set<string>> {
  const active = new Set<string>()
  if (userIds.length === 0) return active
  try {
    const { data, error } = await supabase
      .from("recurring_orders")
      .select("user_id")
      .eq("status", "active")
      .in("user_id", [...userIds])
    if (error) {
      if (!isMissingRelationError(error)) {
        logger.warn("Flujos por condición: no se pudo leer recurring_orders", {
          error: error.message,
        })
      }
      return active
    }
    for (const row of data ?? []) {
      if (row.user_id) active.add(row.user_id as string)
    }
    return active
  } catch {
    return active
  }
}

async function runConditionalFlows(
  supabase: SupabaseClient,
  cfg: WaAutomationConfig,
  restaurantSends: readonly RestaurantSend[] = []
): Promise<AutomationSendResult> {
  const result = emptyResult(true)
  const rules = parseConditionalFlowRules(cfg.config).filter((r) => r.is_active)
  if (rules.length === 0) return result

  // Eventos: pedidos creados en las últimas ~26 h (el cron es
  // diario; el dedupe por (regla, pedido) absorbe el traslape).
  const since = new Date(Date.now() - 26 * 3_600_000).toISOString()
  const { data: recentOrders, error } = await supabase
    .from("orders")
    .select("id, user_id, customer_phone, customer_name, total, created_at")
    .gte("created_at", since)
    .neq("status", "cancelled")
    .not("customer_phone", "is", null)
    .order("created_at", { ascending: true })
    .limit(200)
  if (error) {
    result.errors.push(error.message)
    return result
  }
  const orders = (recentOrders ?? []) as Array<{
    id: number
    user_id: string | null
    customer_phone: string
    customer_name: string | null
    total: number
    created_at: string
  }>
  if (orders.length === 0) return result

  // Conteo de pedidos por cliente hasta cada evento: una sola
  // lectura del historial de los usuarios involucrados.
  const userIds = [...new Set(orders.map((o) => o.user_id).filter((u): u is string => Boolean(u)))]
  const historyByUser = new Map<string, Array<{ id: number; created_at: string }>>()
  if (userIds.length > 0) {
    const { data: history } = await supabase
      .from("orders")
      .select("id, user_id, created_at")
      .in("user_id", userIds)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true })
      .limit(5000)
    for (const row of (history ?? []) as Array<{ id: number; user_id: string; created_at: string }>) {
      const list = historyByUser.get(row.user_id) ?? []
      list.push({ id: row.id, created_at: row.created_at })
      historyByUser.set(row.user_id, list)
    }
  }

  const [activeRecurrenceUsers, profilesRes] = await Promise.all([
    fetchActiveRecurrenceUserIds(supabase, userIds),
    userIds.length > 0
      ? supabase.from("profiles").select("id, marketing_consent").in("id", userIds)
      : Promise.resolve({ data: [] as Array<{ id: string; marketing_consent: boolean | null }> }),
  ])
  const consentByUser = new Map<string, boolean>()
  for (const p of (profilesRes.data ?? []) as Array<{ id: string; marketing_consent: boolean | null }>) {
    consentByUser.set(p.id, p.marketing_consent !== false)
  }

  // La plantilla de cada regla se resuelve una vez por corrida.
  const templateIdByRule = new Map<string, number | null>()
  for (const rule of rules) {
    templateIdByRule.set(
      rule.id,
      rule.template_name ? await resolveApprovedTemplateId(supabase, rule.template_name) : null
    )
  }

  for (const order of orders) {
    const history = order.user_id ? (historyByUser.get(order.user_id) ?? []) : []
    const orderCount = history.filter(
      (h) => h.created_at < order.created_at || (h.created_at === order.created_at && h.id <= order.id)
    ).length
    const facts: ConditionalFlowFacts = {
      orderCount: Math.max(orderCount, order.user_id ? 1 : 0),
      orderTotal: Number(order.total) || 0,
      hasActiveRecurrence: order.user_id ? activeRecurrenceUsers.has(order.user_id) : false,
    }
    // Sin consentimiento de marketing no hay flujos promocionales
    // (la misma guarda de reactivación y cumpleaños).
    if (order.user_id && consentByUser.get(order.user_id) === false) continue

    for (const rule of rules) {
      if (!evaluateFlowCondition(rule, facts)) continue
      if (rule.template_name && templateIdByRule.get(rule.id) == null) {
        // La plantilla dejó de estar aprobada: no se manda texto
        // libre en su lugar fuera de ventana; se anota y se salta.
        result.skipped++
        if (!result.errors.includes(`template_not_approved:${rule.template_name}`)) {
          result.errors.push(`template_not_approved:${rule.template_name}`)
        }
        continue
      }
      const text =
        renderFlowText(rule.text, {
          customerName: order.customer_name,
          orderId: order.id,
          orderTotal: facts.orderTotal,
        }) ||
        `Hola, te escribimos de Resurte.me por tu pedido #${order.id}. ¡Gracias por surtirte con nosotros!`
      const sendStatus = await sendAutomationWhatsApp(supabase, {
        restaurantSends,
        type: "conditional_flows",
        recipient: order.customer_phone,
        dedupeKey: `conditional_flows:${rule.id}:order:${order.id}`,
        text,
        userId: order.user_id,
        orderId: order.id,
        templateId: templateIdByRule.get(rule.id) ?? null,
      })
      if (sendStatus === "sent") result.sent++
      else if (sendStatus === "skipped") result.skipped++
      else result.failed++
    }
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
  conditional_flows: runConditionalFlows,
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
