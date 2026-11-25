// ============================================================
// Asistente con IA para el WhatsApp de la tienda (Ola 6)
// ============================================================
// Cuando un texto libre del cliente no cae en ninguna palabra
// clave ni en un paso activo del flujo (dirección, pago,
// horario, comprobante), el webhook le pregunta a este módulo
// ANTES de caer al menú genérico. La IA responde con la capa
// compartida (src/lib/ai/llm.ts, `chatCompletionRaw`) y con un
// contexto INYECTADO y acotado: políticas reales de la tienda
// (commercial-facts), catálogo vigente con precios y
// existencias (capa cacheada) y el último pedido del cliente.
//
// REGLAS DURAS (también van en el prompt, pero la primera línea
// de defensa es este módulo, no el modelo):
// - La IA nunca toca dinero ni pedidos: no crea, no modifica,
//   no marca pagado. Solo conversa.
// - Solo afirma precios/existencias que vengan en el contexto
//   inyectado; lo que no está, «lo confirma el equipo».
// - Reclamos, pagos disputados y peticiones de humano derivan
//   SIN pasar por el modelo (detección determinista) y el bot
//   se pausa en esa conversación para que el equipo atienda
//   desde la bandeja sin pisarse.
//
// Interruptor con DEFAULT SEGURO: solo actúa si
// WHATSAPP_AI_ASSISTANT_ENABLED="true" Y la capa de IA tiene
// proveedor configurado. `chatCompletionRaw` devuelve null si
// la IA global está apagada (AI_ENABLED=false), si no hay
// llave o si la llamada falla: en todos esos casos este módulo
// devuelve { kind: "none" } y el webhook cae al menú de
// siempre. Nada de aquí lanza.

import { chatCompletionRaw } from "@/lib/ai/llm"
import { getCachedVisibleProducts } from "@/lib/catalog-cache"
import {
  CREDIT_DAYS_PROSE,
  DELIVERY_COVERAGE_PROSE,
  INVOICING,
  MIN_ORDER_MXN,
  formatMxn,
} from "@/lib/commercial-facts"
import { logger } from "@/lib/logger"
import { getSpeiAccount, formatClabe } from "@/lib/spei-account"
import { findProfileByPhone } from "@/lib/whatsapp-orders"
import { setBotPaused } from "@/lib/whatsapp-conversation-controls"
import type { createServiceClient } from "@/lib/supabase/service"
import type { Product } from "@/types"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/** Variable que enciende el asistente. Apagado salvo opt-in explícito. */
export const WHATSAPP_AI_ASSISTANT_ENV = "WHATSAPP_AI_ASSISTANT_ENABLED"

/** Respuesta máxima del asistente: conversación de WhatsApp, no un ensayo. */
export const WHATSAPP_AI_MAX_REPLY_CHARS = 1000

/** Tope de productos en el contexto (el catálogo ronda los 268). */
export const WHATSAPP_AI_MAX_CATALOG_PRODUCTS = 300

/** Tope de caracteres del bloque de catálogo dentro del prompt. */
export const WHATSAPP_AI_MAX_CATALOG_CHARS = 14_000

/** Token con el que el modelo pide derivar; jamás llega al cliente. */
const HANDOFF_TOKEN = "DERIVAR_A_HUMANO"

export function isWhatsAppAiAssistantEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[WHATSAPP_AI_ASSISTANT_ENV] === "true"
}

// ============================================================
// Derivación a humano (determinista, antes del modelo)
// ============================================================

export type HandoffReason =
  | "reclamo"
  | "pago_disputado"
  | "peticion_humano"
  | "modelo"

/** Quita acentos para que «devolución» y «devolucion» pesen igual. */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

const HANDOFF_PATTERNS: Array<{ reason: HandoffReason; patterns: string[] }> = [
  {
    reason: "peticion_humano",
    patterns: [
      "humano",
      "agente",
      "asesor",
      "operador",
      "persona real",
      "alguien real",
      "hablar con una persona",
      "hablar con alguien",
      "encargado",
      "gerente",
    ],
  },
  {
    reason: "pago_disputado",
    patterns: [
      "cobro doble",
      "doble cobro",
      "me cobraron",
      "cobro indebido",
      "cargo no reconocido",
      "no reconozco el cargo",
      "ya pague y",
      "pague y no",
      "ya transferi",
      "hice la transferencia",
    ],
  },
  {
    reason: "reclamo",
    patterns: [
      "reclamo",
      "queja",
      "quejarme",
      "devolucion",
      "devuelvan",
      "reembolso",
      "reembolsen",
      "estafa",
      "fraude",
      "profeco",
      "demanda",
      "mal servicio",
      "pesimo servicio",
      "no llego mi pedido",
      "no llego el pedido",
      "pedido no llego",
      "llego incompleto",
      "producto equivocado",
      "me falto",
      "faltaron productos",
    ],
  },
]

/**
 * ¿Este mensaje debe atenderlo una persona, sin pasar por la IA?
 * Reclamos, disputas de pago y la petición explícita de humano.
 * Devuelve el motivo o null si la IA puede atenderlo.
 */
