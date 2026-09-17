/**
 * Bandeja de conversaciones de WhatsApp del panel admin de leads.
 *
 * Hasta ahora el webhook (`src/app/api/whatsapp/webhook/route.ts`) guardaba los
 * mensajes entrantes en `whatsapp_messages` y NADIE los leía: no había vista de
 * conversación en ningún lado del panel. Este módulo es la lógica pura que
 * convierte esa bitácora en una bandeja accionable.
 *
 * Dos reglas duras que viven aquí y no en la interfaz:
 *
 * 1. La ventana de 24 h de WhatsApp es un CANDADO DE SERVIDOR. Fuera de ella
 *    Meta rechaza el texto libre, así que solo se puede enviar plantilla. La
 *    interfaz no decide esto: pregunta y obedece.
 *
 * 2. Un indicador sin denominador es `null` ("no medido"), nunca 0. Un prospecto
 *    que nunca escribió no tiene "0 minutos de primera respuesta": no tiene
 *    primera respuesta. Igual que en `crm-funnel.ts`.
 *
 * Módulo puro: sin Supabase y sin React, para poder probar los bordes.
 */

import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { phoneKey, type CrmProspect } from "@/lib/crm-pipeline"

/** Ventana de atención al cliente de WhatsApp: 24 h desde el último entrante. */
export const WHATSAPP_WINDOW_HOURS = 24

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000

export type MessageDirection = "inbound" | "outbound"

/**
 * Lo mínimo que necesita la bandeja de un mensaje.
 *
 * Ojo con `from_number`: en esta tabla NO significa "de quién viene", significa
 * "con quién es la conversación". Los tres escritores guardan ahí el número del
 * CLIENTE, también en los salientes:
 *
 * - webhook entrante → el número que escribió;
 * - `send-template` y `sendTextMessage` → el destinatario;
 * - `workflows` → el destinatario.
 *
 * Las excepciones (`broadcast` escribe `"system"`, un caso escribe `"N/A"`) no
 * tienen dígitos, así que su clave es `null` y quedan fuera de la bandeja por sí
 * solas. Es un log de auditoría, no una conversación.
 */
export interface InboxMessage {
  id: number
  direction: MessageDirection
  content: string | null
  created_at: string
  message_type: string | null
  from_number: string | null
}

/**
 * Prospecto dentro de la bandeja. Ronda 7: `tags` ya forma parte del contrato
 * compartido, así que la bandeja consume `CrmProspect` sin añadir nada.
 */
export type ConversationProspect = CrmProspect

/**
 * Coacciona la dirección al enum. La columna es `message_direction`, así que un
 * valor raro solo puede venir de un dato corrupto; se trata como entrante porque
 * eso es lo conservador: un entrante exige respuesta, un saliente no.
 */
export function normalizeDirection(value: string | null | undefined): MessageDirection {
  return value === "outbound" ? "outbound" : "inbound"
}

/**
 * Ordena la conversación de más antigua a más reciente.
 *
 * Los empates de fecha conservan el orden de entrada (`sort` es estable), lo que
 * deja los mensajes guardados en el mismo instante en su orden de inserción.
 */
