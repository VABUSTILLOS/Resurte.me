/**
 * Asistente de respuestas para el CRM de leads (Ronda 6, fase C9).
 *
 * Este módulo es **puro**: arma el contexto que se le manda al modelo y el
 * borrador determinista que se usa cuando no hay IA. La llamada al proveedor
 * vive en la acción del servidor, sobre `chatCompletionRaw`.
 *
 * Dos invariantes que los tests vigilan a propósito:
 *
 *   1. **Nunca auto-envía.** Aquí solo se produce texto; quien decide enviarlo
 *      es la persona, en el compositor de la bandeja.
 *   2. **Redacción antes que contexto.** Ni el teléfono ni el correo del
 *      prospecto viajan completos, y el texto libre que escribió el cliente se
 *      pasa por `redactFreeText`, que tapa cualquier teléfono o correo que
 *      haya tecleado dentro de la conversación.
 */

import type { InboxBucket } from "@/lib/crm-inbox"

/** Cuántos eventos de la conversación entran al prompt. */
export const MAX_REPLY_CONTEXT_EVENTS = 12

/** Presupuesto de caracteres del bloque de contexto. */
export const MAX_REPLY_CONTEXT_CHARS = 2400

/** Tope de caracteres por evento antes de recortar. */
export const MAX_EVENT_CHARS = 280

/** Tope del borrador que se ofrece en el compositor. */
export const MAX_REPLY_DRAFT_CHARS = 900

/** Tokens reservados para el borrador. Corto a propósito: es un mensaje de WhatsApp. */
export const REPLY_DRAFT_MAX_TOKENS = 320

export type ReplyEventKind = "inbound" | "outbound" | "activity"

export interface ReplyEvent {
  kind: ReplyEventKind
  at: string
  text: string
}

/** Datos del prospecto que sí pueden viajar al modelo. */
export interface ReplyProspectInput {
  name: string
  restaurantName?: string | null
  status: string
  tags?: readonly string[]
  nextFollowUpAt?: string | null
  sellerName?: string | null
  /** Solo se usa para redactar; nunca se imprime tal cual. */
  phone?: string | null
  email?: string | null
}

export interface ReplySignals {
  /** El último mensaje de la conversación es del cliente. */
  needsReply: boolean
  /** Horas desde ese último mensaje entrante. `null` si no hay. */
  waitingHours: number | null
  /** La ventana de 24 h está abierta: se puede responder en texto libre. */
  windowOpen: boolean
  bucket: InboxBucket | null
  /** Hay seguimiento programado. */
  followUpScheduled: boolean
}

export interface ReplyPromptContext {
  /** Bloque ya redactado y acotado, listo para el prompt. */
  text: string
  signals: ReplySignals
  /** Eventos que entraron al bloque. */
  events: number
  /** Hubo recorte por número de eventos o por longitud. */
  truncated: boolean
}

// ------------------------------------------------------------
// Redacción
// ------------------------------------------------------------

const NON_DIGITS_RE = /\D/g
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
/** Secuencias de 7+ dígitos, con separadores opcionales, en texto libre. */
const PHONE_IN_TEXT_RE = /(?:\+?\d[\d\s().-]{5,}\d)/g

/** `"5512345678"` → `"••••••78"`. `null` si no hay dígitos suficientes. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(NON_DIGITS_RE, "")
  if (digits.length < 4) return null
  return `••••••${digits.slice(-2)}`
}

/** `"ana@ejemplo.com"` → `"a•••@ejemplo.com"`. */
export function maskEmail(email: string | null | undefined): string | null {
  const value = email?.trim()
  if (!value) return null
  const at = value.indexOf("@")
  if (at <= 0 || at === value.length - 1) return "•••"
  return `${value.slice(0, 1)}•••${value.slice(at)}`
}

/**
 * Tapa teléfonos y correos dentro de texto libre. Es la defensa que importa:
 * el cliente puede escribir su número en el chat y ese texto va al prompt.
 */
export function redactFreeText(text: string): string {
  return text
    .replace(EMAIL_RE, (match) => maskEmail(match) ?? "•••")
    .replace(PHONE_IN_TEXT_RE, (match) => maskPhone(match) ?? "••••")
}

/** Una línea de contexto, en el formato que lee mejor el modelo. */
function describeEvent(event: ReplyEvent): string {
  const who =
    event.kind === "inbound"
      ? "Cliente"
      : event.kind === "outbound"
        ? "Nosotros"
        : "Nota interna"
  const body = redactFreeText(event.text.replace(/\s+/g, " ").trim()).slice(0, MAX_EVENT_CHARS)
  return `${event.at} · ${who}: ${body || "(sin texto)"}`
}

// ------------------------------------------------------------
// Contexto del prompt
// ------------------------------------------------------------

export interface BuildReplyContextOptions {
  windowOpen: boolean
  bucket: InboxBucket | null
  /** Momento de referencia; inyectable para que los tests sean deterministas. */
  now?: Date
}

function hoursBetween(fromIso: string, now: Date): number | null {
  const at = Date.parse(fromIso)
  if (Number.isNaN(at)) return null
  return Math.max(0, Math.round(((now.getTime() - at) / 3_600_000) * 10) / 10)
}

/**
 * Arma el bloque de contexto: prospecto (redactado), señales y los últimos
 * eventos de la conversación, recortados por número y por longitud.
 *
 * Los eventos se recortan **desde el final**: lo reciente es lo que decide la
 * respuesta. Si aún así no caben, se van descartando los más viejos y
 * `truncated` queda en `true` para que el llamador lo pueda decir.
 */
