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
//
// FOTOS DE PRODUCTO: el modelo cierra su respuesta con una
// línea interna `PRODUCTOS: <refs>` (la retira este módulo,
// jamás llega al cliente) con las referencias [ref: slug] de
// los productos del contexto que citó. El servidor valida cada
// referencia contra el contexto inyectado EN ESA llamada y
// devuelve las fotos a enviar (tope 3); el webhook manda el
// texto primero y las fotos después, como acompañamiento
// best-effort: si una foto falla, la respuesta ya salió.
// El pie de cada foto trae el link de la ficha y, si el
// producto se vende por kilo en caja, el total de la caja
// completa junto al precio por kilo.

import { chatCompletionRaw } from "@/lib/ai/llm"
import { getCachedVisibleProducts } from "@/lib/catalog-cache"
import { toAbsoluteImageUrl } from "@/lib/meta-feed"
import {
  CREDIT_DAYS_PROSE,
  DELIVERY_COVERAGE_PROSE,
  INVOICING,
  MIN_ORDER_MXN,
  formatMxn,
} from "@/lib/commercial-facts"
import { DEFAULT_CITY_SLUG } from "@/lib/cities"
import { logger } from "@/lib/logger"
import { boxPriceFor, type BoxPrice } from "@/lib/unit-price"
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

/** Tope de fotos que acompañan una respuesta del asistente. */
export const WHATSAPP_AI_MAX_PRODUCT_IMAGES = 3

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
  | "name"
  | "slug"
  | "image_url"
  | "price"
  | "sale_price"
  | "stock_status"
  | "has_variants"
  | "variant_min_price"
  | "unit"
>

/** Precio vigente del producto (oferta si la hay). */
function effectivePriceOf(p: AiCatalogProduct): number {
  return p.sale_price ?? p.price
}

/** Precio que acompaña la foto: en presentaciones, el «desde». */
function displayPriceOf(p: AiCatalogProduct): number {
  if (p.has_variants) return p.variant_min_price ?? effectivePriceOf(p)
  return effectivePriceOf(p)
}

export interface CatalogContextBuild {
  context: string
  /** Productos cuyas líneas SÍ entraron al contexto (tras los topes). */
  included: AiCatalogProduct[]
}

/**
 * Catálogo en líneas compactas para el prompt. Solo lo que la IA
 * puede afirmar: nombre, precio vigente y si está agotado. Si el
 * producto se vende por kilo y su nombre declara una caja, la
 * línea lo dice como tal y trae el total de la caja completa
 * (calculado en `unit-price.ts`): sin eso, el modelo presentaba
 * el precio del kilo como si fuera el de la caja. Cada
 * línea cierra con su referencia estable `[ref: slug]`: es el
 * identificador que el modelo cita en su línea PRODUCTOS para
 * que el servidor sepa qué fotos acompañan la respuesta. Se
 * corta por número de productos y por caracteres; si se cortó,
 * la nota final le dice al modelo que el catálogo sigue y que
 * lo que no vea «lo confirma el equipo». `included` trae solo
 * los productos que sobrevivieron al corte: la validación de
 * referencias se hace contra ellos, no contra el catálogo entero.
 */
export function buildCatalogContextEntries(
  products: readonly AiCatalogProduct[]
): CatalogContextBuild {
  const lines: string[] = []
  const included: AiCatalogProduct[] = []
  let chars = 0
  let truncated = false
  for (const p of products.slice(0, WHATSAPP_AI_MAX_CATALOG_PRODUCTS)) {
    const effective = effectivePriceOf(p)
    let line = `- ${p.name}: ${formatMxn(effective)}`
    if (p.sale_price != null && p.sale_price < p.price) {
      line += ` (oferta, precio regular ${formatMxn(p.price)})`
    }
    if (p.has_variants) {
      line += ` — se vende por presentación, desde ${formatMxn(p.variant_min_price ?? effective)}`
    } else {
      const box = boxPriceFor({ name: p.name, unit: p.unit, price: effective })
      if (box) {
        line += ` por kilo — la caja completa de ${box.kg} kg cuesta ${formatMxn(box.total)}`
      }
    }
    if (p.stock_status === "out_of_stock") line += " — AGOTADO"
    line += ` [ref: ${p.slug}]`
    if (chars + line.length > WHATSAPP_AI_MAX_CATALOG_CHARS) {
      truncated = true
      break
    }
    lines.push(line)
    included.push(p)
    chars += line.length + 1
  }
  if (products.length > WHATSAPP_AI_MAX_CATALOG_PRODUCTS) truncated = true
  if (truncated) {
    lines.push("(El catálogo continúa: si el cliente pregunta por algo que no aparece aquí, di que lo confirmas con el equipo.)")
  }
  return { context: lines.join("\n"), included }
}

