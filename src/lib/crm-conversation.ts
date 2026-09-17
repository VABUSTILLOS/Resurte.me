/**
 * Lector único de la conversación de un prospecto (Ronda 7).
 *
 * `getAdminLeadConversation` vivía en `admin/actions.ts` con toda su fontanería
 * privada: cargar la fila, resolver el nombre del vendedor, traer los mensajes
 * de WhatsApp, las automatizaciones, las actividades y el lead de origen. La
 * bandeja del vendedor necesita exactamente lo mismo, así que la alternativa era
 * copiarlo —el segundo lector que esta ronda existe para eliminar— o extraerlo.
 * Aquí queda extraído, con una sola diferencia entre ambos: el **alcance**.
 *
 * Regla de seguridad que gobierna este módulo: todas estas consultas usan
 * `createServiceClient()`, que **salta RLS por completo**. La política
 * `crm_prospects_owner_all` (`seller_id = auth.uid()`) no protege nada en este
 * camino. Por eso el alcance se aplica como filtro de código dentro de
 * `loadProspectRow` y **nunca** se añade `OR seller_id IS NULL`: el pool sin
 * asignar es invisible para el vendedor por diseño.
 *
 * Cuando el alcance filtra la fila, el resultado es `null` —indistinguible de
 * "no existe"—. Es deliberado: un `prospectId` ajeno debe responder
 * "Prospecto no encontrado", nunca "Acceso denegado", que confirmaría que la
 * fila existe.
 */

import { logger } from "@/lib/logger"
import { isMissingColumnError, isMissingRelationError } from "@/lib/sale-window"
import {
  CRM_PROSPECT_COLUMNS,
  CRM_PROSPECT_COLUMNS_WITHOUT_TAGS,
  applyCrmScope,
  mapCrmProspect,
  type CrmScope,
} from "@/lib/crm-core"
import {
  buildThread,
  firstResponseMinutes,
  indexMessagesByPhone,
  mergeTimeline,
  needsReply,
  normalizeDirection,
  phoneLookupVariants,
  prospectPhoneKey,
  type ConversationProspect,
  type InboxBucket,
  type InboxMessage,
  type WhatsAppWindowState,
} from "@/lib/crm-inbox"
import type { createServiceClient } from "@/lib/supabase/service"

export type ConversationClient = Awaited<ReturnType<typeof createServiceClient>>

/** Cuántos eventos de cada fuente entran al hilo. */
export const CONVERSATION_LIMIT = 200

export interface LeadTimelineEntry extends InboxMessage {
  source: "whatsapp" | "automation" | "activity"
  key: string
}

export interface LeadConversation {
  prospect: ConversationProspect
  /** Solo WhatsApp: es lo que decide la ventana de 24 h. */
  messages: InboxMessage[]
  /** WhatsApp + automatizaciones + actividades, para pintar el hilo completo. */
  timeline: LeadTimelineEntry[]
  window: WhatsAppWindowState
  bucket: InboxBucket | null
  needsReply: boolean
  firstResponseMinutes: number | null
  /** Número con el que se emparejó la conversación; `null` sin teléfono. */
  phoneKey: string | null
  seller: { id: string; name: string } | null
  /** Lead del que nació el prospecto. `null` cuando no se pidió o no existe. */
  lead: { id: number; email: string; source: string; created_at: string } | null
}

export interface LeadConversationOptions {
  /**
   * Alcance del lector. El admin ve todo; el vendedor solo su cartera. Sin
   * alcance no se filtra, que es lo correcto únicamente para llamadas que ya
   * pasaron por `requireAdmin()`.
   */
  scope?: CrmScope
  /**
   * Traer el lead de origen. El vendedor no tiene vista de `leads`, así que su
   * bandeja lo omite y se ahorra una consulta.
   */
  includeLead?: boolean
}

