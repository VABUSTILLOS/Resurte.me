// ============================================================
// Bandeja de entrada de WhatsApp de la tienda (Ola 6)
// ============================================================
// La bandeja del panel (/admin/whatsapp/bandeja) proyecta la
// MISMA bitácora que ya escribe el webhook: `whatsapp_messages`.
// No hay un segundo almacén de conversaciones (la misma regla
// que fijó la Bandeja del CRM de leads, con la que comparte
// helpers puros de src/lib/crm-inbox.ts).
//
// Convenciones de la tabla que esta bandeja respeta:
// - `from_number` es LA OTRA PARTE (el cliente) en ambas
//   direcciones; la conversación se agrupa por phoneKey
//   (últimos 10 dígitos).
// - El autor de un saliente se deduce de `message_type`:
//   `bot:ai` → asistente con IA, `bot:*` → bot de reglas,
//   `template:*` / `workflow:*` / `automation:*` → automático,
//   el resto (`text`) → una persona del equipo.
//
// Dos candados de servidor, no de interfaz (heredados del CRM):
// - La ventana de 24 h se revalida al enviar: fuera de ella
//   solo sale una plantilla aprobada por Meta.
// - La bitácora de admin (admin_audit_log) registra el envío
//   con { template, characters } y NUNCA el cuerpo del mensaje.

import { logger } from "@/lib/logger"
import { logAdminAction } from "@/lib/audit-log"
import { phoneKey } from "@/lib/crm-core"
import {
  mergeTimeline,
  needsReply,
  requiresTemplate,
  whatsappWindowState,
  phoneLookupVariants,
  type InboxMessage,
  type WhatsAppWindowState,
} from "@/lib/crm-inbox"
import {
  fetchAutomationSends,
  fetchConversationMessages,
} from "@/lib/crm-conversation"
import { findProfileByPhone } from "@/lib/whatsapp-orders"
import {
  getBotPaused,
  getPausedConversationKeys,
} from "@/lib/whatsapp-conversation-controls"
import { WORKFLOW_LABELS, type WorkflowType } from "@/lib/workflow-types"
import type { createServiceClient } from "@/lib/supabase/service"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/** Cuántos mensajes recientes alimentan la lista de conversaciones. */
export const INBOX_LIST_MESSAGE_LIMIT = 1500

// ============================================================
// Autor y texto visible de un mensaje (puro)
// ============================================================

export type WaMessageAuthor = "cliente" | "ia" | "bot" | "automatico" | "equipo"

export const WA_AUTHOR_LABEL: Record<WaMessageAuthor, string> = {
  cliente: "Cliente",
  ia: "Asistente IA",
  bot: "Bot",
  automatico: "Automático",
  equipo: "Equipo",
}

/** ¿Quién escribió este mensaje? Se deduce de direction + message_type. */
export function classifyMessageAuthor(
  message: Pick<InboxMessage, "direction" | "message_type">
): WaMessageAuthor {
  if (message.direction === "inbound") return "cliente"
  const type = message.message_type ?? ""
  if (type === "bot:ai" || type === "bot:handoff") return "ia"
  if (type.startsWith("bot:")) return "bot"
  if (
    type.startsWith("template:") ||
    type.startsWith("workflow:") ||
    type.startsWith("automation:")
  ) {
    return "automatico"
  }
  return "equipo"
}

/**
 * Texto legible de un mensaje para la bandeja. Varias filas de la
 * bitácora guardan JSON (pedidos del catálogo, plantillas,
 * workflows): se muestran como una etiqueta, no como JSON crudo.
 */
export function messageDisplayText(message: InboxMessage): string {
  const type = message.message_type ?? ""
  const content = message.content ?? ""

  if (message.direction === "inbound") {
    if (type === "incoming:order") return "🛒 Pedido enviado desde el catálogo"
    if (type === "incoming:image") return "📷 Imagen recibida"
    if (type.startsWith("incoming:")) return content || "Mensaje del cliente"
    return content || "Mensaje del cliente"
  }

  if (type.startsWith("template:")) return `📋 Plantilla: ${type.slice("template:".length)}`
  if (type.startsWith("workflow:")) {
    const key = type.slice("workflow:".length) as WorkflowType
    return `📋 ${WORKFLOW_LABELS[key] ?? `Workflow: ${key}`}`
  }
  if (type.startsWith("automation:")) {
    return `📋 Automatización: ${type.slice("automation:".length)}`
  }
  return content || "(sin texto)"
}

// ============================================================
// Lista de conversaciones
// ============================================================

