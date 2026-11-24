// ============================================================
// Pedidos de WhatsApp → pedidos de la tienda
// ============================================================
// Convierte un mensaje de pedido del catálogo de WhatsApp
// (type "order", ver src/lib/whatsapp-order-items.ts) en un pedido
// real de `orders`, visible en /admin/pedidos y en el lookup
// "mi pedido", reutilizando el contrato de POST /api/orders:
//
// - Precios y existencia se releen de la BD y se recalculan en el
//   servidor; el `item_price` de Meta nunca se cobra.
// - El envío sale de `validDeliveryFee` (gratis ≥ umbral, si no la
//   tarifa plana), igual que en el checkout web.
// - La reserva de inventario usa la misma RPC `reserve_order_stock`
//   con la misma política: conflicto real revierte el pedido; un
//   error de infraestructura NO rechaza la venta.
// - Al insertar, el trigger `process_cashback_for_order()` acredita
//   el cashback si el teléfono mapea a un perfil (consistente con
//   la web: el pedido nace sin pagar, igual que un SPEI).
//
// Lo que un pedido de WhatsApp NO trae (dirección, horario, método
// elegido) se acuerda después por chat: nace con address_id null,
// scheduled_for null y el método de pago por defecto de
// src/lib/whatsapp-order-config.ts. La dirección SÍ se captura del
// chat: ver captureWhatsAppOrderAddress más abajo.
//
// Idempotencia: Meta reintenta los webhooks. Antes de crear se
// busca el wamid en `whatsapp_messages` con `order_id` ya ligado;
// al crear se liga la fila. Un reintento devuelve "duplicate" y no
// crea un segundo pedido ni reserva stock dos veces.

import { getCachedCategories, getCachedVisibleProducts } from "@/lib/catalog-cache"
import { DELIVERY_FEE_FLAT, validDeliveryFee } from "@/lib/checkout-config"
import { logger } from "@/lib/logger"
import { missingColumnName } from "@/lib/admin/order-selects"
import { callStockRpc, describeStockConflicts, type StockConflict } from "@/lib/order-stock"
import type { createServiceClient } from "@/lib/supabase/service"
import {
  WHATSAPP_ADDRESS_CAPTURE_WINDOW_HOURS,
  WHATSAPP_ORDER_MINIMUM_MXN,
  WHATSAPP_ORDER_PAYMENT_METHOD,
  WHATSAPP_ORDER_REJECT_BELOW_MINIMUM,
} from "@/lib/whatsapp-order-config"
import { insertAddressResilient } from "@/lib/orders-address"
import {
  describeQuantityViolation,
  fetchQuantityLimits,
  validateQuantityLimits,
  type QuantityLimitViolation,
} from "@/lib/product-quantity-limits"
import { processStockNotifications } from "@/lib/stock-notifications"
import {
  buildRetailerIdIndex,
  resolveOrderItems,
  resolveRetailerId,
  type MetaOrderProductItem,
  type OrderDbProduct,
  type UnresolvedOrderItem,
} from "@/lib/whatsapp-order-items"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export interface CreateWhatsAppOrderInput {
  /** Número del cliente en formato internacional sin '+' (el `from` de Meta). */
  from: string
  /** wamid del mensaje de pedido: llave de idempotencia. */
  waMessageId: string | null
  /** `order.catalog_id` del mensaje, si Meta lo manda. */
  catalogId?: string | null
  productItems: readonly MetaOrderProductItem[]
  /** Nota opcional que el cliente adjuntó al pedido (`order.text`). */
  noteText?: string | null
}

export type CreateWhatsAppOrderResult =
  | {
      kind: "created"
      orderId: number
      subtotal: number
      deliveryFee: number
      total: number
      unresolved: UnresolvedOrderItem[]
    }
  | { kind: "duplicate"; orderId: number }
  | {
      kind: "below_minimum"
      subtotal: number
      minimum: number
      missingAmount: number
      unresolved: UnresolvedOrderItem[]
    }
  | { kind: "no_resolvable_items"; unresolved: UnresolvedOrderItem[] }
  | { kind: "insufficient_stock"; detail: string; unresolved: UnresolvedOrderItem[] }
  | {
      kind: "quantity_violation"
      detail: string
      violations: QuantityLimitViolation[]
      unresolved: UnresolvedOrderItem[]
    }
  | { kind: "error"; detail: string }

