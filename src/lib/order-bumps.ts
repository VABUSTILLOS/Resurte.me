/**
 * Motor de order bumps condicionales (mecánica ThriveCart) con venta cruzada
 * inteligente por categorías, recetas y colecciones.
 *
 * Reglas (tabla `bump_rules`):
 *   1. perishables         → carrito con perecederos (frutas-verduras,
 *                            lacteos-huevos, carnes-aves-pescados,
 *                            panaderia-tortilleria) → complemento fresco.
 *   2. snacks_drinks       → carrito con bebidas o botanas-dulces → impulso.
 *   3. subtotal_threshold  → subtotal >= subtotal_min → producto de ticket alto.
 *   4. meat_bbq            → carrito con carnes → sazonador/salsa para asado.
 *   5. drinks_sides        → carrito con bebidas → botana complementaria.
 *   6. recipe_collection   → tags del carrito ∩ tags de una colección de
 *                            recetas (restaurant_collections) → ingrediente
 *                            clave faltante de esa receta.
 *
 * Estrategia híbrida:
 *   - Las reglas administradas en `bump_rules` son la fuente de verdad.
 *   - Si el carrito detecta una colección SIN regla admin, se genera un
 *     bump dinámico: el motor elige el producto complementario de esa
 *     colección (RPC get_products_by_collection) que NO esté en el carrito,
 *     con stock y visible, y lo registra como regla `recipe_collection`
 *     (idempotente, 1 por colección) para que POST /api/orders pueda
 *     validarlo igual que cualquier otro bump.
 *
 * El cliente NUNCA envía precios ni reglas: solo items del carrito. Todo se
 * deriva server-side de `bump_rules` y `products` (precios reales), igual
 * que la filosofía de `createPaymentIntentForOrder`.
 *
 * Máximo MAX_BUMPS (3) bumps simultáneos. Ranking de relevancia: recetas y
 * colecciones primero, luego categorías/umbral por display_order. Fail-open:
 * cualquier error de BD devuelve [] para no bloquear el checkout.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { MAX_BUMPS } from "@/lib/checkout-config"
import { logger } from "@/lib/logger"

export type BumpTriggerType =
  | "perishables"
  | "snacks_drinks"
  | "subtotal_threshold"
  | "meat_bbq"
  | "drinks_sides"
  | "recipe_collection"

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
  /** Slug de restaurant_collections cuando trigger_type = recipe_collection. */
  collection_slug: string | null
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
  /** Tags de recetas/colecciones (product.tags ∩ collection.tags). */
  tags?: string[]
  /** Visibilidad en catálogo público. */
  is_visible?: boolean
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
  /** true si el bump proviene de una colección/receta detectada en el carrito. */
  isRecipeMatch?: boolean
  /** Texto del badge a mostrar en BumpCards (ej. "Sugerido para tu receta / pedido"). */
  badgeLabel?: string
  /** Colección de receta que originó el bump (trigger_type = recipe_collection). */
  collection_slug?: string
}

export interface BumpCartInput {
  /** product_id del catálogo para cada item del carrito. */
  items: { product_id: number; quantity: number }[]
}

/** Colección de recetas cargada para detección por tags. */
interface CollectionRow {
  id: number
  slug: string
  name: string
  tags: unknown
  is_active: boolean
}

const PERISHABLE_SLUGS = [
  "frutas-verduras",
  "lacteos-huevos",
  "carnes-aves-pescados",
  "panaderia-tortilleria",
]

const IMPULSE_SLUGS = ["bebidas", "botanas-dulces"]

const MEAT_SLUGS = ["carnes-aves-pescados"]

const DRINKS_SLUGS = ["bebidas"]

/** Descuento por defecto para bumps dinámicos de colección (10%). */
const DYNAMIC_RECIPE_DISCOUNT = 0.1

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

/** Precio de bump a partir de un precio base y el % de descuento. */
export function bumpUnitPrice(basePrice: number, discountPct: number): number {
  return round2(basePrice * (1 - discountPct))
}

export interface BumpPricingInput {
  /** Items del pedido con item_type "bump". */
  bumpItems: { product_id: number; quantity: number }[]
  /** Precio base por producto (sale_price ?? price) desde la BD. */
  basePriceByProduct: Map<number, number>
  /** Descuentos activos por producto desde `bump_rules`. */
  discountPctByProduct: Map<number, number>
}