export function mergeTimeline<T extends InboxMessage>(messages: readonly T[]): T[] {
  return [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
}

/** El mensaje más reciente de la conversación, sea de quien sea. */
export function lastMessage<T extends InboxMessage>(messages: readonly T[]): T | null {
  const timeline = mergeTimeline(messages)
  return timeline.length > 0 ? (timeline[timeline.length - 1] ?? null) : null
}

/** Instante del último mensaje DEL CLIENTE. Es el que abre la ventana de 24 h. */
export function lastInboundAt(messages: readonly InboxMessage[]): string | null {
  let latest: string | null = null
  for (const m of messages) {
    if (m.direction !== "inbound") continue
    if (!latest || new Date(m.created_at).getTime() > new Date(latest).getTime()) {
      latest = m.created_at
    }
  }
  return latest
}

export interface WhatsAppWindowState {
  /** Dentro de la ventana se puede mandar texto libre. */
  open: boolean
  /** Cuándo se cierra (o se cerró). `null` si el cliente nunca escribió. */
  expiresAt: string | null
  /** Horas restantes, nunca negativas. `null` si no hay ventana que medir. */
  hoursLeft: number | null
}

/**
 * Estado de la ventana de 24 h.
 *
 * Sin ningún entrante la ventana está cerrada y no hay `expiresAt`: no es que se
 * haya vencido, es que nunca existió. Confundir ambos casos llevaría a pintar
 * "vencida hace 3 días" en un prospecto que jamás escribió.
 */
export function whatsappWindowState(
  messagesOrLastInbound: readonly InboxMessage[] | string | null,
  now: Date = new Date(),
): WhatsAppWindowState {
  const reference =
    typeof messagesOrLastInbound === "string" || messagesOrLastInbound === null
      ? messagesOrLastInbound
      : lastInboundAt(messagesOrLastInbound)

  if (!reference) return { open: false, expiresAt: null, hoursLeft: null }

  const expiresAtMs = new Date(reference).getTime() + WHATSAPP_WINDOW_HOURS * MS_PER_HOUR
  if (Number.isNaN(expiresAtMs)) return { open: false, expiresAt: null, hoursLeft: null }

  const remainingMs = expiresAtMs - now.getTime()
  return {
    open: remainingMs > 0,
    expiresAt: new Date(expiresAtMs).toISOString(),
    hoursLeft: Math.max(0, remainingMs / MS_PER_HOUR),
  }
}

/** Dentro de la ventana: texto libre. */
export function canSendFreeForm(state: WhatsAppWindowState): boolean {
  return state.open
}

/** Fuera de la ventana: solo plantilla aprobada por Meta. */
export function requiresTemplate(state: WhatsAppWindowState): boolean {
  return !state.open
}

/**
 * ¿La pelota está en nuestra cancha? Solo cuando el último mensaje es del
 * cliente. Una conversación vacía no "necesita respuesta": necesita existir.
 */
export function needsReply(messages: readonly InboxMessage[]): boolean {
  const last = lastMessage(messages)
  return last !== null && last.direction === "inbound"
}

/**
 * Minutos entre el primer mensaje del cliente y nuestra primera respuesta
 * POSTERIOR a ese mensaje.
 *
 * `null` si el cliente nunca escribió o si todavía no contestamos: en ambos casos
 * no hay tiempo de primera respuesta que reportar.
 */
export function firstResponseMinutes(messages: readonly InboxMessage[]): number | null {
  const timeline = mergeTimeline(messages)

  const firstInboundIndex = timeline.findIndex((m) => m.direction === "inbound")
  if (firstInboundIndex === -1) return null

  const firstInbound = timeline[firstInboundIndex]
  if (!firstInbound) return null

  const firstOutbound = timeline
    .slice(firstInboundIndex + 1)
    .find((m) => m.direction === "outbound")
  if (!firstOutbound) return null

  const minutes =
    (new Date(firstOutbound.created_at).getTime() - new Date(firstInbound.created_at).getTime()) /
    MS_PER_MINUTE

  return Number.isNaN(minutes) ? null : Math.max(0, minutes)
}

/** Bandejas de la pestaña "Bandeja", de más urgente a menos. */
export const INBOX_BUCKETS = ["sin_responder", "esperando", "ventana_cerrada"] as const
export type InboxBucket = (typeof INBOX_BUCKETS)[number]

export const INBOX_BUCKET_LABEL: Record<InboxBucket, string> = {
  sin_responder: "Sin responder",
  esperando: "Esperando respuesta",
  ventana_cerrada: "Ventana cerrada",
}

export function isInboxBucket(value: string): value is InboxBucket {
  return (INBOX_BUCKETS as readonly string[]).includes(value)
}

/**
 * Bandeja de una conversación. `null` cuando no hay ningún mensaje: un prospecto
 * sin conversación no pertenece a la bandeja, no es un caso de "ventana cerrada".
 *
 * El orden importa: un mensaje sin contestar manda sobre la ventana. Aunque la
 * ventana esté cerrada sigue siendo accionable (con plantilla), y esconderlo en
 * "ventana cerrada" perdería el aviso de que hay alguien esperando.
 */
export function inboxBucket(
  messages: readonly InboxMessage[],
  now: Date = new Date(),
): InboxBucket | null {
  if (messages.length === 0) return null
  if (needsReply(messages)) return "sin_responder"
  if (!whatsappWindowState(messages, now).open) return "ventana_cerrada"
  return "esperando"
}

/** Día local del restaurante en que cayó un mensaje. */
export function inboxDayKey(
  createdAt: string | Date,
  timezone: string | null | undefined = DEFAULT_TIMEZONE,
): string {
  const date = typeof createdAt === "string" ? new Date(createdAt) : createdAt
  return dayKeyOf(timezone, date)
}

// ============================================================
// Respuestas rápidas
// ============================================================

/** Variables que el panel sabe rellenar. Cualquier otra se deja literal. */
export const QUICK_REPLY_VARIABLES = ["nombre", "restaurante", "vendedor", "telefono"] as const
export type QuickReplyVariable = (typeof QUICK_REPLY_VARIABLES)[number]

export type QuickReplyValues = Partial<Record<QuickReplyVariable, string | null | undefined>>

const VARIABLE_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

/**
 * Nombres de variable presentes en un texto, sin repetir y en orden de aparición.
 * Sirve para avisar en el panel qué variables quedaron sin rellenar.
 */
export function quickReplyVariables(body: string): string[] {
  const found: string[] = []
  for (const match of body.matchAll(VARIABLE_RE)) {
    const name = match[1]
    if (name && !found.includes(name)) found.push(name)
  }
  return found
}

/**
 * Rellena `{{variable}}` con los valores disponibles.
 *
 * Una variable desconocida o sin valor se deja LITERAL (`{{nombre}}`). No se
 * sustituye por cadena vacía a propósito: mandar "Hola , te escribo de Resurte"
 * a un cliente es peor que mandar "Hola {{nombre}}", que al menos se ve como el
 * error de datos que es.
 */
export function renderQuickReply(body: string, values: QuickReplyValues = {}): string {
  return body.replace(VARIABLE_RE, (literal, rawName: string) => {
    const name = rawName.toLowerCase()
    const value = values[name as QuickReplyVariable]
    if (typeof value !== "string") return literal
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : literal
  })
}

/** Variables del texto que quedaron sin rellenar. Vacío = se puede enviar tal cual. */
export function unresolvedQuickReplyVariables(body: string, values: QuickReplyValues = {}): string[] {
  return quickReplyVariables(body).filter((name) => {
    const value = values[name.toLowerCase() as QuickReplyVariable]
    return typeof value !== "string" || value.trim().length === 0
  })
}

/** Valores de relleno derivados del prospecto, para no repetirlos en cada vista. */
export function quickReplyValuesFor(
  prospect: Pick<ConversationProspect, "name" | "restaurant_name" | "phone" | "whatsapp">,
  sellerName?: string | null,
): QuickReplyValues {
  return {
    nombre: prospect.name,
    restaurante: prospect.restaurant_name,
    telefono: prospect.whatsapp ?? prospect.phone,
    vendedor: sellerName ?? null,
  }
}

// ============================================================
// Secuencias de goteo
// ============================================================

/**
 * Clave de deduplicación de un envío de secuencia.
 *
 * Se registra en `whatsapp_automation_sends.dedupe_key` (columna UNIQUE de
 * 00097), así que reintentar el cron el mismo día no vuelve a escribir al
 * cliente. Incluye el paso: una secuencia de 3 pasos legítimamente envía 3 veces
 * al mismo destinatario.
 */
export function sequenceDedupeKey(
  sequenceId: number,
  prospectId: number,
  stepOrder: number,
): string {
  return `crm_sequence:${sequenceId}:${prospectId}:${stepOrder}`
}

/** Instante del siguiente paso, contando las horas de espera del paso. */
export function nextSequenceRun(from: Date | string, delayHours: number): string {
  const base = typeof from === "string" ? new Date(from) : from
  const safeDelay = Number.isFinite(delayHours) ? Math.max(0, delayHours) : 0
  return new Date(base.getTime() + safeDelay * MS_PER_HOUR).toISOString()
}

/** ¿Toca correr esta inscripción? Sin fecha programada, nunca. */
export function isSequenceStepDue(
  nextRunAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!nextRunAt) return false
  const ms = new Date(nextRunAt).getTime()
  return !Number.isNaN(ms) && ms <= now.getTime()
}