const round2 = (n: number) => Math.round(n * 100) / 100

// ============================================================
// Perfil por teléfono (últimos 10 dígitos)
// ============================================================

export interface WhatsAppProfile {
  id: string
  full_name: string | null
  phone: string | null
}

export interface FindProfileResult {
  profile: WhatsAppProfile | null
  error: { message?: string } | null
}

/**
 * Busca el perfil cuyo `profiles.phone` termina en los últimos 10
 * dígitos del número dado. Meta manda el número en formato
 * internacional sin '+' (5216141261296) y el perfil puede estar
 * como "+52 1 614..." o "6141261296": comparar por los últimos 10
 * cubre ambos formatos. Es el criterio que ya usa el lookup
 * "mi pedido" del webhook; vive aquí para no duplicarlo.
 */
export async function findProfileByPhone(
  supabase: ServiceClient,
  phone: string
): Promise<FindProfileResult> {
  const digits = phone.replace(/\D/g, "")
  const last10 = digits.slice(-10)
  if (last10.length < 10) return { profile: null, error: null }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .ilike("phone", `%${last10}`)
    .limit(1)

  if (error) return { profile: null, error }
  const row = (data ?? [])[0] as WhatsAppProfile | undefined
  return { profile: row ?? null, error: null }
}

// ============================================================
// Creación del pedido
// ============================================================