export type BumpPricingResult =
  | { ok: true; pricesByProduct: Map<number, number> }
  | { ok: false; missingProductId: number }

/**
 * Valida que cada bump item tenga una regla activa y calcula su precio con
 * descuento. Si algún producto no tiene regla activa, el bump se rechaza
 * (no se puede inventar un descuento). Misma fórmula que POST /api/orders.
 */
export function resolveBumpPricing(input: BumpPricingInput): BumpPricingResult {
  const pricesByProduct = new Map<number, number>()
  for (const item of input.bumpItems) {
    const base = input.basePriceByProduct.get(item.product_id)
    const discountPct = input.discountPctByProduct.get(item.product_id)
    if (base === undefined || discountPct === undefined) {
      return { ok: false, missingProductId: item.product_id }
    }
    pricesByProduct.set(item.product_id, bumpUnitPrice(base, discountPct))
  }
  return { ok: true, pricesByProduct }
}

/**
 * Evalúa qué reglas de bump aplican al carrito según la lógica de categorías
 * y colecciones detectadas. Devuelve los trigger_types ordenados por
 * display_order (los recipe_collection pueden repetirse si hay varias
 * colecciones detectadas).
 */
export function evaluateTriggerTypes(
  categorySlugsInCart: Set<string>,
  subtotal: number,
  rules: BumpRuleRow[],
  collectionSlugsInCart: Set<string> = new Set()
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
      case "meat_bbq":
        applies = has(MEAT_SLUGS)
        break
      case "drinks_sides":
        applies = has(DRINKS_SLUGS)
        break
      case "subtotal_threshold":
        applies = rule.subtotal_min !== null && subtotal >= rule.subtotal_min
        break
      case "recipe_collection":
        applies =
          rule.collection_slug !== null && collectionSlugsInCart.has(rule.collection_slug)
        break
    }
    if (applies) matched.push(rule.trigger_type)
  }

  // Máximo MAX_BUMPS en display_order (el ranking final por relevancia ocurre
  // en resolveBumps, donde las colecciones/recetas tienen prioridad).
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
 * Detecta las colecciones de recetas presentes en el carrito por intersección
 * de tags: product.tags ∩ collection.tags. Si el carrito o las colecciones no
 * tienen tags, devuelve vacío (fail-open).
 */
export function detectCollectionsInCart(
  cartProducts: Pick<BumpProduct, "tags">[],
  collections: CollectionRow[]
): Set<string> {
  const cartTags = new Set<string>()
  for (const p of cartProducts) {
    for (const t of p.tags ?? []) {
      if (typeof t === "string") cartTags.add(t)
    }
  }
  if (cartTags.size === 0) return new Set<string>()

  const detected = new Set<string>()
  for (const c of collections) {
    const tags = Array.isArray(c.tags) ? (c.tags as unknown[]) : []
    if (tags.some((t) => typeof t === "string" && cartTags.has(t))) {
      detected.add(c.slug)
    }
  }
  return detected
}

/** Producto usable: existe, visible y con stock (no out_of_stock). */
function isUsableBumpProduct(product: BumpProduct | null | undefined): product is BumpProduct {
  return (
    product !== null &&
    product !== undefined &&
    product.is_visible !== false &&
    product.stock_status !== "out_of_stock"
  )
}

function buildBump(rule: BumpRuleRow, product: BumpProduct): OrderBump {
  const isRecipe = rule.trigger_type === "recipe_collection"
  return {
    ruleId: rule.id,
    trigger_type: rule.trigger_type,
    title: rule.title,
    description: rule.description,
    discount_pct: rule.discount_pct,
    product,
    price: discountPrice(product, rule.discount_pct),
    original_price: effectivePrice(product),
    isRecipeMatch: isRecipe,
    badgeLabel: isRecipe ? "Sugerido para tu receta / pedido" : undefined,
    collection_slug: rule.collection_slug ?? undefined,
  }
}

/**
 * Resuelve los bumps condicionales para un carrito.
 * La entrada es una lista de { product_id, quantity } (sin precios del
 * cliente). Los precios se derivan de `products`.
 *
 * Excluye productos que ya están en el carrito, agotados o no visibles.
 * Retorna [] si no aplica ninguna regla o si la BD falla (fail-open).
 */
