"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { logger } from "@/lib/logger"
import { getWeekBounds, getMonthBounds, getTodayBounds } from "../comercializacion/dates"
import {
  ZONES,
  TIER_LABEL,
  ZONE_LABEL,
  MONTH_TARGETS,
  DEFAULT_GOALS,
  VALUE_PROPS,
  zoneOfDay,
} from "./plan"
import { chatCompletion } from "./llm"
import { renderTemplate, AGENT_SYSTEM_PROMPT } from "./templates"
import { buildWhatsappLink } from "../comercializacion/whatsapp"
import type {
  AgentGoals,
  AgentKpis,
  AgentMessage,
  AgentMessageStatus,
  AgentQueueItem,
  MessageKind,
  TouchChannel,
} from "./types"

// ============================================================
// Helpers internos
// ============================================================

interface ProspectRow {
  id: number
  name: string
  restaurant_name: string | null
  whatsapp: string | null
  phone: string | null
  status: string
  tier: number | null
  zone: string | null
  user_id: string | null
  last_contact_at: string | null
  next_follow_up_at: string | null
  created_at: string
}

const PROSPECT_COLS =
  "id, name, restaurant_name, whatsapp, phone, status, tier, zone, user_id, last_contact_at, next_follow_up_at, created_at"

const ACTIVE_STATUSES = ["nuevo", "contactado", "en_seguimiento", "cliente_activo"]

async function getSellerName(supabase: Awaited<ReturnType<typeof createServiceClient>>, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle()
  return (data?.full_name as string | null) || "tu asesor de Resurte.me"
}

function suggestedKindFor(status: string, touches: number): MessageKind {
  if (status === "nuevo" || touches === 0) return "primer_contacto"
  if (status === "contactado") return touches >= 2 ? "cierre_urgencia" : "seguimiento"
  if (status === "en_seguimiento") return "cierre_urgencia"
  if (status === "cliente_activo") return "reorden"
  if (status === "inactivo") return "reactivacion"
  return "seguimiento"
}

function recommendedChannelFor(touches: number, whatsapp: string | null): TouchChannel {
  // Secuencia del plan: Día 1 visita → Día 2 WhatsApp → Día 3 llamada.
  if (touches === 0) return "visita"
  if (touches === 1) return whatsapp ? "whatsapp" : "llamada"
  if (touches === 2) return "llamada"
  return whatsapp ? "whatsapp" : "visita"
}

// ============================================================
// COLA DIARIA
// ============================================================

export async function getDailyQueue(): Promise<AgentQueueItem[]> {
  const { userId } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const [{ data: prospects, error }, { data: activities }] = await Promise.all([
    supabase
      .from("crm_prospects")
      .select(PROSPECT_COLS)
      .eq("seller_id", userId)
      .in("status", [...ACTIVE_STATUSES, "inactivo"])
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("crm_activities")
      .select("prospect_id")
      .eq("seller_id", userId)
      .eq("direction", "saliente"),
  ])

  if (error) {
    logger.error("[AgenteIA] getDailyQueue error:", error)
    throw new Error("Error al cargar la cola del día")
  }

  const touchesByProspect = new Map<number, number>()
  for (const a of activities ?? []) {
    const pid = Number(a.prospect_id)
    touchesByProspect.set(pid, (touchesByProspect.get(pid) ?? 0) + 1)
  }

  const todayZone = zoneOfDay()
  const now = new Date().toISOString()

  const items: AgentQueueItem[] = (prospects ?? []).map((p) => {
    const row = p as unknown as ProspectRow
    const touches = touchesByProspect.get(Number(row.id)) ?? 0
    return {
      prospectId: Number(row.id),
      name: row.name,
      restaurantName: row.restaurant_name,
      whatsapp: row.whatsapp,
      phone: row.phone,
      status: row.status,
      tier: row.tier,
      zone: row.zone,
      touches,
      recommendedChannel: recommendedChannelFor(touches, row.whatsapp),
      suggestedKind: suggestedKindFor(row.status, touches),
      nextFollowUpAt: row.next_follow_up_at,
      lastContactAt: row.last_contact_at,
      isZoneOfDay: !!todayZone && row.zone === todayZone.id,
    }
  })

  // Prioridad: 1) seguimientos vencidos, 2) zona del día, 3) tier (1 primero),
  // 4) nuevos sin tocar, 5) menos toques primero.
  return items
    .sort((a, b) => {
      const aDue = a.nextFollowUpAt && a.nextFollowUpAt <= now ? 1 : 0
      const bDue = b.nextFollowUpAt && b.nextFollowUpAt <= now ? 1 : 0
      if (aDue !== bDue) return bDue - aDue
      if (a.isZoneOfDay !== b.isZoneOfDay) return a.isZoneOfDay ? -1 : 1
      const ta = a.tier ?? 9
      const tb = b.tier ?? 9
      if (ta !== tb) return ta - tb
      const aNew = a.touches === 0 ? 0 : 1
      const bNew = b.touches === 0 ? 0 : 1
      if (aNew !== bNew) return aNew - bNew
      return a.touches - b.touches
    })
    .slice(0, 25)
}