export async function createWhatsAppOrder(
  supabase: ServiceClient,
  input: CreateWhatsAppOrderInput
): Promise<CreateWhatsAppOrderResult> {
  const { from, waMessageId, catalogId, productItems } = input

  // ── Idempotencia: ¿este wamid ya creó un pedido? ──────────────
  if (waMessageId) {
    try {
      const { data: existing } = await supabase
        .from("whatsapp_messages")
        .select("id, order_id")
        .eq("message_id", waMessageId)
        .not("order_id", "is", null)
        .limit(1)
      const prior = (existing ?? [])[0] as { order_id: number } | undefined
      if (prior?.order_id) {
        logger.info("whatsapp.order.duplicate", { waMessageId, orderId: prior.order_id })
        return { kind: "duplicate", orderId: prior.order_id }
      }
    } catch (err) {
      // Si la lectura de dedupe falla se sigue: perder un pedido por
      // un error de lectura es peor que el riesgo de duplicar (el
      // staff ve ambos y cancela uno). Queda registrado.
      logger.error("WhatsApp order: dedupe lookup failed:", err)
    }
  }

  // ── Resolución retailer_id → producto ─────────────────────────
  const [products, categories] = await Promise.all([
    getCachedVisibleProducts(),
    getCachedCategories(),
  ])
  const index = buildRetailerIdIndex(products, categories)

  const candidateIds = new Set<number>()
  for (const item of productItems) {
    const product = resolveRetailerId(index, String(item.product_retailer_id ?? ""))
    if (product) candidateIds.add(product.id)
  }

  // Precios y existencia FRESCOS de la BD (espejo de POST /api/orders:
  // la capa cacheada resuelve identidad; el cobro sale de la BD).
  const dbProducts = new Map<number, OrderDbProduct>()
  if (candidateIds.size > 0) {
    const { data: dbRows, error: dbError } = await supabase
      .from("products")
      .select("id, price, sale_price, stock_status, stock_quantity")
      .in("id", [...candidateIds])
    if (dbError) {
      logger.error("WhatsApp order: products fetch failed:", dbError)
      return { kind: "error", detail: "products_fetch_failed" }
    }
    for (const row of dbRows ?? []) {
      const r = row as OrderDbProduct
      dbProducts.set(r.id, r)
    }
  }

  const resolved = resolveOrderItems(productItems, index, dbProducts)
  const unresolved = resolved.unresolved

  if (resolved.lines.length === 0) {
    logger.info("whatsapp.order.no_resolvable_items", { from, waMessageId, unresolved })
    return { kind: "no_resolvable_items", unresolved }
  }

  // ── Existencia insuficiente (rechazo temprano, como el checkout) ──
  // La verificación autoritativa es la RPC de abajo; esto evita crear
  // y borrar el pedido cuando el faltante ya se ve en la lectura.
  const earlyConflicts: StockConflict[] = []
  for (const line of resolved.lines) {
    const db = dbProducts.get(line.product_id)
    if (db && db.stock_quantity !== null && db.stock_quantity < line.quantity) {
      earlyConflicts.push({
        product_id: line.product_id,
        requested: line.quantity,
        available: db.stock_quantity,
      })
    }
  }
  if (earlyConflicts.length > 0) {
    const nameByProduct = new Map(resolved.lines.map((l) => [l.product_id, l.name]))
    return {
      kind: "insufficient_stock",
      detail: describeStockConflicts(earlyConflicts, nameByProduct),
      unresolved,
    }
  }

  // ── Cantidad mínima/máxima por producto (migración 00229) ────
  // Mismo criterio que el mínimo global de abajo y que el checkout
  // web (regla única en product-quantity-limits.ts): si una línea
  // viola el mínimo/máximo de su producto, el pedido NO se crea y
  // el webhook le dice al cliente el límite exacto para que corrija
  // su pedido en el catálogo. No se ajusta la cantidad en silencio:
  // cambiar lo pedido sin avisar vendería algo distinto de lo que
  // el cliente eligió. Sin la migración, no hay límites que forzar.
  const quantityLimits = await fetchQuantityLimits(
    supabase,
    resolved.lines.map((l) => l.product_id)
  )
  if (quantityLimits.size > 0) {
    const violations = validateQuantityLimits(resolved.lines, quantityLimits)
    if (violations.length > 0) {
      const detail = violations.map(describeQuantityViolation).join("; ")
      logger.info("whatsapp.order.quantity_violation", { from, waMessageId, detail })
      return { kind: "quantity_violation", detail, violations, unresolved }
    }
  }

  // ── Totales (fuente única: las mismas reglas del checkout) ────
  const subtotal = round2(resolved.subtotal)
  const deliveryFee = validDeliveryFee(resolved.lines.length, subtotal, DELIVERY_FEE_FLAT)
  const total = round2(subtotal + deliveryFee)

  // ── Mínimo de compra (decisión parametrizada) ─────────────────
  if (subtotal < WHATSAPP_ORDER_MINIMUM_MXN && WHATSAPP_ORDER_REJECT_BELOW_MINIMUM) {
    logger.info("whatsapp.order.below_minimum", { from, waMessageId, subtotal })
    return {
      kind: "below_minimum",
      subtotal,
      minimum: WHATSAPP_ORDER_MINIMUM_MXN,
      missingAmount: round2(WHATSAPP_ORDER_MINIMUM_MXN - subtotal),
      unresolved,
    }
  }

  // ── Cliente, tienda y ciudad ──────────────────────────────────
  const { profile, error: profileError } = await findProfileByPhone(supabase, from)
  if (profileError) {
    logger.warn("WhatsApp order: profile lookup failed; se crea como invitado", {
      message: profileError.message,
    })
  }
  const userId = profile?.id ?? null

  // Misma resolución que el checkout: primera tienda activa; si no
  // hay, se OMITE store_id y aplica el DEFAULT de la BD (00026).
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("is_active", true)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle()
  const storeId = (store as { id: number } | null)?.id ?? null

  const cityId = await resolveCityId(supabase, catalogId ?? null, storeId)
  if (cityId === null) {
    logger.error("WhatsApp order: no se pudo resolver la ciudad del pedido", {
      from,
      catalogId: catalogId ?? null,
      storeId,
    })
    return { kind: "error", detail: "no_city" }
  }

  // ── Insert del pedido ─────────────────────────────────────────
  const insertOrder: Record<string, unknown> = {
    user_id: userId,
    city_id: cityId,
    address_id: null, // la dirección se pide por chat tras crear el pedido
    status: "pending",
    subtotal,
    delivery_fee: deliveryFee,
    total,
    payment_method: WHATSAPP_ORDER_PAYMENT_METHOD,
    payment_status: "pending",
    priority: false, // solo un SPEI confirmado activa la prioridad (checkout)
    scheduled_for: null, // el horario se acuerda por chat
    source: "whatsapp",
    customer_phone: from,
  }
  if (storeId !== null) insertOrder.store_id = storeId

  const insertOrderRow = (payload: Record<string, unknown>) =>
    supabase.from("orders").insert(payload).select("id, total").single()

  // Retrocompatibilidad de esquema (mismo patrón que POST /api/orders):
  // si el esquema desplegado aún no tiene una columna opcional
  // (priority → 00220, customer_phone → 00195), se reintenta sin ella
  // en lugar de perder el pedido.
  let orderPayload = insertOrder
  let orderResponse = await insertOrderRow(orderPayload)
  for (let attempt = 0; attempt < 4; attempt++) {
    const missing = missingColumnName(orderResponse.error)
    if (!missing || !(missing in orderPayload)) break
    logger.warn(`orders.${missing} no existe; creando el pedido de WhatsApp sin esa columna`)
    orderPayload = { ...orderPayload }
    delete orderPayload[missing]
    orderResponse = await insertOrderRow(orderPayload)
  }

  const { data: order, error: orderError } = orderResponse
  if (orderError || !order) {
    logger.error("WhatsApp order: order insert failed:", orderError)
    return { kind: "error", detail: "order_insert_failed" }
  }
  const orderId = (order as { id: number }).id

  // ── Ítems (unit_price real de la BD, nunca el de Meta) ────────
  const orderItems = resolved.lines.map((line) => ({
    order_id: orderId,
    product_id: line.product_id,
    quantity: line.quantity,
    unit_price: line.unit_price,
    item_type: "standard",
  }))
  const { error: itemsError } = await supabase.from("order_items").insert(orderItems)
  if (itemsError) {
    logger.error("WhatsApp order: items insert failed; revirtiendo el pedido:", itemsError)
    await supabase.from("orders").delete().eq("id", orderId)
    return { kind: "error", detail: "items_insert_failed" }
  }

  // ── Reserva de inventario (migración 00143, política del checkout) ──
  const stock = await callStockRpc(supabase, "reserve_order_stock", orderId)
  if (stock && stock.ok === false && stock.reason === "insufficient_stock") {
    const nameByProduct = new Map(resolved.lines.map((l) => [l.product_id, l.name]))
    const detail = describeStockConflicts(stock.conflicts ?? [], nameByProduct)
    await supabase.from("orders").delete().eq("id", orderId)
    logger.warn("WhatsApp order: existencia insuficiente; pedido revertido", { orderId, detail })
    return { kind: "insufficient_stock", detail, unresolved }
  }

  // ── Avisos de inventario (migración 00230, best-effort) ──────
  // La reserva pudo dejar productos bajo su umbral: se avisa al
  // staff una vez por cruce. Nunca lanza ni bloquea el pedido.
  await processStockNotifications(
    supabase,
    resolved.lines.map((l) => l.product_id)
  )

  // ── Ligar el mensaje de WhatsApp con su pedido (bitácora) ─────
  if (waMessageId) {
    try {
      const { error: linkError } = await supabase
        .from("whatsapp_messages")
        .update({ order_id: orderId })
        .eq("message_id", waMessageId)
        .is("order_id", null)
      if (linkError) {
        logger.error("WhatsApp order: failed to link message to order:", linkError)
      }
    } catch (err) {
      logger.error("WhatsApp order: unexpected error linking message:", err)
    }
  }

  logger.info("whatsapp.order.created", {
    orderId,
    from,
    waMessageId,
    subtotal,
    deliveryFee,
    total,
    note: input.noteText ?? null,
    unresolvedCount: unresolved.length,
  })

  return { kind: "created", orderId, subtotal, deliveryFee, total, unresolved }
}

