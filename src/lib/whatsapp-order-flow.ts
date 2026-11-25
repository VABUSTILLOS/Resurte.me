// ============================================================
// Flujo conversacional post-pedido de WhatsApp (pago y horario)
// ============================================================
// Cuando un pedido del catálogo ya tiene dirección (la captura de
// whatsapp-orders.ts), la conversación sigue con dos preguntas
// cortas, con respuestas numeradas o por nombre:
//
//   1. ¿Cómo quieres pagar?  → SPEI o efectivo contra entrega.
//      La elección se guarda en `orders.payment_method` (ya no queda
//      el default fijo) y SPEI marca `priority`, derivada por el
//      servidor igual que en el checkout web: nunca la escribe el
//      cliente. Tarjeta NO se ofrece: el pago con tarjeta de la
//      tienda es un formulario con PaymentIntent dentro del sitio,
//      no existe un link de pago reutilizable que mandar por chat.
//   2. ¿Qué día lo quieres? → Hoy/Mañana/pasado mañana, de
//      `getNextDays` (el día LOCAL manda, como en el checkout), con
//      la ventana del día; el resultado se guarda en
//      `orders.scheduled_for` con el mismo formato que arma la web
//      (`${día}T${hora}:00-06:00`).
//
// El estado vive en `orders.wa_flow_step` ('payment' | 'schedule' |
// NULL; migración 00228). Sin la migración aplicada, TODAS las
// lecturas/escrituras del paso degradan a "sin flujo" (se detecta el
// 42703 de la columna) y la conversación se comporta como antes:
// dirección capturada y el resto acordado por chat libre.
//
// Invariantes:
// - Las palabras clave del webhook mandan sobre el flujo: este
//   módulo solo se consulta cuando el texto no trajo ninguna.
// - Solo actúa con EXACTAMENTE un pedido en flujo para el teléfono
//   (misma regla anti-ambigüedad que la captura de dirección).
// - Cada avance es un UPDATE condicional sobre el paso leído: un
//   reintento de Meta o dos mensajes simultáneos no aplican la
//   elección dos veces ni brincan pasos.

import { missingColumnName } from "@/lib/admin/order-selects"
import { getNextDays } from "@/lib/delivery-days"
import {
  DEFAULT_DELIVERY_SLOTS_CONFIG,
  slotUnavailableReason,
  slotsForDayKey,
  type DeliverySlotsConfig,
  type SlotTakenCounts,
} from "@/lib/delivery-slots"
import { fetchSlotTakenCounts, loadDeliverySlotsConfig } from "@/lib/delivery-slots-server"
import { DEFAULT_TIMEZONE, localDateParts, minutesOfDay, parseHhMm } from "@/lib/local-date"
import { logger } from "@/lib/logger"
import type { createServiceClient } from "@/lib/supabase/service"
import { WHATSAPP_ADDRESS_CAPTURE_WINDOW_HOURS } from "@/lib/whatsapp-order-config"
import { findProfileByPhone } from "@/lib/whatsapp-orders"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export type WhatsAppPaymentChoice = "spei" | "cash_on_delivery"
export type WhatsAppFlowStep = "payment" | "schedule"

// ============================================================
// Parsers puros (sin I/O): la respuesta del cliente → elección
// ============================================================

/**
 * Interpreta la respuesta a "¿cómo quieres pagar?".
 * Acepta el número del menú o el nombre; "tarjeta" se reconoce como
 * su propio resultado para poder explicarle al cliente que por chat
 * no se cobra con tarjeta, en vez de tratarlo como respuesta inválida.
 */
export function parseWhatsAppPaymentChoice(
  raw: string
): WhatsAppPaymentChoice | "card" | null {
  const text = raw.trim().toLowerCase()
  if (!text) return null
  if (text === "1") return "spei"
  if (text === "2") return "cash_on_delivery"
  if (text.includes("tarjeta") || text.includes("card")) return "card"
  if (
    text.includes("spei") ||
    text.includes("transferencia") ||
    text.includes("transferir") ||
    text.includes("deposito") ||
    text.includes("depósito")
  ) {
    return "spei"
  }
  if (
    text.includes("efectivo") ||
    text.includes("contra entrega") ||
    text.includes("contraentrega") ||
    text.includes("al recibir") ||
    text.includes("al entregar")
  ) {
    return "cash_on_delivery"
  }
  return null
}