// ============================================================
// GENERACIÓN DE MENSAJES (IA + fallback de plantillas)
// ============================================================

const MESSAGE_KINDS: MessageKind[] = [
  "primer_contacto",
  "seguimiento",
  "cierre_urgencia",
  "reorden",
  "reactivacion",
  "upsell",
]

const KIND_INSTRUCTION: Record<MessageKind, string> = {
  primer_contacto:
    "Primer contacto en frío. Preséntate, menciona que viste su restaurante, explica en 3 viñetas cómo funciona (registro 3 min + 500 pts, 1 punto por peso, 1,000 pts = $50) y cierra con la promo de lanzamiento (doble puntos esta semana) y la pregunta: ¿le mando el enlace?",
  seguimiento:
    "Seguimiento amable a alguien que ya contactamos y no respondió. Recuerda la oferta de lanzamiento (envío gratis + crédito 7 días + 500 pts) y propone un pedido de prueba de $500. Cierra preguntando si le mandas el catálogo.",
  cierre_urgencia:
    "Cierre con urgencia: la promo de doble puntos termina el viernes. Haz la cuenta concreta (pedido de $4,000: hoy 8,000 pts = $400 vs. después 4,000 pts = $200). Refuerza: registro gratis, primer pedido desde $500. Pregunta: ¿le mando el enlace ahora?",
  reorden:
    "Cliente activo: recordatorio de reorden semanal. Refuerza el beneficio clave (pide antes de 10 AM, llega el mismo día) y sus puntos acumulados. Ofrece armarle la lista 'con lo de siempre'.",
  reactivacion:
    "Cliente dormido: bono 'REGRESO EL CHEF' (1,000 pts extra + envío gratis sin mínimo + 10% en su primer producto de carne). Pregunta qué le detuvo (precio, catálogo, servicio) y ofrece el catálogo actualizado.",
  upsell:
    "Está cerca de subir de nivel en el Club del Chef. Lista 2-3 beneficios del siguiente nivel (más puntos por peso, envío gratis con menor mínimo, ofertas flash) y ofrece armar un pedido sugerido para subir hoy.",
}