// ============================================================
// Captura de la dirección desde el chat
// ============================================================
// La confirmación del pedido le pide al cliente su dirección por el
// mismo WhatsApp. Cuando llega un texto libre y el teléfono tiene
// exactamente UN pedido de WhatsApp reciente esperando dirección,
// este módulo lo guarda como la dirección de ese pedido:
//
// - Se crea la fila en `addresses` con el mismo helper retrocompatible
//   del checkout (`insertAddressResilient`): user_id del perfil si el
//   teléfono mapea a uno; si no, dirección de invitado (user_id null).
// - El parseo a campos (calle/número/colonia/CP) es best-effort: el
//   texto llega libre. El texto ÍNTEGRO del cliente se conserva en
//   `references`, que es lo que lee quien despacha, para que ningún
//   dato se pierda si el parseo no acierta.
// - El UPDATE del pedido es condicional (`address_id IS NULL`): si
//   dos mensajes llegan a la vez, solo el primero liga la dirección.

export interface ParsedWhatsAppAddress {
  street: string
  number: string
  neighborhood: string
  zip_code: string
  /** Texto íntegro que escribió el cliente. */
  references: string
}

/**
 * Parseo best-effort de una dirección escrita libre por WhatsApp
 * ("Calle Roble 123, Col. Centro, CP 31000, casa blanca").
 * Puro y sin I/O: lo que no se puede deducir queda vacío o "S/N",
 * y el texto completo siempre sobrevive en `references`.
 */
