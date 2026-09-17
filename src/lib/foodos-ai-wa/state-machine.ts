/**
 * Máquina de estados del Mesero IA (Fase 2).
 *
 * Es **pura**: no toca red, ni Supabase, ni el LLM. Entra (estado, carrito,
 * texto del cliente, menú) y sale (estado, carrito, respuesta, acción).
 * Eso la hace testeable sin mocks y, sobre todo, hace imposible que el modelo
 * invente un precio: los precios solo entran por `menu.items[].price` y los
 * totales los calcula el productor único (`POST /api/foodos/orders`).
 *
 * El LLM NO decide aquí. Su papel está en `polish.ts`: reescribir el tono de
 * las respuestas conversacionales. Las respuestas que llevan **dinero**
 * (resumen y confirmación) se marcan `rephraseable: false` y se envían tal
 * cual, porque un modelo que "mejora" una cifra es un bug de cobro.
 */

import type { FoodosFulfillment, FoodosOrderItem } from "@/types/foodos"

// ============================================================
// Estados
// ============================================================

export type MeseroState =
  /** Recién llegado: aún no sabemos qué quiere. */
  | "greeting"
  /** Ya vio el menú; arma el carrito. */
  | "browsing"
  /** Tiene platillos; falta cómo lo quiere. */
  | "choosing_fulfillment"
  /** Delivery: falta la dirección. */
  | "collecting_address"
  /** Falta el nombre de quien recibe. */
  | "collecting_name"
  /** Resumen enviado; espera sí/no. */
  | "confirming"
  /** Un humano tomó la conversación; la IA no responde. */
  | "handoff"
  /** Pedido creado. */
  | "done"

/** Pregunta abierta. Permite interpretar respuestas cortas ("sí", "Ana"). */
export type MeseroQuestion =
  | "ask_intent"
  | "ask_fulfillment"
  | "ask_address"
  | "ask_name"
  | "ask_confirm"

export interface MeseroDraft {
  items: FoodosOrderItem[]
  fulfillment: FoodosFulfillment | null
  address: string | null
  name: string | null
  tableNumber: string | null
  note: string | null
}

export const EMPTY_DRAFT: MeseroDraft = {
  items: [],
  fulfillment: null,
  address: null,
  name: null,
  tableNumber: null,
  note: null,
}

export interface MeseroSession {
  state: MeseroState
  draft: MeseroDraft
  pendingQuestion: MeseroQuestion | null
}

export const NEW_SESSION: MeseroSession = {
  state: "greeting",
  draft: EMPTY_DRAFT,
  pendingQuestion: "ask_intent",
}

// ============================================================
// Menú (vista mínima que necesita la máquina)
// ============================================================

export interface MeseroMenuItem {
  id: string
  name: string
  price: number
  isAvailable: boolean
  categoryName: string | null
}

export interface MeseroMenu {
  restaurantName: string
  items: MeseroMenuItem[]
  /** URL pública para pedir sin IA (se usa en el fallback y al derivar a humano). */
  orderLink: string
  /** Símbolo de moneda para las respuestas. */
  currency?: string
}

export interface MeseroConfig {
  maxItems: number
  handoffEnabled: boolean
}

export type MeseroAction =
  | "none"
  /** La IA se detiene; el inbox atiende. */
  | "handoff"
  /** El orquestador debe crear el pedido y volver con el id. */
  | "create_order"

export interface MeseroTurn {
  state: MeseroState
  draft: MeseroDraft
  pendingQuestion: MeseroQuestion | null
  reply: string
  action: MeseroAction
  /**
   * `false` cuando la respuesta contiene precios o datos de entrega: se envía
   * literal y no pasa por el LLM.
   */
  rephraseable: boolean
}

// ============================================================
// Normalización de texto
// ============================================================

/** minúsculas, sin acentos, sin signos, espacios colapsados. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1,
  dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20,
}

/** Palabra o dígito a número. `null` si no hay ninguno. */
export function parseQuantity(token: string): number | null {
  const clean = normalize(token)
  if (!clean) return null
  if (/^\d{1,3}$/.test(clean)) {
    const n = Number(clean)
    return n > 0 ? n : null
  }
  return NUMBER_WORDS[clean] ?? null
}