export function detectHumanHandoff(text: string): HandoffReason | null {
  const normalized = normalizeForMatch(text)
  for (const group of HANDOFF_PATTERNS) {
    if (group.patterns.some((p) => normalized.includes(p))) return group.reason
  }
  return null
}

/** Mensaje con el que el bot se despide al derivar a un humano. */
export const WHATSAPP_AI_HANDOFF_MESSAGE =
  "Te paso con el equipo 🙋 Una persona revisa tu caso y te responde por aquí " +
  "en horario de 9:00 a 21:00. Gracias por tu paciencia."

// ============================================================
// Contexto inyectado (puro y acotado)
// ============================================================

export type AiCatalogProduct = Pick<
  Product,
  "name" | "price" | "sale_price" | "stock_status" | "has_variants" | "variant_min_price"
>

/**
 * Catálogo en líneas compactas para el prompt. Solo lo que la IA
 * puede afirmar: nombre, precio vigente y si está agotado. Se
 * corta por número de productos y por caracteres; si se cortó,
 * la nota final le dice al modelo que el catálogo sigue y que
 * lo que no vea «lo confirma el equipo».
 */
export function buildCatalogContext(products: readonly AiCatalogProduct[]): string {
  const lines: string[] = []
  let chars = 0
  let truncated = false
  for (const p of products.slice(0, WHATSAPP_AI_MAX_CATALOG_PRODUCTS)) {
    const effective = p.sale_price ?? p.price
    let line = `- ${p.name}: ${formatMxn(effective)}`
    if (p.sale_price != null && p.sale_price < p.price) {
      line += ` (oferta, precio regular ${formatMxn(p.price)})`
    }
    if (p.has_variants) {
      line += ` — se vende por presentación, desde ${formatMxn(p.variant_min_price ?? effective)}`
    }
    if (p.stock_status === "out_of_stock") line += " — AGOTADO"
    if (chars + line.length > WHATSAPP_AI_MAX_CATALOG_CHARS) {
      truncated = true
      break
    }
    lines.push(line)
    chars += line.length + 1
  }
  if (products.length > WHATSAPP_AI_MAX_CATALOG_PRODUCTS) truncated = true
  if (truncated) {
    lines.push("(El catálogo continúa: si el cliente pregunta por algo que no aparece aquí, di que lo confirmas con el equipo.)")
  }
  return lines.join("\n")
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "pendiente de confirmación",
  confirmed: "confirmado",
  preparing: "en preparación",
  out_for_delivery: "en camino",
  delivered: "entregado",
  cancelled: "cancelado",
}

export interface AiOrderContext {
  id: number
  status: string
  payment_status: string
  total: number
}

/** Una línea con el último pedido del cliente, o null si no tiene. */
export function buildOrderContext(order: AiOrderContext | null): string | null {
  if (!order) return null
  const status = ORDER_STATUS_LABEL[order.status] ?? order.status
  const payment =
    order.payment_status === "paid"
      ? "pagado"
      : order.payment_status === "pending"
        ? "pendiente de pago"
        : order.payment_status
  return `Último pedido del cliente: #${order.id}, ${status}, ${payment}, total ${formatMxn(order.total)}.`
}

/** Prompt de sistema: las reglas duras viven aquí Y en este módulo. */
export function buildWhatsAppAiSystemPrompt(): string {
  const spei = getSpeiAccount()
  return [
    "Eres el asistente de WhatsApp de Resurte.me, la central de abastos digital de " +
      `${DELIVERY_COVERAGE_PROSE}: insumos por mayoreo para restaurantes, negocios y casas.`,
    "",
    "REGLAS QUE NO PUEDES ROMPER:",
    "1. Solo afirma precios, ofertas y existencias que aparezcan EXACTAMENTE en el CONTEXTO. " +
      "Si algo no está en el contexto, di que lo confirmas con el equipo. Nunca inventes un precio ni una existencia.",
    "2. No puedes crear, modificar ni cancelar pedidos, ni registrar pagos. Para pedir, " +
      "dirige al cliente al catálogo de WhatsApp o a resurte.me.",
    `3. El pedido mínimo es ${formatMxn(MIN_ORDER_MXN)} y la entrega es el mismo día en ${DELIVERY_COVERAGE_PROSE}. ` +
      "Métodos de pago: tarjeta en la web, transferencia SPEI y efectivo contra entrega.",
    "4. No prometas descuentos, cupones, precios especiales ni crédito. El crédito " +
      `(${CREDIT_DAYS_PROSE} días) es solo para clientes frecuentes y lo aprueba el equipo.`,
    `5. Facturación: ${INVOICING} gratis a solicitud del cliente.`,
    "6. Si el cliente reclama, disputa un pago o pide hablar con una persona, responde " +
      `ÚNICAMENTE con ${HANDOFF_TOKEN} y nada más.`,
    "7. Responde en español, breve (máximo 4 líneas), amable y directo. Sin listas largas.",
    "",
    `Datos SPEI de la tienda (solo si el cliente pregunta cómo transferir): CLABE ${formatClabe(spei.clabe)}, ` +
      `${spei.banco}, beneficiario ${spei.beneficiario}, concepto = número de pedido.`,
  ].join("\n")
}

