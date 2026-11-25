// ============================================================
// Pedidos recurrentes (Ola 5, migración 00234)
// ============================================================
// Una plantilla (`recurring_orders`) define el pedido fijo de
// un cliente — el caso de uso son los ~30 restaurantes con
// pedido semanal — y el barrido del cron diario genera el
// pedido REAL en `orders` (source 'recurring') el día que toca.
//
// La generación reutiliza el contrato de POST /api/orders y de
// los pedidos de WhatsApp, con las mismas invariantes:
//
// - Precios SIEMPRE de la BD al momento de generarse, incluido
//   el precio especial del cliente (customer_product_prices)
//   en las líneas sin presentación; la presentación cobra la
//   suya (00232).
// - Existencia validada (lectura temprana + RPC
//   `reserve_order_stock` autoritativa) y cantidades mín/máx
//   por producto forzadas (00229).
// - Mínimo de $500 (MIN_ORDER_MXN): si el recurrente no llega,
//   NO se crea y se avisa al staff. Nunca se ajusta en silencio.
// - Nada se cobra solo: el pedido nace `pending` con el método
//   habitual registrado y se paga por los canales de siempre
//   (SPEI, link de Stripe de la Ola 4, contra entrega). Por eso
//   'card' no es un método válido de plantilla: no hay cobro
//   automático a tarjetas guardadas.
// - Al crearse corre `runNewOrderWorkflows`: el staff recibe el
//   aviso de pedido nuevo y el cliente su confirmación por
//   WhatsApp con la plantilla de siempre.
//
// Si un ciclo no puede generar (mínimo, existencia, límites,
// artículos que ya no se venden), la plantilla registra el
// desenlace en `last_result`, avisa al staff por WhatsApp y su
// `next_run_on` avanza al siguiente ciclo: no reintenta a
// diario ni genera dos veces el mismo ciclo.
//
// Sin la migración 00234 el barrido responde `available:
// false` y no pasa nada; la tienda vende como siempre.

import { pickPreferredAddress } from "@/lib/address-book"
import { WHATSAPP_NUMBER } from "@/lib/business"
import { DELIVERY_FEE_FLAT, validDeliveryFee } from "@/lib/checkout-config"
import { MIN_ORDER_MXN } from "@/lib/commercial-facts"
import { fetchCustomerPrices } from "@/lib/customer-prices"
import { logger } from "@/lib/logger"
import { missingColumnName } from "@/lib/admin/order-selects"
import { callStockRpc, describeStockConflicts, type StockConflict } from "@/lib/order-stock"
import {
  describeQuantityViolation,
  fetchQuantityLimits,
  validateQuantityLimits,
} from "@/lib/product-quantity-limits"
import { fetchOrderVariantData, type OrderVariantRow } from "@/lib/product-variants"
import { isMissingRelationError } from "@/lib/sale-window"
import { processStockNotifications } from "@/lib/stock-notifications"
import type { createServiceClient } from "@/lib/supabase/service"
import type { Address } from "@/types"
import { sendTextMessage } from "@/lib/whatsapp"
import { runNewOrderWorkflows } from "@/lib/workflows"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

const round2 = (n: number) => Math.round(n * 100) / 100

// ============================================================
// Tipos
// ============================================================

export type RecurringFrequency = "weekly" | "biweekly" | "monthly"
export type RecurringStatus = "active" | "paused" | "cancelled"

export interface RecurringOrderItem {
  product_id: number
  variant_id: number | null
  quantity: number
}