// ============================================================
// Detección de intención
// ============================================================

const HANDOFF_PATTERNS = [
  "hablar con una persona", "hablar con alguien", "con un humano",
  "una persona real", "persona real", "mesero real", "atencion a clientes",
  "quiero quejarme", "queja", "reclamo", "gerente", "supervisor",
  "operador", "agente humano", "no eres un bot",
]

const CANCEL_PATTERNS = [
  "cancelar", "cancela", "olvidalo", "ya no quiero", "mejor no",
  "empezar de nuevo", "reiniciar", "borra todo", "limpia el pedido",
]

const MENU_PATTERNS = [
  "menu", "la carta", "que tienen", "que hay", "que venden",
  "opciones", "platillos", "productos", "ver el menu", "muestrame",
]

const CONFIRM_PATTERNS = [
  "si", "sii", "sip", "claro", "correcto", "confirmo", "confirmar",
  "de acuerdo", "ok", "okay", "va", "listo", "adelante", "si por favor",
  "esta bien", "perfecto", "dale", "si gracias",
]

const DENY_PATTERNS = [
  "no", "nop", "nel", "no gracias", "todavia no", "aun no", "espera",
  "no por favor", "incorrecto", "esta mal",
]

const DELIVERY_PATTERNS = ["domicilio", "envio", "enviar", "delivery", "a mi casa", "reparto", "mandalo"]
const PICKUP_PATTERNS = ["recoger", "paso por", "pickup", "para llevar", "voy por", "paso a"]
const DINE_IN_PATTERNS = ["en el local", "aqui", "mesa", "en el restaurante", "comer aqui", "dine in"]

/**
 * Una palabra suelta se compara por token completo ("va" no debe activarse con
 * "vamos"); una frase se compara por subcadena. Sin esto, "va" (confirmar)
 * haría match dentro de "vamos por la comida" (recoger).
 */
function matches(text: string, patterns: string[]): boolean {
  const words = text.split(" ")
  return patterns.some((p) => (p.includes(" ") ? text.includes(p) : words.includes(p)))
}

export type MeseroIntent =
  | "handoff"
  | "cancel"
  | "menu"
  | "confirm"
  | "deny"
  | "add_items"
  | "remove_items"
  | "fulfillment"
  | "unknown"

/**
 * Intención del mensaje. El orden importa: "no quiero nada, gracias" no debe
 * leerse como confirmación, y "hablar con una persona" gana sobre cualquier
 * coincidencia de platillo ("mesero" podría ser un platillo llamado así).
 */
export function detectIntent(text: string, menu: MeseroMenu): MeseroIntent {
  const t = normalize(text)
  if (!t) return "unknown"

  if (matches(t, HANDOFF_PATTERNS)) return "handoff"
  if (matches(t, CANCEL_PATTERNS)) return "cancel"
  if (matches(t, MENU_PATTERNS)) return "menu"
  if (matches(t, DELIVERY_PATTERNS) || matches(t, PICKUP_PATTERNS) || matches(t, DINE_IN_PATTERNS)) {
    // "quiero 2 tacos para llevar" es un pedido, no una elección de entrega.
    if (matchItems(t, menu).length === 0) return "fulfillment"
  }

  const removals = matchRemovals(t, menu)
  if (removals.length) return "remove_items"

  if (matchItems(t, menu).length) return "add_items"

  // Confirmación y negación al final: "no" dentro de un pedido ("sin cebolla")
  // ya se resolvió arriba como remove_items.
  if (matches(t, CONFIRM_PATTERNS)) return "confirm"
  if (matches(t, DENY_PATTERNS)) return "deny"

  return "unknown"
}

// ============================================================
// Coincidencia de platillos
// ============================================================

interface ItemMatch {
  item: MeseroMenuItem
  qty: number
  /** Índice del token donde empieza la coincidencia (para leer la cantidad previa). */
  at: number
}