// ============================================================
// Opciones de día y ventana (puro)
// ============================================================

export interface WhatsAppScheduleOption {
  /** Día local `YYYY-MM-DD` (el `value` de delivery-days). */
  dayValue: string
  /** Etiqueta del día tal como la produce `getNextDays` ("Hoy — …"). */
  dayLabel: string
  /** Ventana de entrega, con el formato de la web ("12:00 PM — 2:00 PM"). */
  windowLabel: string
  /** Instante final para `orders.scheduled_for` (ISO). */
  scheduledFor: string
}

/**
 * Ventanas de entrega: desde la Ola 7 salen de la fuente única
 * `DELIVERY_SLOTS` (src/lib/delivery-slots.ts), la misma lista
 * que la web ofrece, filtrada por la configuración del panel
 * (franjas por día de semana, hora de corte y capacidad). Con la
 * configuración histórica el resultado es idéntico al de antes:
 * las 6 franjas de siempre, todos los días.
 */

/** Cuántos días se ofrecen en la pregunta (Hoy, Mañana y pasado). */
export const WHATSAPP_SCHEDULE_OPTION_COUNT = 3

/**
 * Las opciones de entrega que se le ofrecen al cliente.
 *
 * Para HOY la ventana es la primera configurada que aún no
 * empieza a la hora local actual (si ya no cabe ninguna, hoy no
 * se ofrece: prometer "hoy" a las 19:30 con la última ventana ya
 * empezada sería mentir) — y con hora de corte configurada, hoy
 * tampoco se ofrece si ya pasó el corte. Para los demás días, la
 * primera ventana configurada que no esté llena.
 */
export function buildWhatsAppScheduleOptions(
  now: Date = new Date(),
  config: DeliverySlotsConfig = DEFAULT_DELIVERY_SLOTS_CONFIG,
  taken?: SlotTakenCounts
): WhatsAppScheduleOption[] {
  const days = getNextDays(DEFAULT_TIMEZONE, now)
  const { hour } = localDateParts(DEFAULT_TIMEZONE, now)
  const cutoffMinutes = config.cutoffTime !== null ? parseHhMm(config.cutoffTime) : null
  const todayCut =
    cutoffMinutes !== null && minutesOfDay(DEFAULT_TIMEZONE, now) >= cutoffMinutes

  const options: WhatsAppScheduleOption[] = []
  days.forEach((day, idx) => {
    if (options.length >= WHATSAPP_SCHEDULE_OPTION_COUNT) return
    let candidates = slotsForDayKey(config, day.value)
    if (config.capacityPerSlot !== null && taken) {
      candidates = candidates.filter(
        (slot) =>
          slotUnavailableReason(config, { dayKey: day.value, slot, now, taken }) !== "slot_full"
      )
    }
    if (idx === 0) {
      if (todayCut) return // hoy ya cortó: la opción pasa a ser mañana
      const window = candidates.find((w) => w.startHour > hour)
      if (!window) return // hoy ya no cabe: la opción pasa a ser mañana
      candidates = [window]
    }
    const window = candidates[0]
    if (!window) return
    options.push({
      dayValue: day.value,
      dayLabel: day.label,
      windowLabel: window.label,
      // Mismo armado que POST /api/orders: día local + hora con -06:00.
      scheduledFor: new Date(`${day.value}T${window.start}:00-06:00`).toISOString(),
    })
  })
  return options
}

/**
 * Las opciones con la configuración vigente del panel: la carga
 * el llamador asíncrono (el webhook) para que el constructor
 * puro siga siendo puro. Sin capacidad configurada no se paga
 * la consulta de ocupación.
 */
async function buildConfiguredScheduleOptions(
  supabase: ServiceClient,
  now: Date = new Date()
): Promise<WhatsAppScheduleOption[]> {
  const { config } = await loadDeliverySlotsConfig(supabase)
  const taken =
    config.capacityPerSlot !== null
      ? await fetchSlotTakenCounts(
          supabase,
          getNextDays(DEFAULT_TIMEZONE, now).map((d) => d.value)
        )
      : undefined
  return buildWhatsAppScheduleOptions(now, config, taken)
}