export async function generateAgentMessage(
  prospectId: number,
  kind: MessageKind
): Promise<AgentMessage> {
  const { userId } = await requireSellerOrAdminAction()
  if (!MESSAGE_KINDS.includes(kind)) throw new Error("Tipo de mensaje inválido")

  const supabase = await createServiceClient()
  const { data: prospect, error } = await supabase
    .from("crm_prospects")
    .select(PROSPECT_COLS + ", notes, employees, instagram, weekly_volume_min, weekly_volume_max")
    .eq("id", prospectId)
    .eq("seller_id", userId)
    .single()

  if (error || !prospect) throw new Error("Prospecto no encontrado")
  const p = prospect as unknown as ProspectRow & {
    notes: string | null
    employees: number | null
    instagram: string | null
    weekly_volume_min: number | null
    weekly_volume_max: number | null
  }

  const sellerName = await getSellerName(supabase, userId)
  const zone = p.zone ? ZONES.find((z) => z.id === p.zone) : null

  const userPrompt = [
    `TIPO DE MENSAJE: ${KIND_INSTRUCTION[kind]}`,
    "",
    "DATOS DEL PROSPECTO:",
    `- Contacto: ${p.name}`,
    p.restaurant_name ? `- Restaurante: ${p.restaurant_name}` : null,
    p.tier ? `- Segmento: ${TIER_LABEL[p.tier] ?? `Tier ${p.tier}`}` : null,
    zone ? `- Zona: ${zone.label}. Pitch de la zona: "${zone.pitch}". Productos clave: ${zone.keyProducts.join(", ")}.` : null,
    p.employees ? `- Empleados: ${p.employees}` : null,
    p.weekly_volume_min
      ? `- Volumen estimado de compra: $${Number(p.weekly_volume_min).toLocaleString("es-MX")}–$${Number(p.weekly_volume_max ?? p.weekly_volume_min).toLocaleString("es-MX")} MXN/semana`
      : null,
    p.notes ? `- Notas del vendedor: ${p.notes}` : null,
    "",
    `- Firma: ${sellerName} · Resurte.me Chihuahua`,
    "",
    `PROPUESTA DE VALOR DISPONIBLE: ${VALUE_PROPS.join("; ")}.`,
  ]
    .filter(Boolean)
    .join("\n")

  const llm = await chatCompletion(AGENT_SYSTEM_PROMPT, userPrompt)
  const message =
    llm?.text ??
    renderTemplate(kind, {
      prospectName: p.name,
      restaurantName: p.restaurant_name,
      sellerName,
    })
  const model = llm?.model ?? "plantilla"

  const { data: saved, error: saveErr } = await supabase
    .from("crm_agent_messages")
    .insert({
      seller_id: userId,
      prospect_id: prospectId,
      kind,
      message,
      status: "borrador",
      model,
    })
    .select("id, created_at")
    .single()

  if (saveErr || !saved) {
    logger.error("[AgenteIA] generateAgentMessage insert error:", saveErr)
    throw new Error("Error al guardar el borrador")
  }

  return {
    id: Number(saved.id),
    prospectId,
    prospectName: p.name,
    restaurantName: p.restaurant_name,
    whatsapp: p.whatsapp ?? p.phone,
    kind,
    message,
    status: "borrador",
    model,
    createdAt: String(saved.created_at),
  }
}

// ============================================================
// BANDEJA DE MENSAJES
// ============================================================

export async function getAgentMessages(
  status: AgentMessageStatus = "borrador"
): Promise<AgentMessage[]> {
  const { userId } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from("crm_agent_messages")
    .select("id, prospect_id, kind, message, status, model, created_at, crm_prospects(name, restaurant_name, whatsapp, phone)")
    .eq("seller_id", userId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    logger.error("[AgenteIA] getAgentMessages error:", error)
    throw new Error("Error al cargar los mensajes")
  }

  return (data ?? []).map((m) => {
    const prospect = m.crm_prospects as {
      name?: string
      restaurant_name?: string | null
      whatsapp?: string | null
      phone?: string | null
    } | null
    return {
      id: Number(m.id),
      prospectId: Number(m.prospect_id),
      prospectName: prospect?.name ?? "Prospecto",
      restaurantName: prospect?.restaurant_name ?? null,
      whatsapp: prospect?.whatsapp ?? prospect?.phone ?? null,
      kind: m.kind as MessageKind,
      message: String(m.message),
      status: m.status as AgentMessageStatus,
      model: (m.model as string | null) ?? null,
      createdAt: String(m.created_at),
    }
  })
}

export async function updateAgentMessageText(id: number, text: string): Promise<void> {
  const { userId } = await requireSellerOrAdminAction()
  if (!text.trim()) throw new Error("El mensaje no puede estar vacío")
  const supabase = await createServiceClient()
  const { error } = await supabase
    .from("crm_agent_messages")
    .update({ message: text.trim() })
    .eq("id", id)
    .eq("seller_id", userId)
    .in("status", ["borrador", "aprobado"])
  if (error) {
    logger.error("[AgenteIA] updateAgentMessageText error:", error)
    throw new Error("Error al actualizar el mensaje")
  }
}