export async function resolveBumps(input: BumpCartInput): Promise<OrderBump[]> {
  if (input.items.length === 0) return []

  const supabase = await createServiceClient()
  const cartProductIds = new Set(input.items.map((i) => i.product_id))

  const [rules, productRows, collectionRows] = await Promise.all([
    loadActiveRules(supabase),
    supabase
      .from("products")
      .select(
        "id, name, slug, description, image_url, price, sale_price, stock_status, category_id, tags, is_visible"
      )
      .in("id", Array.from(cartProductIds)),
    supabase
      .from("restaurant_collections")
      .select("id, slug, name, tags, is_active")
      .eq("is_active", true),
  ])

  if (productRows.error) {
    logger.warn("[BUMPS] products fetch error, fail-open", { error: productRows.error.message })
    return []
  }

  const cartProducts = (productRows.data ?? []) as BumpProduct[]

  // Categorías presentes en el carrito (derivadas de los productos ya cargados).
  const cartCategorySlugs = new Set<string>()
  const categoryIds = new Set(cartProducts.map((p) => p.category_id))
  if (categoryIds.size > 0) {
    const { data: cats } = await supabase
      .from("categories")
      .select("id, slug")
      .in("id", Array.from(categoryIds))
    for (const c of cats ?? []) {
      if (c.slug) cartCategorySlugs.add(c.slug)
    }
  }

  const subtotal = cartProducts.reduce((sum, p) => {
    const item = input.items.find((i) => i.product_id === p.id)
    return sum + (p.sale_price ?? p.price) * (item?.quantity ?? 0)
  }, 0)

  const collections = (collectionRows.data ?? []) as CollectionRow[]
  const collectionSlugsInCart = detectCollectionsInCart(cartProducts, collections)

  const matchedTriggers = evaluateTriggerTypes(
    cartCategorySlugs,
    subtotal,
    rules,
    collectionSlugsInCart
  )
  if (matchedTriggers.length === 0 && collectionSlugsInCart.size === 0) return []

  const ruleByTrigger = new Map<BumpTriggerType, BumpRuleRow>()
  for (const rule of rules) {
    if (!ruleByTrigger.has(rule.trigger_type)) ruleByTrigger.set(rule.trigger_type, rule)
  }

  // ── 1) Candidatos de receta/colección (mayor relevancia) ──
  const recipeRules = rules.filter(
    (r) =>
      r.trigger_type === "recipe_collection" &&
      r.collection_slug !== null &&
      collectionSlugsInCart.has(r.collection_slug)
  )

  const recipeCandidates: OrderBump[] = []
  for (const rule of recipeRules) {
    if (cartProductIds.has(rule.product_id)) continue
    if (recipeCandidates.length >= MAX_BUMPS) break
    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select(
        "id, name, slug, description, image_url, price, sale_price, stock_status, category_id, is_visible"
      )
      .eq("id", rule.product_id)
      .maybeSingle()
    if (prodErr || !isUsableBumpProduct(product as BumpProduct | null)) continue
    recipeCandidates.push(buildBump(rule, product as BumpProduct))
  }

  // ── 2) Fallback dinámico para colecciones detectadas SIN regla admin ──
  const collectionsWithAdminRule = new Set(
    rules
      .filter((r) => r.trigger_type === "recipe_collection" && r.collection_slug !== null)
      .map((r) => r.collection_slug as string)
  )
  for (const slug of collectionSlugsInCart) {
    if (collectionsWithAdminRule.has(slug)) continue
    if (recipeCandidates.length >= MAX_BUMPS) break
    const bump = await buildDynamicRecipeBump(supabase, slug, cartProductIds, collections)
    if (bump) recipeCandidates.push(bump)
  }

  // ── 3) Candidatos por categoría / umbral ──
  const categoryCandidates: OrderBump[] = []
  const usedProductIds = new Set(recipeCandidates.map((b) => b.product.id))
  for (const trigger of matchedTriggers) {
    if (trigger === "recipe_collection") continue
    const rule = ruleByTrigger.get(trigger)
    if (!rule) continue
    if (cartProductIds.has(rule.product_id) || usedProductIds.has(rule.product_id)) continue
    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select(
        "id, name, slug, description, image_url, price, sale_price, stock_status, category_id, is_visible"
      )
      .eq("id", rule.product_id)
      .maybeSingle()
    if (prodErr || !isUsableBumpProduct(product as BumpProduct | null)) continue
    categoryCandidates.push(buildBump(rule, product as BumpProduct))
  }

  // ── Ranking final: recetas/colecciones primero, top MAX_BUMPS, sin dupes ──
  const seen = new Set<number>()
  const bumps: OrderBump[] = []
  for (const bump of [...recipeCandidates, ...categoryCandidates]) {
    if (seen.has(bump.product.id)) continue
    seen.add(bump.product.id)
    bumps.push(bump)
    if (bumps.length >= MAX_BUMPS) break
  }
  return bumps
}