/**
 * Interpreta la respuesta a "¿qué día lo quieres?": el número del
 * menú, "hoy" o "mañana" (contra las opciones ofrecidas, no contra
 * el calendario suelto: si hoy ya no se ofreció, "hoy" no elige nada).
 */
export function parseWhatsAppScheduleChoice(
  raw: string,
  options: readonly WhatsAppScheduleOption[],
  now: Date = new Date()
): WhatsAppScheduleOption | null {
  const text = raw.trim().toLowerCase()
  if (!text) return null

  const asNumber = Number(text)
  if (Number.isInteger(asNumber) && String(asNumber) === text) {
    return options[asNumber - 1] ?? null
  }

  const days = getNextDays(DEFAULT_TIMEZONE, now)
  if (text.includes("hoy")) {
    const today = days[0]?.value
    return options.find((o) => o.dayValue === today) ?? null
  }
  if (text.includes("mañana") || text.includes("manana")) {
    const tomorrow = days[1]?.value
    return options.find((o) => o.dayValue === tomorrow) ?? null
  }
  return null
}

// ============================================================
// Textos de las preguntas (puros): los usa el webhook y el reprompt
// ============================================================

export function buildWhatsAppPaymentQuestion(): string {
  return (
    "*¿Cómo quieres pagar?*\n" +
    "1️⃣ *Transferencia SPEI* — tu pedido se atiende primero 🚀\n" +
    "2️⃣ *Efectivo contra entrega* — pagas al recibir 💵\n\n" +
    "Respóndeme con el número o el nombre."
  )
}

export function buildWhatsAppScheduleQuestion(
  options: readonly WhatsAppScheduleOption[]
): string {
  const lines = options.map(
    (o, i) => `${i + 1}️⃣ *${o.dayLabel}* (${o.windowLabel})`
  )
  return (
    "*¿Qué día quieres tu entrega?*\n" +
    lines.join("\n") +
    "\n\nRespóndeme con el número o el día."
  )
}

// ============================================================
// Estado del flujo (Supabase)
// ============================================================

interface FlowOrder {
  id: number
  total: number
  payment_method: string
  wa_flow_step: WhatsAppFlowStep
  customer_phone: string | null
  user_id: string | null
}

const isMissingFlowColumn = (error: { code?: string | null; message?: string | null } | null) =>
  missingColumnName(error) === "wa_flow_step"

/**
 * Abre el paso de pago de un pedido recién completado con dirección.
 * Devuelve false si el paso no se pudo abrir —en particular si la
 * migración 00228 aún no se aplica— y el llamador sigue con el
 * comportamiento anterior (sin preguntas).
 */
export async function startWhatsAppPaymentStep(
  supabase: ServiceClient,
  orderId: number
): Promise<boolean> {
  const { data, error } = await supabase
    .from("orders")
    .update({ wa_flow_step: "payment" })
    .eq("id", orderId)
    .is("wa_flow_step", null)
    .select("id")
  if (error) {
    if (!isMissingFlowColumn(error)) {
      logger.error("WhatsApp flow: no se pudo abrir el paso de pago:", error)
    }
    return false
  }
  return (data ?? []).length > 0
}

/**
 * El único pedido del teléfono que está a mitad de la conversación
 * (paso de pago o de horario), dentro de la misma ventana de 48 h de
 * la captura de dirección. Cero o varios → null: el flujo nunca
 * adivina a qué pedido responde el cliente.
 */