export async function setAgentMessageStatus(
  id: number,
  status: "aprobado" | "descartado"
): Promise<void> {
  const { userId } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const patch: Record<string, unknown> = { status }
  if (status === "aprobado") patch.approved_at = new Date().toISOString()
  const { error } = await supabase
    .from("crm_agent_messages")
    .update(patch)
    .eq("id", id)
    .eq("seller_id", userId)
    .neq("status", "enviado")
  if (error) {
    logger.error("[AgenteIA] setAgentMessageStatus error:", error)
    throw new Error("Error al actualizar el mensaje")
  }
}

/**
 * Aprueba (si hace falta), marca como enviado, registra la actividad
 * en el CRM y devuelve el link wa.me para abrir WhatsApp con el
 * mensaje prellenado. El envío real lo hace el vendedor (asistido).
 */
export async function sendAgentMessage(id: number): Promise<{ link: string }> {
  const { userId } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const { data: msg, error } = await supabase
    .from("crm_agent_messages")
    .select("id, prospect_id, kind, message, status, crm_prospects(whatsapp, phone, status)")
    .eq("id", id)
    .eq("seller_id", userId)
    .single()

  if (error || !msg) throw new Error("Mensaje no encontrado")
  if (msg.status === "enviado") throw new Error("Este mensaje ya fue enviado")
  if (msg.status === "descartado") throw new Error("Este mensaje fue descartado")

  const prospect = msg.crm_prospects as {
    whatsapp?: string | null
    phone?: string | null
    status?: string
  } | null
  const phone = prospect?.whatsapp ?? prospect?.phone
  const link = buildWhatsappLink(phone, String(msg.message))
  if (!link) throw new Error("El prospecto no tiene número de WhatsApp")

  const now = new Date().toISOString()
  await supabase
    .from("crm_agent_messages")
    .update({ status: "enviado", sent_at: now, approved_at: now })
    .eq("id", id)

  const prospectId = Number(msg.prospect_id)
  await supabase.from("crm_activities").insert({
    prospect_id: prospectId,
    seller_id: userId,
    type: "whatsapp",
    direction: "saliente",
    outcome: "enviado",
    summary: `[Agente IA · ${msg.kind}] ${String(msg.message).slice(0, 180)}`,
  })

  const prospectPatch: Record<string, unknown> = { last_contact_at: now }
  if (prospect?.status === "nuevo") prospectPatch.status = "contactado"
  await supabase.from("crm_prospects").update(prospectPatch).eq("id", prospectId)

  return { link }
}

// ============================================================
// REGISTRO RÁPIDO DE TOQUES (visita / llamada / demo)
// ============================================================

export async function registerAgentTouch(
  prospectId: number,
  type: Exclude<TouchChannel, "whatsapp">,
  summary?: string
): Promise<void> {
  const { userId } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const { data: prospect, error } = await supabase
    .from("crm_prospects")
    .select("id, status")
    .eq("id", prospectId)
    .eq("seller_id", userId)
    .single()
  if (error || !prospect) throw new Error("Prospecto no encontrado")

  const { error: actErr } = await supabase.from("crm_activities").insert({
    prospect_id: prospectId,
    seller_id: userId,
    type,
    direction: "saliente",
    outcome: type === "visita" ? "enviado" : "sin_contestar",
    summary: summary?.trim() || null,
  })
  if (actErr) {
    logger.error("[AgenteIA] registerAgentTouch error:", actErr)
    throw new Error("Error al registrar la actividad")
  }

  const now = new Date()
  const patch: Record<string, unknown> = { last_contact_at: now.toISOString() }
  if (prospect.status === "nuevo") patch.status = "contactado"
  // Secuencia del plan: siguiente toque al día siguiente.
  if (type === "visita" || type === "llamada") {
    const next = new Date(now)
    next.setDate(next.getDate() + 1)
    patch.next_follow_up_at = next.toISOString()
  }
  await supabase.from("crm_prospects").update(patch).eq("id", prospectId)
}