/** Prompt de usuario: contexto acotado + el mensaje del cliente. */
export function buildWhatsAppAiUserPrompt(args: {
  catalogContext: string
  orderContext: string | null
  customerName: string | null
  message: string
}): string {
  const parts = [
    "CONTEXTO (única fuente de verdad para precios y existencias):",
    args.catalogContext || "(catálogo no disponible en este momento)",
  ]
  if (args.orderContext) parts.push("", args.orderContext)
  if (args.customerName) parts.push("", `El cliente se llama ${args.customerName}.`)
  parts.push("", `Mensaje del cliente: ${args.message}`)
  return parts.join("\n")
}

/**
 * Sanea la respuesta del modelo antes de enviarla: recorta,
 * limita el largo y descarta vacíos. El token de derivación se
 * detecta ANTES de llamar a esto (ver answerWhatsAppWithAi).
 */
export function sanitizeAiReply(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (trimmed.length <= WHATSAPP_AI_MAX_REPLY_CHARS) return trimmed
  const cut = trimmed.slice(0, WHATSAPP_AI_MAX_REPLY_CHARS)
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"))
  return (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim()
}

// ============================================================
// Orquestación
// ============================================================

export type WhatsAppAiAnswer =
  | { kind: "ai"; text: string }
  | { kind: "handoff"; text: string; reason: HandoffReason }
  | { kind: "none" }

export interface WhatsAppAiDeps {
  env?: Record<string, string | undefined>
  chat?: typeof chatCompletionRaw
  loadCatalog?: () => Promise<readonly AiCatalogProduct[]>
}

const defaultDeps: Required<WhatsAppAiDeps> = {
  env: process.env,
  chat: chatCompletionRaw,
  loadCatalog: async () => {
    try {
      return await getCachedVisibleProducts()
    } catch (err) {
      logger.warn("whatsapp.ai: no se pudo cargar el catálogo para el contexto", {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  },
}

/** Último pedido del cliente (para el contexto), best-effort. */
async function fetchLastOrder(
  supabase: ServiceClient,
  userId: string
): Promise<AiOrderContext | null> {
  try {
    const { data } = await supabase
      .from("orders")
      .select("id, status, payment_status, total")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
    const row = (data ?? [])[0] as AiOrderContext | undefined
    return row ?? null
  } catch {
    return null
  }
}

/**
 * Responde un texto libre con la IA, o deriva a humano, o se
 * rinde ({ kind: "none" }) para que el webhook caiga al menú.
 * Nunca lanza y nunca toca pedidos ni dinero.
 */
export async function answerWhatsAppWithAi(
  supabase: ServiceClient,
  args: { from: string; text: string },
  overrides: WhatsAppAiDeps = {}
): Promise<WhatsAppAiAnswer> {
  const deps: Required<WhatsAppAiDeps> = { ...defaultDeps, ...overrides }

  if (!isWhatsAppAiAssistantEnabled(deps.env)) return { kind: "none" }

  // Derivación determinista: ni siquiera se gasta la llamada.
  // El bot se pausa en esta conversación para que el equipo
  // atienda sin pisarse (best-effort: sin 00235, no hay pausa
  // que encender y la derivación igual se anuncia).
  const handoff = detectHumanHandoff(args.text)
  if (handoff) {
    await setBotPaused(supabase, args.from, true, null).catch(() => null)
    return { kind: "handoff", text: WHATSAPP_AI_HANDOFF_MESSAGE, reason: handoff }
  }

  try {
    const [{ profile }, catalog] = await Promise.all([
      findProfileByPhone(supabase, args.from),
      deps.loadCatalog(),
    ])
    const lastOrder = profile ? await fetchLastOrder(supabase, profile.id) : null

    const result = await deps.chat(
      buildWhatsAppAiSystemPrompt(),
      buildWhatsAppAiUserPrompt({
        catalogContext: buildCatalogContext(catalog),
        orderContext: buildOrderContext(lastOrder),
        customerName: profile?.full_name ?? null,
        message: args.text,
      }),
      { feature: "whatsapp_atencion", maxTokens: 450, temperature: 0.3 }
    )

    if (!result) return { kind: "none" }

    if (result.text.includes(HANDOFF_TOKEN)) {
      await setBotPaused(supabase, args.from, true, null).catch(() => null)
      return { kind: "handoff", text: WHATSAPP_AI_HANDOFF_MESSAGE, reason: "modelo" }
    }

    const clean = sanitizeAiReply(result.text)
    if (!clean) return { kind: "none" }
    return { kind: "ai", text: clean }
  } catch (err) {
    logger.error("whatsapp.ai: falló la respuesta del asistente", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { kind: "none" }
  }
}