async function findFlowOrder(
  supabase: ServiceClient,
  from: string
): Promise<FlowOrder | null> {
  const last10 = from.replace(/\D/g, "").slice(-10)
  if (last10.length < 10) return null

  const { profile } = await findProfileByPhone(supabase, from)

  const since = new Date(
    Date.now() - WHATSAPP_ADDRESS_CAPTURE_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString()
  const { data: rows, error } = await supabase
    .from("orders")
    .select("id, total, payment_method, wa_flow_step, customer_phone, user_id")
    .eq("source", "whatsapp")
    .not("wa_flow_step", "is", null)
    .not("status", "in", "(cancelled,delivered)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10)

  if (error) {
    if (!isMissingFlowColumn(error)) {
      logger.error("WhatsApp flow: consulta de pedidos en flujo falló:", error)
    }
    return null
  }

  const matches = ((rows ?? []) as FlowOrder[]).filter((o) => {
    if (o.customer_phone && o.customer_phone.replace(/\D/g, "").slice(-10) === last10) {
      return true
    }
    return profile !== null && o.user_id === profile.id
  })
  return matches.length === 1 ? (matches[0] ?? null) : null
}

export type WhatsAppFlowReplyResult =
  | { kind: "none" }
  | {
      kind: "payment_chosen"
      orderId: number
      total: number
      method: WhatsAppPaymentChoice
      scheduleOptions: WhatsAppScheduleOption[]
    }
  | {
      kind: "schedule_chosen"
      orderId: number
      total: number
      method: string
      dayLabel: string
      windowLabel: string
    }
  | { kind: "card_unavailable"; orderId: number }
  | {
      kind: "reprompt"
      step: WhatsAppFlowStep
      orderId: number
      scheduleOptions: WhatsAppScheduleOption[]
    }

/**
 * Procesa un texto libre como posible respuesta del flujo. Si el
 * teléfono no tiene un pedido a mitad de conversación, devuelve
 * "none" y el webhook sigue su routing normal (captura de dirección
 * y menú): el flujo nunca secuestra un mensaje que no es para él.
 */
export async function handleWhatsAppFlowReply(
  supabase: ServiceClient,
  input: { from: string; text: string }
): Promise<WhatsAppFlowReplyResult> {
  const order = await findFlowOrder(supabase, input.from)
  if (!order) return { kind: "none" }

  if (order.wa_flow_step === "payment") {
    const choice = parseWhatsAppPaymentChoice(input.text)
    if (choice === "card") return { kind: "card_unavailable", orderId: order.id }
    if (!choice) {
      return {
        kind: "reprompt",
        step: "payment",
        orderId: order.id,
        scheduleOptions: await buildConfiguredScheduleOptions(supabase),
      }
    }

    // La prioridad la deriva el servidor del método, como en el
    // checkout web (POST /api/orders): SPEI → prioritario.
    const patch =
      choice === "spei"
        ? { payment_method: "spei", priority: true, wa_flow_step: "schedule" }
        : { payment_method: "cash_on_delivery", priority: false, wa_flow_step: "schedule" }
    const { data: updated, error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", order.id)
      .eq("wa_flow_step", "payment")
      .select("id")
    if (error || !updated || updated.length === 0) {
      // Carrera (otro mensaje ya avanzó el paso) o error: no se
      // responde como si la elección se hubiera guardado.
      if (error) logger.error("WhatsApp flow: no se pudo guardar el método de pago:", error)
      return { kind: "none" }
    }

    logger.info("whatsapp.order.payment_chosen", { orderId: order.id, method: choice })
    return {
      kind: "payment_chosen",
      orderId: order.id,
      total: Number(order.total),
      method: choice,
      scheduleOptions: await buildConfiguredScheduleOptions(supabase),
    }
  }

  // step === "schedule"
  const options = await buildConfiguredScheduleOptions(supabase)
  const picked = parseWhatsAppScheduleChoice(input.text, options)
  if (!picked) {
    return { kind: "reprompt", step: "schedule", orderId: order.id, scheduleOptions: options }
  }

  const { data: updated, error } = await supabase
    .from("orders")
    .update({ scheduled_for: picked.scheduledFor, wa_flow_step: null })
    .eq("id", order.id)
    .eq("wa_flow_step", "schedule")
    .select("id")
  if (error || !updated || updated.length === 0) {
    if (error) logger.error("WhatsApp flow: no se pudo guardar el horario:", error)
    return { kind: "none" }
  }

  logger.info("whatsapp.order.schedule_chosen", {
    orderId: order.id,
    scheduledFor: picked.scheduledFor,
  })
  return {
    kind: "schedule_chosen",
    orderId: order.id,
    total: Number(order.total),
    method: order.payment_method,
    dayLabel: picked.dayLabel,
    windowLabel: picked.windowLabel,
  }
}