/** Solo el texto del contexto (la validación usa la versión con `included`). */
export function buildCatalogContext(products: readonly AiCatalogProduct[]): string {
  return buildCatalogContextEntries(products).context
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
    "7. Responde en español, breve (máximo 4 líneas, sin contar la línea PRODUCTOS), amable y directo. Sin listas largas.",
    "8. Cierra SIEMPRE con una línea aparte que empiece con `PRODUCTOS:` y liste las referencias " +
      "de los productos del CONTEXTO que mencionaste en tu respuesta, en el orden en que los " +
      "mencionaste, separadas por comas y SIN los corchetes de [ref: ...]: por ejemplo " +
      "`PRODUCTOS: papa-blanca, papa-francesa-38`. Es un registro interno para adjuntar las " +
      "fotos de esos productos: no lo comentes ni lo expliques. Si no mencionaste ningún " +
      "producto, escribe `PRODUCTOS: -`.",
    "9. Si el CONTEXTO dice que un producto se vende por kilo y trae el precio de su caja " +
      "completa, cuando pregunten por la caja da el TOTAL de la caja, y cuando pregunten " +
      "por kilo da el precio por kilo. Nunca presentes el precio por kilo como si fuera " +
      "el de la caja completa.",
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
// Fotos de los productos mencionados
// ============================================================
// Contrato de salida del modelo: la respuesta cierra con una
// línea `PRODUCTOS: ref1, ref2` (regla 8 del prompt). Este
// módulo la retira del texto —el cliente nunca la ve— y valida
// cada referencia contra el contexto inyectado en ESA llamada:
// una referencia fuera del contexto se descarta en silencio.
// Si el modelo no escribe la línea o la escribe mal, no hay
// fotos y el texto sale como siempre.

const MENTION_TRAILER_RE = /^[ \t]*PRODUCTOS[ \t]*:[ \t]*(.*)$/i

/**
 * Retira la(s) línea(s) PRODUCTOS de la respuesta cruda y
 * devuelve las referencias citadas, en el orden en que el
 * modelo las escribió (sin validar todavía).
 */
export function extractMentionTrailer(text: string): { text: string; slugs: string[] } {
  const kept: string[] = []
  let payload: string | null = null
  for (const line of text.split("\n")) {
    const match = line.match(MENTION_TRAILER_RE)
    if (match) {
      if (payload === null) payload = match[1] ?? ""
      continue
    }
    kept.push(line)
  }
  if (payload === null) return { text, slugs: [] }
  const slugs = payload
    .split(",")
    .map((token) =>
      token
        .trim()
        .replace(/^[[\s`"']+/, "")
        .replace(/[\]\s`"']+$/, "")
    )
    .filter((token) => token.length > 0 && token !== "-")
  return { text: kept.join("\n"), slugs }
}

/** Link público de la ficha del producto: va en el pie de foto. */
export function productPublicUrl(slug: string): string {
  return `https://resurte.me/${DEFAULT_CITY_SLUG}/producto/${slug}`
}

/** Una foto lista para enviar: producto validado + URL directa. */
export interface AiProductImage {
  slug: string
  name: string
  /** Precio vigente que va en el pie de foto (en presentaciones, el «desde»). */
  price: number
  /** URL directa absoluta: la misma que publica el feed de Meta. */
  imageUrl: string
  /** Link público de la ficha: el pie de foto lo incluye siempre. */
  url: string
  /**
   * Caja completa si el producto se vende por kilo y su nombre
   * declara la caja (el pie de foto la cotiza junto al kilo);
   * `null` en cualquier otro caso, incluidas las presentaciones.
   */
  box: BoxPrice | null
}

/**
 * Valida las referencias citadas contra el contexto inyectado y
 * resuelve su foto. Descarta: referencias desconocidas,
 * duplicadas y productos sin imagen válida (su URL se resuelve
 * con `toAbsoluteImageUrl`, la misma del feed de Meta: directa,
 * jamás /_next/image). Tope de fotos por respuesta; un producto
 * sin imagen se salta sin consumir un lugar del tope.
 */
export function resolveAiProductImages(
  slugs: readonly string[],
  included: readonly AiCatalogProduct[]
): AiProductImage[] {
  const bySlug = new Map(included.map((p) => [p.slug, p]))
  const seen = new Set<string>()
  const images: AiProductImage[] = []
  for (const slug of slugs) {
    if (images.length >= WHATSAPP_AI_MAX_PRODUCT_IMAGES) break
    if (seen.has(slug)) continue
    seen.add(slug)
    const product = bySlug.get(slug)
    if (!product) continue
    const imageUrl = toAbsoluteImageUrl(product.image_url)
    if (!imageUrl) continue
    const price = displayPriceOf(product)
    images.push({
      slug: product.slug,
      name: product.name,
      price,
      imageUrl,
      url: productPublicUrl(product.slug),
      box: product.has_variants
        ? null
        : boxPriceFor({ name: product.name, unit: product.unit, price }),
    })
  }
  return images
}

/**
 * Pie de foto de cada imagen: «<nombre> — $<precio>» y, en la
 * línea siguiente, el link de la ficha. Si el producto se vende
 * por kilo en caja, el precio se rotula como tal y se suma el
 * total de la caja completa: el pie es lo que el cliente lee
 * junto a la foto, y sin el rótulo el kilo se leía como caja.
 */
export function buildAiProductImageCaption(product: AiProductImage): string {
  const headline = product.box
    ? `${product.name} — ${formatMxn(product.price)} por kilo · Caja completa (${product.box.kg} kg): ${formatMxn(product.box.total)}`
    : `${product.name} — ${formatMxn(product.price)}`
  return `${headline}\n${product.url}`
}

// ============================================================
// Orquestación
// ============================================================

export type WhatsAppAiAnswer =
  | { kind: "ai"; text: string; products: AiProductImage[] }
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
    const catalogBuild = buildCatalogContextEntries(catalog)

    const result = await deps.chat(
      buildWhatsAppAiSystemPrompt(),
      buildWhatsAppAiUserPrompt({
        catalogContext: catalogBuild.context,
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

    // La línea PRODUCTOS se retira ANTES de sanear: no es parte
    // de la respuesta visible. Sus referencias se validan contra
    // el contexto inyectado en esta llamada (`included`).
    const { text: visibleText, slugs } = extractMentionTrailer(result.text)
    const clean = sanitizeAiReply(visibleText)
    if (!clean) return { kind: "none" }
    const products = resolveAiProductImages(slugs, catalogBuild.included)
    return { kind: "ai", text: clean, products }
  } catch (err) {
    logger.error("whatsapp.ai: falló la respuesta del asistente", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { kind: "none" }
  }
}