export interface WaConversationSummary {
  /** Llave de la conversación (últimos 10 dígitos). */
  key: string
  /** Número tal como quedó guardado en el mensaje más reciente. */
  phone: string
  /** Nombre del perfil si el teléfono está registrado. */
  name: string | null
  lastText: string
  lastAt: string
  lastDirection: "inbound" | "outbound"
  lastAuthor: WaMessageAuthor
  /** El último mensaje es del cliente: la pelota está de este lado. */
  needsReply: boolean
  windowOpen: boolean
  botPaused: boolean
}

interface RawMessageRow {
  id: number
  from_number: string | null
  message_type: string | null
  content: string | null
  direction: string | null
  created_at: string
}

function toInboxMessage(row: RawMessageRow): InboxMessage {
  return {
    id: Number(row.id),
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    content: row.content ?? null,
    created_at: String(row.created_at),
    message_type: row.message_type ?? null,
    from_number: row.from_number ?? null,
  }
}

/**
 * Arma los resúmenes de conversación desde las filas crudas
 * (puro): agrupa por phoneKey, ordena por mensaje más reciente
 * y deriva estado de ventana/necesidad de respuesta con los
 * helpers del CRM.
 */
export function buildConversationSummaries(
  rows: readonly RawMessageRow[],
  pausedKeys: ReadonlySet<string>,
  profileNames: ReadonlyMap<string, string>,
  now: Date = new Date()
): WaConversationSummary[] {
  const byKey = new Map<string, { phone: string; messages: InboxMessage[] }>()
  for (const row of rows) {
    const key = phoneKey(row.from_number)
    if (!key) continue
    const bucket = byKey.get(key)
    const message = toInboxMessage(row)
    if (bucket) bucket.messages.push(message)
    else byKey.set(key, { phone: row.from_number as string, messages: [message] })
  }

  const summaries: WaConversationSummary[] = []
  for (const [key, { phone, messages }] of byKey) {
    const timeline = mergeTimeline(messages)
    const last = timeline[timeline.length - 1]
    if (!last) continue
    summaries.push({
      key,
      phone,
      name: profileNames.get(key) ?? null,
      lastText: messageDisplayText(last),
      lastAt: last.created_at,
      lastDirection: last.direction,
      lastAuthor: classifyMessageAuthor(last),
      needsReply: needsReply(timeline),
      windowOpen: whatsappWindowState(timeline, now).open,
      botPaused: pausedKeys.has(key),
    })
  }

  return summaries.sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
  )
}