// ============================================================
// METAS CONFIGURABLES
// ============================================================

export async function getAgentGoals(): Promise<AgentGoals> {
  const { userId } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from("crm_agent_goals")
    .select("*")
    .eq("seller_id", userId)
    .maybeSingle()

  return {
    dailyVisitas: Number(data?.daily_visitas ?? DEFAULT_GOALS.daily_visitas),
    dailyWhatsapp: Number(data?.daily_whatsapp ?? DEFAULT_GOALS.daily_whatsapp),
    dailyLlamadas: Number(data?.daily_llamadas ?? DEFAULT_GOALS.daily_llamadas),
    dailyDemos: Number(data?.daily_demos ?? DEFAULT_GOALS.daily_demos),
    monthlyRegistros: Number(data?.monthly_registros ?? DEFAULT_GOALS.monthly_registros),
    monthlyActivos: Number(data?.monthly_activos ?? DEFAULT_GOALS.monthly_activos),
    monthlyVentas: Number(data?.monthly_ventas ?? DEFAULT_GOALS.monthly_ventas),
  }
}

export async function updateAgentGoals(goals: AgentGoals): Promise<void> {
  const { userId } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const { error } = await supabase.from("crm_agent_goals").upsert({
    seller_id: userId,
    daily_visitas: goals.dailyVisitas,
    daily_whatsapp: goals.dailyWhatsapp,
    daily_llamadas: goals.dailyLlamadas,
    daily_demos: goals.dailyDemos,
    monthly_registros: goals.monthlyRegistros,
    monthly_activos: goals.monthlyActivos,
    monthly_ventas: goals.monthlyVentas,
    updated_at: new Date().toISOString(),
  })
  if (error) {
    logger.error("[AgenteIA] updateAgentGoals error:", error)
    throw new Error("Error al guardar las metas")
  }
}

// ============================================================
// TABLERO GERENCIAL DE KPIs
// ============================================================