export async function fetchProfileName(
  supabase: ConversationClient,
  userId: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", userId)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: String(data.id),
    name: (data.full_name as string | null)?.trim() || String(data.email ?? "Sin nombre"),
  }
}

/**
 * Carga la ficha del prospecto. `tags` se pide aparte porque la columna llega
 * con la migración 00140: sin ella el prospecto sigue existiendo, solo sin
 * etiquetas, y la bandeja no puede dejar de abrirse por eso.
 *
 * `scope` es la única barrera real cuando el llamador es un vendedor: el cliente
 * de servicio ignora RLS. Filtra en SQL para que una fila ajena sea
 * indistinguible de una inexistente.
 */
export async function loadProspectRow(
  supabase: ConversationClient,
  prospectId: number,
  scope?: CrmScope,
): Promise<Record<string, unknown> | null> {
  const base = () => {
    const query = supabase.from("crm_prospects").select(CRM_PROSPECT_COLUMNS).eq("id", prospectId)
    return scope ? applyCrmScope(query, scope) : query
  }

  const { data, error } = await base().maybeSingle()
  if (!error) return (data as Record<string, unknown> | null) ?? null

  if (isMissingColumnError(error)) {
    const fallbackQuery = supabase
      .from("crm_prospects")
      .select(CRM_PROSPECT_COLUMNS_WITHOUT_TAGS)
      .eq("id", prospectId)
    const fallback = await (scope ? applyCrmScope(fallbackQuery, scope) : fallbackQuery).maybeSingle()
    if (!fallback.error) return (fallback.data as Record<string, unknown> | null) ?? null
  }

  logger.error("[CRM-CONVERSACION] Error fetching prospect:", error)
  throw new Error("Error al cargar el prospecto")
}

export function toConversationProspect(row: Record<string, unknown>): ConversationProspect {
  return mapCrmProspect(row)
}

/**
 * Mensajes de WhatsApp de un número.
 *
 * Se filtra por `from_number` y no por la columna generada `from_digits`: en
 * ambos sentidos `from_number` guarda el número del cliente (el webhook al
 * recibir, el envío al mandar), así que las variantes con y sin lada cubren el
 * hilo completo sin depender de que 00140 esté aplicada.
 */
export async function fetchConversationMessages(
  supabase: ConversationClient,
  variants: readonly string[],
): Promise<InboxMessage[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id, direction, content, created_at, message_type, from_number")
    .in("from_number", variants)
    .order("created_at", { ascending: false })
    .limit(CONVERSATION_LIMIT)

  if (error) {
    logger.warn("[CRM-CONVERSACION] No se pudo leer la conversación:", { message: error.message })
    return []
  }

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    direction: normalizeDirection(row.direction as string | null),
    content: (row.content as string | null) ?? null,
    created_at: String(row.created_at),
    message_type: (row.message_type as string | null) ?? null,
    from_number: (row.from_number as string | null) ?? null,
  }))
}

/**
 * Automatizaciones enviadas a ese número. `whatsapp_automation_sends` es la
 * bitácora de envíos masivos; sin ella el hilo mostraría un hueco entre dos
 * mensajes del cliente que en realidad sí recibió algo.
 */
export async function fetchAutomationSends(
  supabase: ConversationClient,
  variants: readonly string[],
): Promise<InboxMessage[]> {
  const { data, error } = await supabase
    .from("whatsapp_automation_sends")
    .select("id, automation_type, status, created_at")
    .in("recipient", variants)
    .order("created_at", { ascending: false })
    .limit(CONVERSATION_LIMIT)

  if (error) {
    if (!isMissingRelationError(error)) {
      logger.warn("[CRM-CONVERSACION] No se pudieron leer las automatizaciones:", {
        message: error.message,
      })
    }
    return []
  }

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    direction: "outbound" as const,
    content: String(row.status ?? ""),
    created_at: String(row.created_at),
    message_type: `automation:${String(row.automation_type ?? "desconocida")}`,
    from_number: null,
  }))
}