export interface RecurringOrderRow {
  id: string
  user_id: string
  name: string | null
  items: RecurringOrderItem[]
  frequency: RecurringFrequency
  weekday: number | null
  day_of_month: number | null
  address_id: number | null
  payment_method: string
  status: RecurringStatus
  next_run_on: string
  last_run_on: string | null
  last_order_id: number | null
  last_result: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Métodos que una plantilla puede registrar como habituales (sin cobro automático). */
export const RECURRING_PAYMENT_METHODS = [
  "cash_on_delivery",
  "spei",
  "oxxo",
  "mercado_pago",
  "codi",
] as const

export const WEEKDAY_NAMES_ES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const

// ============================================================
// Calendario puro (sobre claves de día YYYY-MM-DD, sin zona:
// la clave YA es el día local; la aritmética va al mediodía UTC
// para que ningún huso la mueva de día, como delivery-days)
// ============================================================

function dayKeyToUtcNoon(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00Z`)
}

function utcNoonToDayKey(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function addDaysToKey(dayKey: string, days: number): string {
  const d = dayKeyToUtcNoon(dayKey)
  d.setUTCDate(d.getUTCDate() + days)
  return utcNoonToDayKey(d)
}

/** 0 = domingo … 6 = sábado (la convención de `weekday` en la tabla). */
export function weekdayOfKey(dayKey: string): number {
  return dayKeyToUtcNoon(dayKey).getUTCDay()
}

function addOneMonthSameDay(dayKey: string): string {
  const d = dayKeyToUtcNoon(dayKey)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return utcNoonToDayKey(d)
}

export interface RecurringSchedule {
  frequency: RecurringFrequency
  weekday: number | null
  day_of_month: number | null
}

/**
 * Primera fecha de corrida al crear (o al reanudar con la fecha
 * ya vencida): semanal/quincenal → el próximo día con ese
 * `weekday`, HOY incluido si coincide (el cron de hoy puede no
 * haber pasado); mensual → el `day_of_month` de este mes si aún
 * no pasa, si no el del mes siguiente.
 */
export function computeInitialNextRun(schedule: RecurringSchedule, todayKey: string): string {
  if (schedule.frequency === "monthly") {
    const dom = schedule.day_of_month ?? 1
    const [y, m] = todayKey.split("-").map(Number)
    const thisMonth = `${y}-${String(m).padStart(2, "0")}-${String(dom).padStart(2, "0")}`
    return thisMonth >= todayKey ? thisMonth : addOneMonthSameDay(thisMonth)
  }
  const target = schedule.weekday ?? 0
  const delta = (target - weekdayOfKey(todayKey) + 7) % 7
  return addDaysToKey(todayKey, delta)
}

/** El siguiente ciclo DESPUÉS de una fecha programada. */
export function advanceNextRun(nextRunOn: string, frequency: RecurringFrequency): string {
  if (frequency === "weekly") return addDaysToKey(nextRunOn, 7)
  if (frequency === "biweekly") return addDaysToKey(nextRunOn, 14)
  return addOneMonthSameDay(nextRunOn)
}

/**
 * Tras correr un ciclo (con el desenlace que sea), la próxima
 * fecha es el primer ciclo estrictamente posterior a hoy: si
 * el cron se atrasó, se genera UN pedido y se salta a la
 * siguiente fecha futura, sin ráfaga de atrasados.
 */
export function nextRunAfterRun(
  scheduledOn: string,
  frequency: RecurringFrequency,
  todayKey: string
): string {
  let next = advanceNextRun(scheduledOn, frequency)
  while (next <= todayKey) next = advanceNextRun(next, frequency)
  return next
}

/** Texto humano de la frecuencia, para panel y cuenta del cliente. */
export function describeRecurringSchedule(schedule: RecurringSchedule): string {
  if (schedule.frequency === "monthly") {
    return `El día ${schedule.day_of_month ?? 1} de cada mes`
  }
  const day = WEEKDAY_NAMES_ES[schedule.weekday ?? 0] ?? ""
  return schedule.frequency === "weekly" ? `Cada ${day}` : `Cada dos semanas, el ${day}`
}

// ============================================================
// Validación pura de la plantilla
// ============================================================

/**
 * Sanea el JSONB de artículos: enteros válidos, cantidad 1–99,
 * líneas repetidas (mismo producto+presentación) fusionadas
 * sumando con tope 99 — el mismo criterio que el checkout.
 */
export function validateRecurringItems(raw: unknown): RecurringOrderItem[] {
  if (!Array.isArray(raw)) return []
  const byKey = new Map<string, RecurringOrderItem>()
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const e = entry as Record<string, unknown>
    const productId = Number(e.product_id)
    const variantRaw = e.variant_id
    const variantId =
      variantRaw === null || variantRaw === undefined ? null : Number(variantRaw)
    const quantity = Number(e.quantity)
    if (!Number.isInteger(productId) || productId <= 0) continue
    if (variantId !== null && (!Number.isInteger(variantId) || variantId <= 0)) continue
    if (!Number.isInteger(quantity) || quantity < 1) continue
    const key = `${productId}:${variantId ?? 0}`
    const existing = byKey.get(key)
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + quantity)
    } else {
      byKey.set(key, {
        product_id: productId,
        variant_id: variantId,
        quantity: Math.min(99, quantity),
      })
    }
  }
  return [...byKey.values()]
}

export type RecurringTemplateInputResult =
  | {
      ok: true
      value: {
        name: string | null
        items: RecurringOrderItem[]
        frequency: RecurringFrequency
        weekday: number | null
        day_of_month: number | null
        payment_method: string
      }
    }
  | { ok: false; error: string }

/** Valida el alta/edición de una plantilla (panel). */
export function validateRecurringTemplateInput(body: {
  name?: unknown
  items?: unknown
  frequency?: unknown
  weekday?: unknown
  day_of_month?: unknown
  payment_method?: unknown
}): RecurringTemplateInputResult {
  const frequency = body.frequency
  if (frequency !== "weekly" && frequency !== "biweekly" && frequency !== "monthly") {
    return { ok: false, error: "La frecuencia debe ser semanal, quincenal o mensual" }
  }

  let weekday: number | null = null
  let dayOfMonth: number | null = null
  if (frequency === "monthly") {
    const dom = Number(body.day_of_month)
    if (!Number.isInteger(dom) || dom < 1 || dom > 28) {
      return { ok: false, error: "El día del mes debe estar entre 1 y 28" }
    }
    dayOfMonth = dom
  } else {
    const wd = Number(body.weekday)
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) {
      return { ok: false, error: "El día de la semana debe estar entre 0 (domingo) y 6 (sábado)" }
    }
    weekday = wd
  }

  const items = validateRecurringItems(body.items)
  if (items.length === 0) {
    return { ok: false, error: "La plantilla necesita al menos un artículo válido" }
  }

  const paymentMethod =
    typeof body.payment_method === "string" && body.payment_method
      ? body.payment_method
      : "cash_on_delivery"
  if (!(RECURRING_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    return {
      ok: false,
      error:
        "Método de pago habitual inválido: la recurrencia no cobra tarjetas sola (usa SPEI, contra entrega, OXXO, Mercado Pago o CoDi)",
    }
  }

  const name =
    typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : null

  return {
    ok: true,
    value: {
      name,
      items,
      frequency,
      weekday,
      day_of_month: dayOfMonth,
      payment_method: paymentMethod,
    },
  }
}

// ============================================================
// Generación del pedido de un ciclo
// ============================================================

export type GenerateRecurringResult =
  | { kind: "created"; orderId: number; subtotal: number; deliveryFee: number; total: number }
  | { kind: "below_minimum"; subtotal: number; missingAmount: number }
  | { kind: "insufficient_stock"; detail: string }
  | { kind: "quantity_violation"; detail: string }
  | { kind: "invalid_items"; detail: string }
  | { kind: "error"; detail: string }

interface DbProductRow {
  id: number
  name: string
  price: number
  sale_price: number | null
  stock_status: string
  stock_quantity: number | null
  is_visible: boolean | null
}

export async function generateRecurringOrder(
  supabase: ServiceClient,
  template: RecurringOrderRow,
  todayKey: string
): Promise<GenerateRecurringResult> {
  const items = validateRecurringItems(template.items)
  if (items.length === 0) {
    return { kind: "invalid_items", detail: "La plantilla no tiene artículos válidos" }
  }

  // ── Cliente ────────────────────────────────────────────────
  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, phone, default_city_id")
    .eq("id", template.user_id)
    .maybeSingle()
  if (profileError || !profileRow) {
    logger.error("[recurring-orders] perfil del cliente no encontrado", profileError)
    return { kind: "error", detail: "profile_not_found" }
  }
  const profile = profileRow as {
    id: string
    full_name: string | null
    phone: string | null
    default_city_id: number | null
  }

  // ── Dirección: la de la plantilla o la preferida del cliente ──
  let addressId: number | null = template.address_id
  let addressCityId: number | null = null
  if (addressId !== null) {
    const { data: addr } = await supabase
      .from("addresses")
      .select("id, city_id")
      .eq("id", addressId)
      .eq("user_id", template.user_id)
      .is("deleted_at", null)
      .maybeSingle()
    if (addr) {
      addressCityId = (addr as { city_id: number | null }).city_id
    } else {
      // La dirección de la plantilla ya no es del cliente (se
      // borró o cambió de dueño): se cae a la preferida.
      addressId = null
    }
  }
  if (addressId === null) {
    const { data: addrRows } = await supabase
      .from("addresses")
      .select("*")
      .eq("user_id", template.user_id)
      .is("deleted_at", null)
    const preferred = pickPreferredAddress((addrRows ?? []) as Address[])
    if (preferred) {
      addressId = preferred.id
      addressCityId = preferred.city_id ?? null
    }
  }

  // ── Productos frescos de la BD ─────────────────────────────
  const productIds = [...new Set(items.map((i) => i.product_id))]
  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("id, name, price, sale_price, stock_status, stock_quantity, is_visible")
    .in("id", productIds)
  if (productsError) {
    logger.error("[recurring-orders] error leyendo productos", productsError)
    return { kind: "error", detail: "products_fetch_failed" }
  }
  const dbById = new Map<number, DbProductRow>(
    ((productRows ?? []) as DbProductRow[]).map((p) => [p.id, p])
  )

  // Artículos que ya no se venden (borrados u ocultos de la tienda).
  const inactive: string[] = []
  for (const item of items) {
    const db = dbById.get(item.product_id)
    if (!db || db.is_visible === false) {
      inactive.push(`producto ${item.product_id}`)
    }
  }
  if (inactive.length > 0) {
    return {
      kind: "invalid_items",
      detail: `Artículos que ya no están en la tienda: ${inactive.join(", ")}`,
    }
  }

  // ── Presentaciones (00232) ─────────────────────────────────
  const variantData = await fetchOrderVariantData(supabase, {
    variantIds: items.filter((i) => i.variant_id).map((i) => i.variant_id as number),
    productIds,
  })
  const variantOf = (item: RecurringOrderItem): OrderVariantRow | null =>
    item.variant_id ? (variantData.byId.get(item.variant_id) ?? null) : null

  for (const item of items) {
    const db = dbById.get(item.product_id) as DbProductRow
    if (item.variant_id) {
      if (!variantData.tableAvailable) {
        return {
          kind: "invalid_items",
          detail: `La presentación de «${db.name}» ya no está disponible`,
        }
      }
      const variant = variantOf(item)
      if (!variant || variant.product_id !== item.product_id || !variant.is_active) {
        return {
          kind: "invalid_items",
          detail: `La presentación de «${db.name}» ya no está disponible`,
        }
      }
    } else if (variantData.productIdsWithVariants.has(item.product_id)) {
      return {
        kind: "invalid_items",
        detail: `«${db.name}» se vende por presentación y la plantilla no eligió una`,
      }
    }
  }

  // ── Existencia (rechazo temprano; la RPC es la autoritativa) ──
  const earlyConflicts: StockConflict[] = []
  for (const item of items) {
    const db = dbById.get(item.product_id) as DbProductRow
    const variant = variantOf(item)
    const status = variant ? variant.stock_status : db.stock_status
    const available = variant ? variant.stock_quantity : db.stock_quantity
    if (status === "out_of_stock" || (available !== null && available < item.quantity)) {
      earlyConflicts.push({
        product_id: item.product_id,
        requested: item.quantity,
        available: status === "out_of_stock" ? 0 : (available ?? 0),
      })
    }
  }
  if (earlyConflicts.length > 0) {
    const nameByProduct = new Map(items.map((i) => [i.product_id, (dbById.get(i.product_id) as DbProductRow).name]))
    return { kind: "insufficient_stock", detail: describeStockConflicts(earlyConflicts, nameByProduct) }
  }

  // ── Cantidad mín/máx por producto (00229), agrupada ────────
  const requestedByProduct = new Map<number, number>()
  for (const item of items) {
    requestedByProduct.set(item.product_id, (requestedByProduct.get(item.product_id) ?? 0) + item.quantity)
  }
  const quantityLimits = await fetchQuantityLimits(supabase, [...requestedByProduct.keys()])
  if (quantityLimits.size > 0) {
    const limitLines = [...requestedByProduct.entries()].map(([productId, quantity]) => ({
      product_id: productId,
      name: (dbById.get(productId) as DbProductRow).name,
      quantity,
    }))
    const violations = validateQuantityLimits(limitLines, quantityLimits)
    if (violations.length > 0) {
      return {
        kind: "quantity_violation",
        detail: violations.map(describeQuantityViolation).join("; "),
      }
    }
  }

  // ── Precios: BD al momento de generarse ────────────────────
  // Línea con presentación → su precio; línea estándar → precio
  // especial del cliente si lo tiene; si no, el público.
  const specialPrices = await fetchCustomerPrices(supabase, template.user_id, productIds)
  const unitPriceOf = (item: RecurringOrderItem): number => {
    const db = dbById.get(item.product_id) as DbProductRow
    const variant = variantOf(item)
    if (variant) return variant.sale_price ?? variant.price
    return specialPrices.get(item.product_id) ?? db.sale_price ?? db.price
  }
  const subtotal = round2(items.reduce((sum, i) => sum + unitPriceOf(i) * i.quantity, 0))
  const deliveryFee = validDeliveryFee(items.length, subtotal, DELIVERY_FEE_FLAT)
  const total = round2(subtotal + deliveryFee)

  // ── Mínimo de compra: no se crea ni se ajusta en silencio ──
  if (subtotal < MIN_ORDER_MXN) {
    return {
      kind: "below_minimum",
      subtotal,
      missingAmount: round2(MIN_ORDER_MXN - subtotal),
    }
  }

  // ── Tienda y ciudad (mismo criterio que WhatsApp) ──────────
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("is_active", true)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle()
  const storeId = (store as { id: number } | null)?.id ?? null

  let cityId: number | null = addressCityId ?? profile.default_city_id ?? null
  if (cityId === null && storeId !== null) {
    const { data: storeCity } = await supabase
      .from("store_cities")
      .select("city_id")
      .eq("store_id", storeId)
      .eq("is_available", true)
      .order("city_id", { ascending: true })
      .limit(1)
      .maybeSingle()
    cityId = (storeCity as { city_id: number } | null)?.city_id ?? null
  }
  if (cityId === null) {
    const { data: fallbackCity } = await supabase
      .from("cities")
      .select("id")
      .eq("slug", "chihuahua")
      .maybeSingle()
    cityId = (fallbackCity as { id: number } | null)?.id ?? null
  }
  if (cityId === null) {
    logger.error("[recurring-orders] no se pudo resolver la ciudad del pedido", {
      templateId: template.id,
    })
    return { kind: "error", detail: "no_city" }
  }

  // ── Insert del pedido ──────────────────────────────────────
  const insertOrder: Record<string, unknown> = {
    user_id: template.user_id,
    city_id: cityId,
    address_id: addressId,
    status: "pending",
    subtotal,
    delivery_fee: deliveryFee,
    total,
    payment_method: template.payment_method,
    payment_status: "pending",
    priority: template.payment_method === "spei",
    scheduled_for: new Date(`${todayKey}T12:00:00-06:00`).toISOString(),
    source: "recurring",
    customer_phone: profile.phone,
  }
  if (storeId !== null) insertOrder.store_id = storeId

  const insertOrderRow = (payload: Record<string, unknown>) =>
    supabase.from("orders").insert(payload).select("id, total").single()

  // Retrocompatibilidad de esquema (patrón de POST /api/orders):
  // una columna opcional ausente se quita y se reintenta.
  let orderPayload = insertOrder
  let orderResponse = await insertOrderRow(orderPayload)
  for (let attempt = 0; attempt < 4; attempt++) {
    const missing = missingColumnName(orderResponse.error)
    if (!missing || !(missing in orderPayload)) break
    logger.warn(`orders.${missing} no existe; creando el pedido recurrente sin esa columna`)
    orderPayload = { ...orderPayload }
    delete orderPayload[missing]
    orderResponse = await insertOrderRow(orderPayload)
  }
  const { data: order, error: orderError } = orderResponse
  if (orderError || !order) {
    logger.error("[recurring-orders] order insert failed:", orderError)
    return { kind: "error", detail: "order_insert_failed" }
  }
  const orderId = (order as { id: number }).id

  // ── Ítems (las claves de presentación solo si alguna línea la trae) ──
  const anyVariant = items.some((i) => i.variant_id !== null)
  const orderItems = items.map((item) => {
    const variant = variantOf(item)
    return {
      order_id: orderId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: unitPriceOf(item),
      item_type: "standard",
      ...(anyVariant
        ? { variant_id: item.variant_id, variant_label: variant?.name ?? null }
        : {}),
    }
  })
  const { error: itemsError } = await supabase.from("order_items").insert(orderItems)
  if (itemsError) {
    logger.error("[recurring-orders] items insert failed; revirtiendo el pedido:", itemsError)
    await supabase.from("orders").delete().eq("id", orderId)
    return { kind: "error", detail: "items_insert_failed" }
  }

  // ── Reserva de inventario (la RPC manda) ───────────────────
  const stock = await callStockRpc(supabase, "reserve_order_stock", orderId)
  if (stock && stock.ok === false && stock.reason === "insufficient_stock") {
    const nameByProduct = new Map(items.map((i) => [i.product_id, (dbById.get(i.product_id) as DbProductRow).name]))
    const detail = describeStockConflicts(stock.conflicts ?? [], nameByProduct)
    await supabase.from("orders").delete().eq("id", orderId)
    logger.warn("[recurring-orders] existencia insuficiente; pedido revertido", { orderId, detail })
    return { kind: "insufficient_stock", detail }
  }

  // ── Avisos de inventario (00230, best-effort) ──────────────
  await processStockNotifications(
    supabase,
    items.map((i) => i.product_id)
  )

  // ── Avisos del pedido nuevo: staff + confirmación al cliente ──
  // El mismo pipeline de siempre (workflows): el cliente recibe
  // su confirmación por WhatsApp con la plantilla aprobada.
  try {
    await runNewOrderWorkflows(orderId)
  } catch (err) {
    logger.error("[recurring-orders] workflows del pedido nuevo fallaron (el pedido existe)", err)
  }

  logger.info("recurring.order.created", {
    templateId: template.id,
    orderId,
    subtotal,
    deliveryFee,
    total,
  })

  return { kind: "created", orderId, subtotal, deliveryFee, total }
}

// ============================================================
// Barrido del cron diario
// ============================================================

export interface RecurringSweepSummary {
  available: boolean
  processed: number
  created: number
  skipped: Array<{ templateId: string; result: string }>
}

const FAILURE_TEXT: Record<string, string> = {
  below_minimum: "no llegó al mínimo de $500",
  insufficient_stock: "faltó existencia",
  quantity_violation: "una cantidad quedó fuera del mínimo/máximo permitido",
  invalid_items: "un artículo ya no se vende como está en la plantilla",
  error: "hubo un error al generarlo",
}

/** Aviso al staff cuando un ciclo no genera su pedido (best-effort, nunca lanza). */
async function notifyStaffRecurringFailure(
  template: RecurringOrderRow,
  customerName: string | null,
  result: GenerateRecurringResult
): Promise<void> {
  const detail =
    result.kind === "below_minimum"
      ? `subtotal $${result.subtotal.toFixed(2)}, faltan $${result.missingAmount.toFixed(2)}`
      : result.kind === "insufficient_stock" ||
          result.kind === "quantity_violation" ||
          result.kind === "invalid_items"
        ? result.detail
        : result.kind
  try {
    await sendTextMessage({
      to: WHATSAPP_NUMBER,
      text:
        `⚠️ *Pedido recurrente NO generado*\n` +
        `Cliente: ${customerName ?? template.user_id}\n` +
        `Recurrencia: ${template.name ?? describeRecurringSchedule(template)}\n` +
        `Motivo: ${FAILURE_TEXT[result.kind] ?? result.kind} — ${detail}\n` +
        `Revísala en el panel: /admin/recurrentes`,
    })
  } catch (err) {
    logger.warn("[recurring-orders] aviso al staff no enviado", {
      templateId: template.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Genera los pedidos de las plantillas activas cuya fecha ya
 * llegó (`next_run_on <= hoy`). Cada plantilla procesada
 * registra su desenlace y avanza al siguiente ciclo. Sin la
 * tabla (42P01) responde `available: false` sin hacer nada.
 */
export async function runDueRecurringOrders(
  supabase: ServiceClient,
  todayKey: string
): Promise<RecurringSweepSummary> {
  const summary: RecurringSweepSummary = { available: true, processed: 0, created: 0, skipped: [] }

  const { data, error } = await supabase
    .from("recurring_orders")
    .select("*")
    .eq("status", "active")
    .lte("next_run_on", todayKey)
    .order("next_run_on", { ascending: true })
    .limit(100)

  if (error) {
    if (!isMissingRelationError(error)) {
      logger.error("[recurring-orders] error leyendo plantillas vencidas", error)
    }
    return { ...summary, available: false }
  }

  const templates = ((data ?? []) as RecurringOrderRow[]).map((t) => ({
    ...t,
    items: validateRecurringItems(t.items),
  }))

  for (const template of templates) {
    summary.processed += 1
    let result: GenerateRecurringResult
    try {
      result = await generateRecurringOrder(supabase, template, todayKey)
    } catch (err) {
      logger.error("[recurring-orders] generación inesperada falló", err)
      result = { kind: "error", detail: "unexpected" }
    }

    if (result.kind === "created") {
      summary.created += 1
    } else {
      summary.skipped.push({ templateId: template.id, result: result.kind })
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", template.user_id)
        .maybeSingle()
      await notifyStaffRecurringFailure(
        template,
        (profileRow as { full_name: string | null } | null)?.full_name ?? null,
        result
      )
    }

    const { error: updateError } = await supabase
      .from("recurring_orders")
      .update({
        last_run_on: todayKey,
        last_result: result.kind,
        ...(result.kind === "created" ? { last_order_id: result.orderId } : {}),
        next_run_on: nextRunAfterRun(template.next_run_on, template.frequency, todayKey),
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id)
    if (updateError) {
      logger.error("[recurring-orders] no se pudo avanzar la plantilla", updateError)
    }
  }

  return summary
}