function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean)
}

/**
 * Puntaje 0..1 de qué tan bien el texto menciona el platillo.
 *
 * Nombrar el platillo completo da 1. Nombrar solo parte cuenta si es
 * **distintivo**: "quesadilla" identifica "Quesadilla de queso" porque ninguna
 * otra línea del menú la usa, pero "tacos" NO debe identificar "Tacos de
 * suadero" cuando el cliente pidió "tacos al pastor" — la palabra aparece en
 * varias líneas y no distingue nada. Por eso un match parcial exige dos
 * palabras coincidentes o una sola que sea única en el menú.
 */
function nameScore(text: string, name: string, tokenFrequency: Map<string, number>): number {
  const n = normalize(name)
  if (!n) return 0
  if (text.includes(n)) return 1

  const nameTokens = n.split(" ").filter((w) => w.length > 2)
  if (!nameTokens.length) return 0
  const textTokens = new Set(tokens(text))
  const hits = nameTokens.filter((w) => textTokens.has(w))
  if (!hits.length) return 0

  const distinctive = hits.some((w) => (tokenFrequency.get(w) ?? 0) === 1)
  if (hits.length < 2 && !distinctive) return 0

  const ratio = hits.length / nameTokens.length
  return ratio >= 0.5 ? ratio : 0
}

/** En cuántas líneas del menú aparece cada palabra significativa. */
function tokenFrequency(menu: MeseroMenu): Map<string, number> {
  const freq = new Map<string, number>()
  for (const item of menu.items) {
    if (!item.isAvailable) continue
    const unique = new Set(normalize(item.name).split(" ").filter((w) => w.length > 2))
    for (const token of unique) freq.set(token, (freq.get(token) ?? 0) + 1)
  }
  return freq
}

/** Índices de las palabras del platillo dentro del texto. */
function nameSpan(textTokens: string[], name: string): { min: number; max: number } | null {
  const nameTokens = normalize(name).split(" ").filter((w) => w.length > 2)
  const indices = textTokens
    .map((tok, i) => (nameTokens.includes(tok) ? i : -1))
    .filter((i) => i >= 0)
  if (!indices.length) return null
  return { min: Math.min(...indices), max: Math.max(...indices) }
}

/** Platillos mencionados, con su cantidad. Ordenados de mejor a peor match. */
export function matchItems(text: string, menu: MeseroMenu): ItemMatch[] {
  const t = normalize(text)
  const textTokens = tokens(text)
  const freq = tokenFrequency(menu)

  const scored = menu.items
    .map((item) => ({ item, score: nameScore(t, item.name, freq) }))
    .filter((x) => x.score > 0 && x.item.isAvailable)
    // Empate: el nombre más largo gana ("taco al pastor" sobre "taco").
    .sort((a, b) => b.score - a.score || b.item.name.length - a.item.name.length)

  const seen = new Set<string>()
  const out: ItemMatch[] = []
  for (const { item } of scored) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    const span = nameSpan(textTokens, item.name)
    out.push({
      item,
      qty: span ? quantityNear(textTokens, span.min, span.max) : 1,
      at: span?.min ?? -1,
    })
  }
  return out
}

/**
 * Cantidad del platillo. Se busca el número pegado al nombre, antes
 * ("2 tacos", "dos tacos") o después ("tacos x3"); si no hay, se asume 1.
 */
function quantityNear(textTokens: string[], min: number, max: number): number {
  const before = min > 0 ? textTokens[min - 1] : undefined
  const after = max + 1 < textTokens.length ? textTokens[max + 1] : undefined
  for (const candidate of [before, after]) {
    if (!candidate) continue
    const n = parseQuantity(candidate.replace(/^x/, ""))
    if (n) return n
  }
  return 1
}

const REMOVE_VERBS = ["quita", "quitar", "borra", "borrar", "elimina", "eliminar", "saca"]

function matchRemovals(text: string, menu: MeseroMenu): ItemMatch[] {
  const words = normalize(text).split(" ")
  if (!REMOVE_VERBS.some((v) => words.includes(v))) return []
  return matchItems(text, menu)
}