export function parseWhatsAppAddressText(raw: string): ParsedWhatsAppAddress {
  const text = raw.replace(/\s+/g, " ").trim()

  // CP: primer grupo de 5 dígitos (con prefijo "CP" si viene).
  let zip_code = ""
  let working = text
  const cpMatch = working.match(/(?:\bC\.?\s?P\.?\s*)?(\d{5})\b/)
  if (cpMatch) {
    zip_code = cpMatch[1] ?? ""
    working = working.replace(cpMatch[0], " ").replace(/\s+/g, " ").trim()
  }

  const segments = working
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const streetPart = segments[0] ?? working
  const neighborhood = (segments[1] ?? "").replace(/^col\.?\s*/i, "").trim()

  // Número: token final de la calle ("Av. Universidad 1234", "Calle 5 #230").
  let street = streetPart
  let number = "S/N"
  const numMatch = streetPart.match(/^(.*?)[\s#]+(\d+[A-Za-z]?)$/)
  if (numMatch && numMatch[1]?.trim() && numMatch[2]) {
    street = numMatch[1].trim()
    number = numMatch[2]
  }

  return {
    street: street || text,
    number,
    neighborhood,
    zip_code,
    references: text,
  }
}

export type CaptureWhatsAppAddressResult =
  | { kind: "captured"; orderId: number; total: number; addressText: string }
  | { kind: "none" }
  | { kind: "error"; detail: string }

interface AwaitingAddressOrder {
  id: number
  total: number
  city_id: number
  user_id: string | null
  customer_phone: string | null
}

/**
 * Si el teléfono tiene exactamente un pedido de WhatsApp reciente
 * esperando dirección, guarda `text` como su dirección y devuelve el
 * resumen para confirmar al cliente. En cualquier otro caso devuelve
 * "none" y el llamador sigue su routing normal (palabras clave/menú):
 * la captura nunca secuestra un mensaje que no es inequívoco.
 */
export async function captureWhatsAppOrderAddress(
  supabase: ServiceClient,
  input: { from: string; text: string }
): Promise<CaptureWhatsAppAddressResult> {
  const text = input.text.replace(/\s+/g, " ").trim()
  if (!text) return { kind: "none" }

  const last10 = input.from.replace(/\D/g, "").slice(-10)
  if (last10.length < 10) return { kind: "none" }

  const { profile } = await findProfileByPhone(supabase, input.from)

  const since = new Date(
    Date.now() - WHATSAPP_ADDRESS_CAPTURE_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString()
  const { data: rows, error: queryError } = await supabase
    .from("orders")
    .select("id, total, city_id, user_id, customer_phone")
    .eq("source", "whatsapp")
    .is("address_id", null)
    .not("status", "in", "(cancelled,delivered)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10)

  if (queryError) {
    logger.error("WhatsApp address capture: awaiting-orders query failed:", queryError)
    return { kind: "error", detail: "awaiting_query_failed" }
  }

  const matches = ((rows ?? []) as AwaitingAddressOrder[]).filter((o) => {
    if (o.customer_phone && o.customer_phone.replace(/\D/g, "").slice(-10) === last10) {
      return true
    }
    return profile !== null && o.user_id === profile.id
  })
  if (matches.length !== 1) return { kind: "none" }

  const order = matches[0]
  if (!order) return { kind: "none" }

  // Ciudad/estado legibles para la fila de `addresses`: los del
  // city_id del propio pedido (la tienda opera hoy solo en Chihuahua).
  let cityName = "Chihuahua"
  let cityState = "Chihuahua"
  const { data: cityRow } = await supabase
    .from("cities")
    .select("name, state")
    .eq("id", order.city_id)
    .maybeSingle()
  if (cityRow) {
    const c = cityRow as { name: string; state: string }
    cityName = c.name
    cityState = c.state
  }

  const parsed = parseWhatsAppAddressText(text)
  const { data: addr, error: addrError } = await insertAddressResilient(supabase, {
    user_id: order.user_id ?? profile?.id ?? null,
    guest_token: null,
    label: "WhatsApp",
    street: parsed.street,
    number: parsed.number,
    neighborhood: parsed.neighborhood,
    city: cityName,
    state: cityState,
    zip_code: parsed.zip_code,
    references: parsed.references,
    city_id: order.city_id,
  })
  if (addrError || !addr) {
    logger.error("WhatsApp address capture: address insert failed:", addrError)
    return { kind: "error", detail: "address_insert_failed" }
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ address_id: addr.id })
    .eq("id", order.id)
    .is("address_id", null)
    .select("id")
  if (updateError) {
    logger.error("WhatsApp address capture: order link failed:", updateError)
    return { kind: "error", detail: "order_link_failed" }
  }
  if (!updated || updated.length === 0) {
    // Otro mensaje ganó la carrera y ya ligó una dirección.
    return { kind: "none" }
  }

  logger.info("whatsapp.order.address_captured", { orderId: order.id, addressId: addr.id })
  return {
    kind: "captured",
    orderId: order.id,
    total: Number(order.total),
    addressText: text,
  }
}

/**
 * Ciudad del pedido de WhatsApp:
 * 1. La del catálogo, si el `catalog_id` del mensaje es una fila de
 *    `whatsapp_catalogs` (los catálogos de la curaduría del admin
 *    tienen ciudad propia).
 * 2. La primera ciudad disponible de la tienda activa.
 * 3. Chihuahua por slug: es la única ciudad con stock hoy y la del
 *    catálogo del feed (que no es una fila de whatsapp_catalogs).
 */
async function resolveCityId(
  supabase: ServiceClient,
  catalogId: string | null,
  storeId: number | null
): Promise<number | null> {
  if (catalogId) {
    const { data: catalogRow, error } = await supabase
      .from("whatsapp_catalogs")
      .select("city_id")
      .eq("catalog_id", catalogId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (error) {
      logger.warn("WhatsApp order: whatsapp_catalogs lookup failed", { message: error.message })
    } else if (catalogRow) {
      return (catalogRow as { city_id: number }).city_id
    }
  }

  if (storeId !== null) {
    const { data: storeCity, error } = await supabase
      .from("store_cities")
      .select("city_id")
      .eq("store_id", storeId)
      .eq("is_available", true)
      .order("city_id", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) {
      logger.warn("WhatsApp order: store_cities lookup failed", { message: error.message })
    } else if (storeCity) {
      return (storeCity as { city_id: number }).city_id
    }
  }

  const { data: fallbackCity } = await supabase
    .from("cities")
    .select("id")
    .eq("slug", "chihuahua")
    .maybeSingle()
  return (fallbackCity as { id: number } | null)?.id ?? null
}
