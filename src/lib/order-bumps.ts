/**
 * Motor de order bumps condicionales (mecánica ThriveCart).
 *
 * Reglas (tabla `bump_rules`):
 *   1. perishables       → carrito con perecederos (frutas-verduras,
 *                          lacteos-huevos, carnes-aves-pescados,
 *                          panaderia-tortilleria) → empaque térmico.
 *   2. snacks_drinks     → carrito con bebidas o botanas-dulces → producto
 *                          de impulso complementario.
 *   3. subtotal_threshold → subtotal >= subtotal_min → bolsa reutilizable.
 *
 * El cliente NUNCA envía precios ni reglas: solo city_id + items del carrito.
 * Todo se deriva server-side de `bump_rules` y `products` (precios reales),
 * igual que la filosofía de `createPaymentIntentForOrder`.
 *
 * Máximo MAX_BUMPS (3) bumps simultáneos, uno por trigger_type.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { MAX_BUMPS } from "@/lib/checkout-config"
import { logger } from "@/lib/logger"

export type BumpTriggerType = "perishables" | "snacks_drinks" | "subtotal_threshold"

export interface BumpRuleRow {
  id: number
  trigger_type: BumpTriggerType
  category_slugs: string[]
  subtotal_min: number | null
  product_id: number
  title: string
  description: string
  discount_pct: number
  is_active: boolean
  display_order: number
}

export interface BumpProduct {
  id: number
  name: string
  slug: string
  description: string
  image_url: string
  price: number
  sale_price: number | null
  stock_status: "in_stock" | "low_stock" | "out_of_stock"
  category_id: number
}

/** Bump listo para el drawer (precio con descuento incluido). */
export interface OrderBump {
  ruleId: number
  trigger_type: BumpTriggerType
  title: string
  description: string
  discount_pct: number
  product: BumpProduct
  /** Precio efectivo: sale_price ?? price, con descuento aplicado. */
  price: number
  /** Precio original (antes del descuento). */
  original_price: number
}

export interface BumpCartInput {
  /** product_id del catálogo para cada item del carrito. */
  items: { product_id: number; quantity: number }[]
}

const PERISHABLE_SLUGS = [
  "frutas-verduras",
  "lacteos-huevos",
  "carnes-aves-pescados",
  "panaderia-tortilleria",
]

const IMPULSE_SLUGS = ["bebidas", "botanas-dulces"]

/** Redondea a 2 decimales (misma regla que el resto del checkout). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function effectivePrice(product: BumpProduct): number {
  return product.sale_price ?? product.price
}

function discountPrice(product: BumpProduct, discountPct: number): number {
  return round2(effectivePrice(product) * (1 - discountPct))
}

/**
 * Evalúa qué reglas de bump aplican al carrito según la lógica de categorías.
 * Devuelve los trigger_types ordenados por display_order.
 */
export function evaluateTriggerTypes(
  categorySlugsInCart: Set<string>,
  subtotal: number,
  rules: BumpRuleRow[]
): BumpTriggerType[] {
  const has = (slugs: string[]) => slugs.some((s) => categorySlugsInCart.has(s))
  const matched: BumpTriggerType[] = []

  for (const rule of rules) {
    if (!rule.is_active) continue
    let applies = false
    switch (rule.trigger_type) {
      case "perishables":
        applies = has(PERISHABLE_SLUGS)
        break
      case "snacks_drinks":
        applies = has(IMPULSE_SLUGS)
        break
      case "subtotal_threshold":
        applies = rule.subtotal_min !== null && subtotal >= rule.subtotal_min
        break
    }
    if (applies) matched.push(rule.trigger_type)
  }

  // Uno por trigger_type, máximo MAX_BUMPS, en display_order.
  return matched.slice(0, MAX_BUMPS)
}

/**
 * Carga las reglas activas desde `bump_rules` (todas; el filtro por carrito
 * ocurre en evaluateTriggerTypes). Fail-open: si la BD falla devuelve [] para
 * no bloquear el checkout.
 */
async function loadActiveRules(
  supabase: Awaited<ReturnType<typeof createServiceClient>>
): Promise<BumpRuleRow[]> {
  const { data, error } = await supabase
    .from("bump_rules")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true })

  if (error) {
    logger.warn("[BUMPS] loadActiveRules error, fail-open", { error: error.message })
    return []
  }
  return (data ?? []) as BumpRuleRow[]
}

/**
 * Resuelve los bumps condicionales para un carrito.
 * La entrada es una lista de { product_id, quantity } (sin precios del
 * cliente). Los precios se derivan de `products`.
 *
 * Excluye productos que ya están en el carrito y valida stock.
 * Retorna [] si no aplica ninguna regla o si la BD falla (fail-open).
 */
export async function resolveBumps(input: BumpCartInput): Promise<OrderBump[]> {
  if (!input.items.length) return []

  const supabase = await createServiceClient()
  const [rules, productRows] = await Promise.all([
    loadActiveRules(supabase),
    supabase
      .from("products")
      .select("id, name, slug, description, image_url, price, sale_price, stock_status, category_id")
      .in(
        "id",
        input.items.map((i) => i.product_id)
      ),
  ])

  if (productRows.error) {
    logger.warn("[BUMPS] products fetch error, fail-open", { error: productRows.error.message })
    return []
  }

  // Categorías presentes en el carrito.
  const cartProductIds = new Set(input.items.map((i) => i.product_id))
  const cartCategorySlugs = new Set<string>()
  const { data: cartCategories, error: catError } = await supabase
    .from("products")
    .select("id, category_id")
    .in("id", Array.from(cartProductIds))

  if (!catError && cartCategories) {
    const categoryIds = new Set(cartCategories.map((p) => p.category_id))
    if (categoryIds.size > 0) {
      const { data: cats } = await supabase
        .from("categories")
        .select("id, slug")
        .in("id", Array.from(categoryIds))
      for (const c of cats ?? []) {
        if (c.slug) cartCategorySlugs.add(c.slug)
      }
    }
  }

  const subtotal = (productRows.data ?? []).reduce((sum, p) => {
    const item = input.items.find((i) => i.product_id === p.id)
    return sum + (p.sale_price ?? p.price) * (item?.quantity ?? 0)
  }, 0)

  const matchedTriggers = evaluateTriggerTypes(cartCategorySlugs, subtotal, rules)
  if (matchedTriggers.length === 0) return []

  const ruleByTrigger = new Map<BumpTriggerType, BumpRuleRow>()
  for (const rule of rules) {
    if (!ruleByTrigger.has(rule.trigger_type)) ruleByTrigger.set(rule.trigger_type, rule)
  }

  const bumps: OrderBump[] = []
  for (const trigger of matchedTriggers) {
    const rule = ruleByTrigger.get(trigger)
    if (!rule) continue
    // Excluye productos ya en el carrito.
    if (cartProductIds.has(rule.product_id)) continue

    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("id, name, slug, description, image_url, price, sale_price, stock_status, category_id")
      .eq("id", rule.product_id)
      .maybeSingle()

    if (prodErr || !product) continue
    if (product.stock_status === "out_of_stock") continue

    bumps.push({
      ruleId: rule.id,
      trigger_type: rule.trigger_type,
      title: rule.title,
      description: rule.description,
      discount_pct: rule.discount_pct,
      product: product as BumpProduct,
      price: discountPrice(product as BumpProduct, rule.discount_pct),
      original_price: effectivePrice(product as BumpProduct),
    })
  }

  return bumps.slice(0, MAX_BUMPS)
}