// ============================================================
// Detección de modalidad
// ============================================================

export function detectFulfillment(text: string): FoodosFulfillment | null {
  const t = normalize(text)
  if (matches(t, DELIVERY_PATTERNS)) return "delivery"
  if (matches(t, PICKUP_PATTERNS)) return "pickup"
  if (matches(t, DINE_IN_PATTERNS)) return "dine_in"
  return null
}

// ============================================================
// Presentación
// ============================================================

export function formatMoney(amount: number, currency = "$"): string {
  return `${currency}${amount.toFixed(2)}`
}

/** Subtotal del carrito. Es solo informativo: el total real lo calcula la API. */
export function draftSubtotal(draft: MeseroDraft): number {
  return draft.items.reduce((sum, i) => sum + i.price * i.qty, 0)
}

export function describeItems(draft: MeseroDraft, currency = "$"): string {
  return draft.items
    .map((i) => `• ${i.qty}× ${i.name} — ${formatMoney(i.price * i.qty, currency)}`)
    .join("\n")
}

const FULFILLMENT_LABEL: Record<FoodosFulfillment, string> = {
  delivery: "Envío a domicilio",
  pickup: "Recoger en el local",
  dine_in: "Comer en el local",
}

// ============================================================
// Transición
// ============================================================

export interface MeseroTurnInput {
  session: MeseroSession
  text: string
  menu: MeseroMenu
  config: MeseroConfig
}

function result(
  session: MeseroSession,
  reply: string,
  action: MeseroAction = "none",
  rephraseable = true
): MeseroTurn {
  return {
    state: session.state,
    draft: session.draft,
    pendingQuestion: session.pendingQuestion,
    reply,
    action,
    rephraseable,
  }
}

function menuSnippet(menu: MeseroMenu, currency: string): string {
  const byCategory = new Map<string, MeseroMenuItem[]>()
  for (const item of menu.items) {
    if (!item.isAvailable) continue
    const key = item.categoryName ?? "Menú"
    const list = byCategory.get(key) ?? []
    list.push(item)
    byCategory.set(key, list)
  }
  const blocks: string[] = []
  for (const [category, items] of byCategory) {
    const lines = items
      .slice(0, 12)
      .map((i) => `• ${i.name} — ${formatMoney(i.price, currency)}`)
      .join("\n")
    blocks.push(`*${category}*\n${lines}`)
  }
  return blocks.join("\n\n")
}

function summarize(draft: MeseroDraft, menu: MeseroMenu, currency: string): string {
  const lines = [describeItems(draft, currency), ""]
  lines.push(`Subtotal: ${formatMoney(draftSubtotal(draft), currency)}`)
  if (draft.fulfillment) {
    lines.push(FULFILLMENT_LABEL[draft.fulfillment])
    if (draft.fulfillment === "delivery" && draft.address) {
      lines.push(`Dirección: ${draft.address}`)
    }
    if (draft.fulfillment === "dine_in" && draft.tableNumber) {
      lines.push(`Mesa: ${draft.tableNumber}`)
    }
  }
  if (draft.name) lines.push(`A nombre de: ${draft.name}`)
  lines.push("")
  lines.push("¿Confirmo tu pedido? Responde *sí* para enviarlo a cocina.")
  lines.push(`El total final (con envío, propina y cupones) se calcula al confirmar en ${menu.orderLink}`)
  return lines.join("\n")
}

/**
 * Un turno de conversación. Determinista: el mismo input da el mismo output.
 *
 * Regla de oro: cuando la respuesta lleva dinero (`rephraseable: false`), el
 * orquestador la envía literal. El LLM solo reescribe saludos, fallbacks y
 * confirmaciones de datos, nunca cifras.
 */