/** Actividades registradas en el CRM (llamadas, visitas, notas). */
export async function fetchProspectActivities(
  supabase: ConversationClient,
  prospectId: number,
): Promise<InboxMessage[]> {
  const { data, error } = await supabase
    .from("crm_activities")
    .select("id, type, direction, outcome, summary, occurred_at")
    .eq("prospect_id", prospectId)
    .order("occurred_at", { ascending: false })
    .limit(CONVERSATION_LIMIT)

  if (error) {
    logger.warn("[CRM-CONVERSACION] No se pudieron leer las actividades:", {
      message: error.message,
    })
    return []
  }

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    direction: row.direction === "entrante" ? ("inbound" as const) : ("outbound" as const),
    content: (row.summary as string | null) ?? (row.outcome as string | null) ?? null,
    created_at: String(row.occurred_at),
    message_type: `activity:${String(row.type ?? "nota")}`,
    from_number: null,
  }))
}

/** Lead del que nació el prospecto, para poder volver al origen. */
export async function fetchProspectLead(
  supabase: ConversationClient,
  prospectId: number,
): Promise<{ id: number; email: string; source: string; created_at: string } | null> {
  const { data, error } = await supabase
    .from("crm_prospects")
    .select("leads(id, email, source, created_at)")
    .eq("id", prospectId)
    .maybeSingle()

  if (error) {
    logger.warn("[CRM-CONVERSACION] No se pudo leer el lead de origen:", {
      message: error.message,
    })
    return null
  }

  const embedded = (data as { leads?: Record<string, unknown> | null } | null)?.leads
  if (!embedded) return null
  return {
    id: Number(embedded.id),
    email: String(embedded.email ?? ""),
    source: String(embedded.source ?? ""),
    created_at: String(embedded.created_at ?? ""),
  }
}

/**
 * Conversación completa de un prospecto: mensajes, automatizaciones,
 * actividades y el estado de la ventana de 24 h calculado en el servidor.
 *
 * Devuelve `null` cuando la fila no existe **o queda fuera del alcance**. El
 * llamador decide el mensaje; en ambos casos debe ser el mismo
 * ("Prospecto no encontrado") para no filtrar la existencia de filas ajenas.
 */
export async function readLeadConversation(
  supabase: ConversationClient,
  prospectId: number,
  options: LeadConversationOptions = {},
): Promise<LeadConversation | null> {
  const row = await loadProspectRow(supabase, prospectId, options.scope)
  if (!row) return null

  const prospect = toConversationProspect(row)
  const variants = phoneLookupVariants(prospectPhoneKey(prospect))

  const [waMessages, automationSends, activities, seller, lead] = await Promise.all([
    variants.length > 0 ? fetchConversationMessages(supabase, variants) : Promise.resolve([]),
    variants.length > 0 ? fetchAutomationSends(supabase, variants) : Promise.resolve([]),
    fetchProspectActivities(supabase, prospectId),
    prospect.seller_id ? fetchProfileName(supabase, prospect.seller_id) : Promise.resolve(null),
    options.includeLead ? fetchProspectLead(supabase, prospectId) : Promise.resolve(null),
  ])

  const messages = mergeTimeline(waMessages)
  const thread = buildThread(prospect, indexMessagesByPhone(messages))

  return {
    prospect,
    messages,
    timeline: mergeTimeline<LeadTimelineEntry>([
      ...messages.map((m) => ({ ...m, source: "whatsapp" as const, key: `wa:${m.id}` })),
      ...automationSends.map((m) => ({ ...m, source: "automation" as const, key: `auto:${m.id}` })),
      ...activities.map((m) => ({ ...m, source: "activity" as const, key: `act:${m.id}` })),
    ]),
    window: thread.window,
    bucket: thread.bucket,
    needsReply: needsReply(messages),
    firstResponseMinutes: firstResponseMinutes(messages),
    phoneKey: thread.phoneKey,
    seller,
    lead,
  }
}