export async function getAgentKpis(): Promise<AgentKpis> {
  const { userId } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const week = getWeekBounds()
  const month = getMonthBounds()
  const today = getTodayBounds()
  const goals = await getAgentGoals()

  const [prospectsRes, activitiesRes, messagesRes] = await Promise.all([
    supabase
      .from("crm_prospects")
      .select("id, status, tier, zone, user_id, created_at")
      .eq("seller_id", userId),
    supabase
      .from("crm_activities")
      .select("type, occurred_at")
      .eq("seller_id", userId)
      .gte("occurred_at", week.startISO),
    supabase
      .from("crm_agent_messages")
      .select("status, sent_at")
      .eq("seller_id", userId),
  ])

  if (prospectsRes.error) {
    logger.error("[AgenteIA] getAgentKpis error:", prospectsRes.error)
    throw new Error("Error al cargar los KPIs")
  }

  const prospects = (prospectsRes.data ?? []) as unknown as Array<{
    id: number
    status: string
    tier: number | null
    zone: string | null
    user_id: string | null
    created_at: string
  }>
  const activities = (activitiesRes.data ?? []) as unknown as Array<{
    type: string
    occurred_at: string
  }>
  const messages = (messagesRes.data ?? []) as unknown as Array<{
    status: string
    sent_at: string | null
  }>

  // ---- Embudo ----
  const funnelOrder = [
    { status: "nuevo", label: "Nuevos" },
    { status: "contactado", label: "Contactados" },
    { status: "en_seguimiento", label: "En seguimiento" },
    { status: "cliente_activo", label: "Clientes activos" },
    { status: "inactivo", label: "Inactivos" },
    { status: "perdido", label: "Perdidos" },
  ]
  const funnel = funnelOrder.map((s) => ({
    ...s,
    count: prospects.filter((p) => p.status === s.status).length,
  }))

  // ---- Actividad hoy / semana vs. metas ----
  const countType = (type: string, since: string) =>
    activities.filter((a) => a.type === type && a.occurred_at >= since).length
  const activity = [
    { label: "Visitas", type: "visita", goal: goals.dailyVisitas },
    { label: "WhatsApp", type: "whatsapp", goal: goals.dailyWhatsapp },
    { label: "Llamadas", type: "llamada", goal: goals.dailyLlamadas },
    { label: "Demos", type: "demo", goal: goals.dailyDemos },
  ].map((a) => ({
    label: a.label,
    today: countType(a.type, today.startISO),
    todayGoal: a.goal,
    week: countType(a.type, week.startISO),
    weekGoal: a.goal * 5,
  }))

  // ---- Mes de operación (según antigüedad del primer prospecto) ----
  const firstCreated = prospects.reduce<string | null>(
    (min, p) => (min === null || p.created_at < min ? p.created_at : min),
    null
  )
  let monthIndex = 1
  if (firstCreated) {
    const elapsed =
      (Date.now() - new Date(firstCreated).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    monthIndex = Math.min(3, Math.max(1, Math.floor(elapsed) + 1))
  }
  const target = MONTH_TARGETS[monthIndex - 1]

  // ---- Resultados del mes ----
  const monthRegistros = prospects.filter((p) => p.created_at >= month.startISO).length
  const monthActivos = prospects.filter((p) => p.status === "cliente_activo").length

  const linkedIds = prospects.filter((p) => p.user_id).map((p) => String(p.user_id))
  let monthVentas = 0
  let monthPedidos = 0
  if (linkedIds.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("total, created_at")
      .in("user_id", linkedIds)
      .eq("payment_status", "paid")
      .neq("status", "cancelled")
      .gte("created_at", month.startISO)
    monthVentas = (orders ?? []).reduce((s, o) => s + Number(o.total), 0)
    monthPedidos = (orders ?? []).length
  }

  // ---- Conversión ----
  const notLost = prospects.filter((p) => p.status !== "perdido")
  const conversionGlobal = notLost.length > 0 ? monthActivos / notLost.length : 0

  const segmentConv = (
    keys: Array<{ key: string; label: string }>,
    pick: (p: (typeof prospects)[number]) => string | null
  ) =>
    keys.map(({ key, label }) => {
      const inSegment = prospects.filter((p) => pick(p) === key && p.status !== "perdido")
      const activos = inSegment.filter((p) => p.status === "cliente_activo").length
      return {
        segment: label,
        total: inSegment.length,
        activos,
        conversion: inSegment.length > 0 ? activos / inSegment.length : 0,
      }
    })

  const byTier = segmentConv(
    [1, 2, 3].map((t) => ({ key: String(t), label: TIER_LABEL[t] })),
    (p) => (p.tier ? String(p.tier) : null)
  )
  const byZone = segmentConv(
    ZONES.map((z) => ({ key: z.id, label: z.label })),
    (p) => p.zone
  )

  const todayZone = zoneOfDay()

  return {
    funnel,
    activity,
    monthIndex,
    monthRegistros,
    monthActivos,
    monthVentas,
    monthPedidos,
    ticketPromedio: monthPedidos > 0 ? monthVentas / monthPedidos : 0,
    targetRegistros: Math.max(target.registrados, goals.monthlyRegistros * monthIndex),
    targetActivos: Math.max(target.activos, goals.monthlyActivos * monthIndex),
    targetVentas: Math.max(target.ventas, goals.monthlyVentas * monthIndex),
    targetConversion: target.conversion,
    conversionGlobal,
    byTier,
    byZone,
    borradoresPendientes: messages.filter((m) => m.status === "borrador").length,
    enviadosSemana: messages.filter(
      (m) => m.status === "enviado" && m.sent_at && m.sent_at >= week.startISO
    ).length,
    zoneOfDay: todayZone
      ? {
          id: todayZone.id,
          label: todayZone.label,
          visitGoal: todayZone.visitGoal,
          pitch: todayZone.pitch,
        }
      : null,
  }
}