// ============================================================
// Armado de la bandeja
// ============================================================

export interface ConversationThread {
  prospect: ConversationProspect
  /** Llave de comparación de teléfono (`phoneKey`), o `null` si no hay teléfono. */
  phoneKey: string | null
  messages: InboxMessage[]
  bucket: InboxBucket | null
  window: WhatsAppWindowState
  /** Último mensaje de la conversación, para la vista de lista. */
  last: InboxMessage | null
}

/** Llave con la que se busca la conversación de un prospecto. */
export function prospectPhoneKey(
  prospect: Pick<ConversationProspect, "phone" | "whatsapp">,
): string | null {
  return phoneKey(prospect.whatsapp) ?? phoneKey(prospect.phone)
}

/**
 * Formas crudas en las que puede estar guardado un teléfono en
 * `whatsapp_messages.from_number`.
 *
 * Respaldo para entornos donde la migración 00140 todavía no está aplicada y no
 * existe la columna generada `from_digits`. Los escritores guardan dígitos
 * pelados, pero Meta entrega los móviles mexicanos con el prefijo `521`, así que
 * hay que cubrir las tres variantes. Con la columna aplicada esta lista sobra y
 * se consulta por `from_digits`.
 */
export function phoneLookupVariants(phone: string | null | undefined): string[] {
  const key = phoneKey(phone)
  if (!key) return []
  return [key, `52${key}`, `521${key}`]
}