/** Nombres de perfil por phoneKey, en lote (best-effort). */
async function fetchProfileNames(
  supabase: ServiceClient,
  keys: readonly string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (keys.length === 0) return names
  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .not("phone", "is", null)
      .limit(2000)
    for (const row of (data ?? []) as Array<{ full_name?: string | null; phone?: string | null }>) {
      const key = phoneKey(row.phone)
      if (key && keys.includes(key) && row.full_name) names.set(key, row.full_name)
    }
  } catch (err) {
    logger.warn("whatsapp.inbox: no se pudieron resolver nombres de perfil", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
  return names
}

/** Lista de conversaciones de la bandeja, recientes primero. */
export async function listWhatsAppConversations(
  supabase: ServiceClient
): Promise<WaConversationSummary[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id, from_number, message_type, content, direction, created_at")
    .order("created_at", { ascending: false })
    .limit(INBOX_LIST_MESSAGE_LIMIT)
  if (error) {
    logger.error("whatsapp.inbox: no se pudo leer whatsapp_messages", {
      error: error.message,
    })
    return []
  }
  const rows = (data ?? []) as RawMessageRow[]
  const keys = [...new Set(rows.map((r) => phoneKey(r.from_number)).filter((k): k is string => Boolean(k)))]
  const [pausedKeys, profileNames] = await Promise.all([
    getPausedConversationKeys(supabase, keys),
    fetchProfileNames(supabase, keys),
  ])
  return buildConversationSummaries(rows, pausedKeys, profileNames)
}

// ============================================================
// Detalle de una conversación
// ============================================================

export interface WaConversationDetail {
  key: string
  /** Número al que se envía (la variante más reciente del cliente). */
  phone: string
  name: string | null
  messages: Array<InboxMessage & { author: WaMessageAuthor; displayText: string }>
  window: WhatsAppWindowState
  botPaused: boolean
  /** Plantillas aprobadas disponibles para responder fuera de ventana. */
  approvedTemplates: string[]
}

/** Detalle completo de una conversación por su llave (10 dígitos). */
export async function getWhatsAppConversation(
  supabase: ServiceClient,
  key: string
): Promise<WaConversationDetail | null> {
  const variants = phoneLookupVariants(key)
  if (variants.length === 0) return null

  const [conversationMessages, automationSends, profileResult, botPaused, templatesRes] =
    await Promise.all([
      fetchConversationMessages(supabase, variants),
      fetchAutomationSends(supabase, variants),
      findProfileByPhone(supabase, key),
      getBotPaused(supabase, key),
      supabase
        .from("whatsapp_templates")
        .select("template_name")
        .eq("status", "approved")
        .order("template_name"),
    ])

  const merged = mergeTimeline([...conversationMessages, ...automationSends])
  const lastWithNumber = [...merged]
    .reverse()
    .find((m) => m.from_number && phoneKey(m.from_number) === key)

  return {
    key,
    phone: lastWithNumber?.from_number ?? variants[variants.length - 1] ?? key,
    name: profileResult.profile?.full_name ?? null,
    messages: merged.map((m) => ({
      ...m,
      author: classifyMessageAuthor(m),
      displayText: messageDisplayText(m),
    })),
    window: whatsappWindowState(conversationMessages),
    botPaused,
    approvedTemplates: (
      (templatesRes.data ?? []) as Array<{ template_name?: string }>
    )
      .map((t) => t.template_name)
      .filter((n): n is string => Boolean(n)),
  }
}

// ============================================================
// Envío desde la bandeja
// ============================================================

export type SendInboxMessageResult =
  | { ok: true; messageId: string | null }
  | {
      ok: false
      error:
        | "requires_template"
        | "empty_message"
        | "template_not_found"
        | "template_not_approved"
        | "send_failed"
    }

/**
 * Envía la respuesta de una persona del equipo en una
 * conversación. La ventana de 24 h se revalida AQUÍ (no en la
 * UI): fuera de ventana solo pasa una plantilla aprobada. El
 * envío sale por la capa de siempre (src/lib/whatsapp.ts) y se
 * persiste en whatsapp_messages como `text` / `template:<name>`
 * —las mismas convenciones del CRM— para que ambas bandejas
 * lean el mismo hilo.
 */
export async function sendWhatsAppInboxMessage(
  supabase: ServiceClient,
  args: {
    key: string
    body?: string
    templateName?: string
    actor: { id: string | null; email: string | null }
  }
): Promise<SendInboxMessageResult> {
  const variants = phoneLookupVariants(args.key)
  if (variants.length === 0) return { ok: false, error: "send_failed" }
  const to = variants[variants.length - 1] as string

  const templateName = args.templateName?.trim() || null
  let body: string | null = null

  if (templateName) {
    const { data: template, error } = await supabase
      .from("whatsapp_templates")
      .select("template_name, status")
      .eq("template_name", templateName)
      .maybeSingle()
    if (error) {
      logger.error("whatsapp.inbox: error verificando plantilla", { error: error.message })
      return { ok: false, error: "send_failed" }
    }
    if (!template) return { ok: false, error: "template_not_found" }
    if (String(template.status) !== "approved") {
      return { ok: false, error: "template_not_approved" }
    }
  } else {
    body = args.body?.trim() || null
    if (!body) return { ok: false, error: "empty_message" }
    const messages = await fetchConversationMessages(supabase, variants)
    if (requiresTemplate(whatsappWindowState(messages))) {
      return { ok: false, error: "requires_template" }
    }
  }

  const { sendTemplate, sendTextMessage } = await import("@/lib/whatsapp")
  let messageId: string | null = null
  try {
    const result = templateName
      ? await sendTemplate({ to, templateName, languageCode: "es_MX" })
      : await sendTextMessage({ to, text: body as string })
    messageId = result.messages?.[0]?.id ?? null
  } catch (err) {
    logger.error("whatsapp.inbox: falló el envío", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: "send_failed" }
  }

  // El mensaje ya salió: que la bitácora falle no lo convierte en error.
  try {
    await supabase.from("whatsapp_messages").insert({
      from_number: to,
      message_type: templateName ? `template:${templateName}` : "text",
      content: templateName
        ? JSON.stringify({
            template_name: templateName,
            language_code: "es_MX",
            message_id: messageId,
            components: [],
          })
        : (body as string),
      direction: "outbound",
      message_id: messageId,
    })
  } catch (logErr) {
    logger.error("whatsapp.inbox: el mensaje se envió pero no se pudo registrar", {
      error: logErr instanceof Error ? logErr.message : String(logErr),
    })
  }

  await logAdminAction(supabase, {
    actorId: args.actor.id,
    actorEmail: args.actor.email,
    action: "whatsapp_inbox_message",
    entity: "whatsapp_messages",
    entityId: args.key,
    // El cuerpo no entra en la bitácora: es contenido del cliente.
    detail: { template: templateName, characters: body?.length ?? null },
  })

  return { ok: true, messageId }
}