/**
 * Genera un bump dinámico para una colección de receta sin regla admin:
 * elige el primer producto complementario de la colección (vía RPC
 * get_products_by_collection) que no esté en el carrito, con stock y visible,
 * y lo registra como regla `recipe_collection` (1 por colección) para que
 * POST /api/orders pueda validarlo. Fail-open: devuelve null si algo falla.
 */
async function buildDynamicRecipeBump(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  collectionSlug: string,
  cartProductIds: Set<number>,
  collections: CollectionRow[]
): Promise<OrderBump | null> {
  const { data: collectionProducts, error } = await supabase.rpc(
    "get_products_by_collection",
    { p_slug: collectionSlug }
  )
  if (error || !Array.isArray(collectionProducts) || collectionProducts.length === 0) {
    return null
  }

  const rows = collectionProducts as Record<string, unknown>[]
  const candidate = rows.find(
    (p) =>
      typeof p?.id === "number" &&
      !cartProductIds.has(p.id) &&
      p.stock_status !== "out_of_stock" &&
      p.is_visible !== false
  )
  if (!candidate) return null

  const collection = collections.find((c) => c.slug === collectionSlug)
  const title =
    typeof candidate.name === "string" ? candidate.name : "Complemento para tu pedido"

  const product: BumpProduct = {
    id: candidate.id as number,
    name: typeof candidate.name === "string" ? candidate.name : "",
    slug: typeof candidate.slug === "string" ? candidate.slug : "",
    description: typeof candidate.description === "string" ? candidate.description : "",
    image_url: typeof candidate.image_url === "string" ? candidate.image_url : "",
    price: typeof candidate.price === "number" ? candidate.price : 0,
    sale_price: typeof candidate.sale_price === "number" ? candidate.sale_price : null,
    stock_status: (candidate.stock_status as BumpProduct["stock_status"]) ?? "in_stock",
    category_id: typeof candidate.category_id === "number" ? candidate.category_id : 0,
  }

  const insertPayload = {
    trigger_type: "recipe_collection" as const,
    category_slugs: [] as string[],
    product_id: product.id,
    title,
    description: `Sugerido para completar tu pedido${collection ? ` de ${collection.name}` : ""}.`,
    discount_pct: DYNAMIC_RECIPE_DISCOUNT,
    is_active: true,
    display_order: 0,
    collection_slug: collectionSlug,
  }

  const { data: inserted, error: insError } = await supabase
    .from("bump_rules")
    .insert(insertPayload)
    .select("*")
    .maybeSingle()

  if (insError || !inserted) {
    // Posible carrera entre requests: recupera la regla ya creada y úsala si
    // su producto sigue siendo válido.
    const { data: existing } = await supabase
      .from("bump_rules")
      .select("*")
      .eq("trigger_type", "recipe_collection")
      .eq("collection_slug", collectionSlug)
      .maybeSingle()
    if (!existing) return null
    const rule = existing as BumpRuleRow
    if (cartProductIds.has(rule.product_id)) return null
    const { data: existingProduct, error: pErr } = await supabase
      .from("products")
      .select(
        "id, name, slug, description, image_url, price, sale_price, stock_status, category_id, is_visible"
      )
      .eq("id", rule.product_id)
      .maybeSingle()
    if (pErr || !isUsableBumpProduct(existingProduct as BumpProduct | null)) return null
    return buildBump(rule, existingProduct as BumpProduct)
  }

  return buildBump(inserted as BumpRuleRow, product)
}