/**
 * Índice `phoneKey → mensajes`, para resolver una página de prospectos en un paso.
 *
 * Se indexa por `phoneKey(from_number)`, que es exactamente la expresión de la
 * columna generada `whatsapp_messages.from_digits` (00140): el panel puede pedir
 * los mensajes con un `IN (...)` sobre `from_digits` y agruparlos aquí sin volver
 * a consultar. `crm-inbox.contract.test.ts` fija esa equivalencia.
 *
 * Los mensajes sin dígitos (`"system"`, `"N/A"`) no entran: no son conversación.
 */
export function indexMessagesByPhone(
  messages: readonly InboxMessage[],
): Map<string, InboxMessage[]> {
  const index = new Map<string, InboxMessage[]>()
  for (const message of messages) {
    const key = phoneKey(message.from_number)
    if (!key) continue
    const bucket = index.get(key)
    if (bucket) bucket.push(message)
    else index.set(key, [message])
  }
  return index
}

/**
 * Arma la conversación de un prospecto a partir del índice de mensajes.
 *
 * Un prospecto sin teléfono, o cuyo teléfono no coincide con ningún mensaje,
 * devuelve una conversación vacía (`bucket: null`), no un hilo inventado.
 */
export function buildThread(
  prospect: ConversationProspect,
  index: ReadonlyMap<string, readonly InboxMessage[]>,
  now: Date = new Date(),
): ConversationThread {
  const key = prospectPhoneKey(prospect)
  const messages = mergeTimeline(key ? (index.get(key) ?? []) : [])
  return {
    prospect,
    phoneKey: key,
    messages,
    bucket: inboxBucket(messages, now),
    window: whatsappWindowState(messages, now),
    last: messages.length > 0 ? (messages[messages.length - 1] ?? null) : null,
  }
}

/** Bandeja de una página completa, en el orden en que llegaron los prospectos. */
export function buildThreads(
  prospects: readonly ConversationProspect[],
  messages: readonly InboxMessage[],
  now: Date = new Date(),
): ConversationThread[] {
  const index = indexMessagesByPhone(messages)
  return prospects.map((p) => buildThread(p, index, now))
}