export function advance(input: MeseroTurnInput): MeseroTurn {
  const { session, text, menu, config } = input
  const currency = menu.currency ?? "$"
  const intent = detectIntent(text, menu)

  // Un humano ya tomó la conversación: la IA no vuelve a hablar hasta que el
  // panel la reanude. Se registra el mensaje, pero no se responde.
  if (session.state === "handoff") {
    return result(session, "", "none", false)
  }

  // --- Derivar a humano (gana sobre todo lo demás) ---
  if (intent === "handoff") {
    if (!config.handoffEnabled) {
      return result(
        { ...session, state: "browsing", pendingQuestion: "ask_intent" },
        `Puedo ayudarte por aquí. Escribe *menú* para ver los platillos o pide en ${menu.orderLink}.`
      )
    }
    return result(
      { ...session, state: "handoff", pendingQuestion: null },
      "Ya avisé a alguien del equipo, en un momento te atiende una persona. 🙋",
      "handoff"
    )
  }

  // --- Cancelar ---
  if (intent === "cancel") {
    return result(
      { ...session, state: "browsing", draft: EMPTY_DRAFT, pendingQuestion: "ask_intent" },
      "Listo, empecé de nuevo. ¿Qué te preparo? Escribe *menú* para ver las opciones."
    )
  }

  // --- Ver menú ---
  if (intent === "menu") {
    const snippet = menuSnippet(menu, currency)
    if (!snippet) {
      return result(
        { ...session, state: "browsing", pendingQuestion: "ask_intent" },
        `Ahora mismo no tenemos platillos disponibles. Puedes intentar en ${menu.orderLink}.`
      )
    }
    return result(
      { ...session, state: "browsing", pendingQuestion: "ask_intent" },
      `Este es nuestro menú:\n\n${snippet}\n\nDime qué te preparo, por ejemplo: *2 tacos al pastor*.`
    )
  }

  // --- Quitar platillos ---
  if (intent === "remove_items") {
    const removals = matchRemovals(text, menu)
    let items = [...session.draft.items]
    const removed: string[] = []
    for (const r of removals) {
      const idx = items.findIndex((i) => i.item_id === r.item.id)
      if (idx === -1) continue
      const current = items[idx]
      if (!current) continue
      const nextQty = current.qty - r.qty
      if (nextQty > 0) {
        items[idx] = { ...current, qty: nextQty }
      } else {
        items = items.filter((_, i) => i !== idx)
      }
      removed.push(current.name)
    }
    if (!removed.length) {
      return result(session, "No encontré ese platillo en tu pedido. ¿Quieres ver el menú otra vez?")
    }
    const draft = { ...session.draft, items }
    return result(
      { ...session, draft },
      `Quité ${removed.join(", ")}. ${items.length ? `Tu pedido va en ${formatMoney(draftSubtotal(draft), currency)}.` : "Tu pedido quedó vacío."}`,
      "none",
      false
    )
  }

  // --- Agregar platillos ---
  if (intent === "add_items") {
    const matches = matchItems(text, menu)
    const draft: MeseroDraft = { ...session.draft, items: [...session.draft.items] }
    const added: string[] = []

    for (const m of matches) {
      const existing = draft.items.findIndex((i) => i.item_id === m.item.id)
      if (existing === -1 && draft.items.length >= config.maxItems) break
      if (existing >= 0) {
        const current = draft.items[existing]
        if (current) draft.items[existing] = { ...current, qty: current.qty + m.qty }
      } else {
        draft.items.push({
          item_id: m.item.id,
          name: m.item.name,
          price: m.item.price,
          qty: m.qty,
          modifiers: [],
        })
      }
      added.push(`${m.qty}× ${m.item.name}`)
    }

    if (!added.length) {
      // La intención se detectó con el mismo matcher, así que llegar aquí
      // significa que se alcanzó `maxItems` sin poder agregar nada nuevo.
      return result(
        session,
        `Tu pedido ya tiene ${config.maxItems} platillos distintos, que es el máximo por WhatsApp. ` +
          `Para pedidos más grandes escríbenos por aquí y te ayudamos, o pide en ${menu.orderLink}.`
      )
    }

    const reply =
      `Agregué ${added.join(", ")}.\n\n` +
      `${describeItems(draft, currency)}\n\n` +
      `Subtotal: ${formatMoney(draftSubtotal(draft), currency)}\n\n` +
      `¿Es todo, o agrego algo más? Cuando termines escribe *listo*.`

    return result(
      { ...session, state: "browsing", draft, pendingQuestion: "ask_intent" },
      reply,
      "none",
      false
    )
  }

  // --- Modalidad de entrega ---
  if (intent === "fulfillment") {
    const fulfillment = detectFulfillment(text)
    if (!fulfillment) return result(session, "¿Lo quieres a domicilio o prefieres recogerlo?")
    const next = { ...session, draft: { ...session.draft, fulfillment } }
    if (!next.draft.items.length) {
      return result(
        { ...next, pendingQuestion: "ask_intent" },
        "Anotado. ¿Qué te preparo? Escribe *menú* para ver las opciones."
      )
    }
    return continueAfterFulfillment(next, menu, currency)
  }

  // --- Respuesta a la pregunta abierta ---
  if (session.pendingQuestion === "ask_address") {
    const next = { ...session, draft: { ...session.draft, address: text.trim() } }
    return continueAfterFulfillment(next, menu, currency)
  }

  if (session.pendingQuestion === "ask_name") {
    const draft = { ...session.draft, name: text.trim() }
    return result(
      { ...session, state: "confirming", draft, pendingQuestion: "ask_confirm" },
      summarize(draft, menu, currency),
      "none",
      false
    )
  }

  // --- Confirmar / negar ---
  if (session.state === "confirming") {
    if (intent === "confirm") {
      return result(
        { ...session, state: "done", pendingQuestion: null },
        "¡Listo! Envié tu pedido a cocina. Te aviso por aquí en cuanto esté. 👨‍🍳",
        "create_order"
      )
    }
    if (intent === "deny") {
      return result(
        { ...session, state: "browsing", pendingQuestion: "ask_intent" },
        "Sin problema, dime qué ajusto. Puedes agregar o quitar platillos, o escribir *cancelar*."
      )
    }
  }

  // --- Cerrar el pedido cuando ya hay platillos ---
  if (intent === "confirm" && session.draft.items.length) {
    return continueAfterItems(session, menu, currency)
  }

  // --- Nada entendido ---
  return result(
    session,
    session.draft.items.length
      ? "No te entendí del todo. Puedes decirme otro platillo, escribir *quitar* para corregir, o *listo* para cerrar el pedido."
      : `No te entendí del todo. Escribe *menú* para ver las opciones o pide directamente aquí: ${menu.orderLink}`
  )
}