export function buildReplyPromptContext(
  prospect: ReplyProspectInput,
  events: readonly ReplyEvent[],
  options: BuildReplyContextOptions,
): ReplyPromptContext {
  const now = options.now ?? new Date()
  const ordered = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const tail = ordered.slice(-MAX_REPLY_CONTEXT_EVENTS)

  const lastInbound = [...tail].reverse().find((e) => e.kind === "inbound") ?? null
  const lastEvent = tail.length > 0 ? tail[tail.length - 1] : null
  const signals: ReplySignals = {
    needsReply: lastEvent?.kind === "inbound",
    waitingHours: lastInbound ? hoursBetween(lastInbound.at, now) : null,
    windowOpen: options.windowOpen,
    bucket: options.bucket,
    followUpScheduled: Boolean(prospect.nextFollowUpAt),
  }

  const tags = (prospect.tags ?? []).filter((tag) => tag.trim().length > 0)
  const header = [
    `Prospecto: ${prospect.name.trim() || "(sin nombre)"}`,
    prospect.restaurantName ? `Negocio: ${prospect.restaurantName.trim()}` : null,
    `Etapa: ${prospect.status}`,
    tags.length > 0 ? `Etiquetas: ${tags.join(", ")}` : null,
    prospect.sellerName ? `Vendedor asignado: ${prospect.sellerName}` : "Sin vendedor asignado",
    maskPhone(prospect.phone) ? `Teléfono: ${maskPhone(prospect.phone)}` : null,
    maskEmail(prospect.email) ? `Correo: ${maskEmail(prospect.email)}` : null,
    prospect.nextFollowUpAt ? `Seguimiento programado: ${prospect.nextFollowUpAt}` : null,
  ].filter((line): line is string => line !== null)

  const signalLines = [
    signals.needsReply
      ? "El cliente escribió al final: hay que responderle."
      : "El último mensaje fue nuestro: el cliente todavía no contesta.",
    signals.waitingHours !== null
      ? `Lleva esperando ${signals.waitingHours} h.`
      : "No hay mensajes entrantes registrados.",
    signals.windowOpen
      ? "La ventana de 24 h está abierta: se puede responder en texto libre."
      : "La ventana de 24 h está cerrada: solo se puede enviar una plantilla aprobada.",
  ]

  const kept: string[] = []
  let used = header.join("\n").length + signalLines.join("\n").length
  let truncated = tail.length < ordered.length

  for (let i = tail.length - 1; i >= 0; i--) {
    const event = tail[i]
    if (!event) continue
    const line = describeEvent(event)
    if (used + line.length + 1 > MAX_REPLY_CONTEXT_CHARS) {
      truncated = true
      break
    }
    kept.unshift(line)
    used += line.length + 1
  }

  const text = [
    "DATOS DEL PROSPECTO",
    ...header,
    "",
    "SITUACIÓN",
    ...signalLines,
    "",
    "CONVERSACIÓN (más antigua primero)",
    kept.length > 0 ? kept.join("\n") : "(sin mensajes todavía)",
  ].join("\n")

  return { text, signals, events: kept.length, truncated }
}

/** Instrucciones del sistema. El tono lo fija el producto, no el modelo. */
export function buildReplySystemPrompt(): string {
  return [
    "Eres un vendedor de una distribuidora de alimentos en México que ayuda a",
    "restaurantes. Escribes por WhatsApp.",
    "",
    "Reglas:",
    "- Español de México, cercano y directo. Trata de tú.",
    "- Máximo 3 frases cortas. Es un mensaje de WhatsApp, no un correo.",
    "- No inventes precios, promociones, existencias ni fechas que no estén en el contexto.",
    "- No prometas nada que no puedas cumplir y no presiones.",
    "- Una sola pregunta al final, concreta.",
    "- No incluyas teléfonos, correos ni enlaces.",
    "- Devuelve SOLO el texto del mensaje, sin comillas ni encabezados.",
  ].join("\n")
}

// ------------------------------------------------------------
// Degradación determinista
// ------------------------------------------------------------

/**
 * Borrador sin IA. No es un premio de consolación: es un mensaje que se puede
 * enviar tal cual, armado con lo que sí sabemos del prospecto.
 */
export function buildFallbackReply(
  prospect: ReplyProspectInput,
  signals: ReplySignals,
): string {
  const firstName = prospect.name.trim().split(/\s+/)[0] || "buenas"
  const business = prospect.restaurantName?.trim()
  const seller = prospect.sellerName?.trim()
  const who = seller ? `${seller}` : "el equipo"

  if (signals.needsReply) {
    const opening = `Hola ${firstName}, soy ${who}.`
    const middle = business
      ? `Gracias por escribir sobre ${business}.`
      : "Gracias por escribirnos."
    const close = signals.followUpScheduled
      ? "¿Te confirmo por aquí el seguimiento que tenemos agendado?"
      : "¿Te comparto precios y tiempos por aquí?"
    return `${opening} ${middle} ${close}`
  }

  const close = business
    ? `¿Seguimos con lo de ${business}?`
    : "¿Seguimos con lo que platicamos?"
  return `Hola ${firstName}, soy ${who}. ${close}`
}

/**
 * Limpia el borrador del modelo: quita comillas de envoltura, encabezados
 * accidentales y lo acota. Devuelve `null` si queda vacío.
 */
export function sanitizeReplyDraft(text: string): string | null {
  let clean = text.trim()
  clean = clean.replace(/^(?:borrador|respuesta|mensaje)\s*:\s*/i, "")
  clean = clean.replace(/^["'«“]+/, "").replace(/["'»”]+$/, "")
  clean = clean.trim().slice(0, MAX_REPLY_DRAFT_CHARS)
  return clean.length > 0 ? clean : null
}