/** Ya hay platillos: pide la modalidad que falte o sigue al nombre. */
function continueAfterItems(session: MeseroSession, menu: MeseroMenu, currency: string): MeseroTurn {
  const { draft } = session
  if (!draft.fulfillment) {
    return result(
      { ...session, state: "choosing_fulfillment", pendingQuestion: "ask_fulfillment" },
      `${describeItems(draft, currency)}\n\nSubtotal: ${formatMoney(draftSubtotal(draft), currency)}\n\n¿Lo quieres a domicilio, para recoger o comer aquí?`
    )
  }
  return continueAfterFulfillment(session, menu, currency)
}

/** Hay modalidad: pide dirección o nombre según corresponda. */
function continueAfterFulfillment(session: MeseroSession, menu: MeseroMenu, currency: string): MeseroTurn {
  const { draft } = session
  if (draft.fulfillment === "delivery" && !draft.address) {
    return result(
      { ...session, state: "collecting_address", pendingQuestion: "ask_address" },
      "¿A qué dirección lo enviamos? Incluye calle, número y colonia."
    )
  }
  if (!draft.name) {
    return result(
      { ...session, state: "collecting_name", pendingQuestion: "ask_name" },
      "¿A nombre de quién va el pedido?"
    )
  }
  return result(
    { ...session, state: "confirming", pendingQuestion: "ask_confirm" },
    summarize(draft, menu, currency),
    "none",
    false
  )
}
