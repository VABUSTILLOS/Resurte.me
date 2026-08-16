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
import { applyDiscount } from "@/lib/money"
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

/**
 * Diagnóstico opcional de `resolveBumps`: se rellena cuando un resultado
 * vacío (o fail-open) proviene de un error de BD real y no de reglas de
 * negocio que simplemente no aplican. La ruta `/api/cart/bumps` lo expone
 * como `_debug.reason` para distinguir "error transitorio" de "no hay match".
 */
export interface BumpDiagnostics {
  reason?: string
  detail?: unknown
  /** Estado interno del motor al terminar (para cazar "0 bumps" en prod). */
  state?: {
    rulesLoaded: number
    ruleTriggers: string[]
    productsLoaded: number
    productTagsByCart: Record<number, string[] | null>
    collectionsLoaded: number
    collectionSlugs: string[]
    collectionSlugsInCart: string[]
    cartCategorySlugs: string[]
    subtotal: number
    matchedTriggers: string[]
  }
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

function effectivePrice(product: BumpProduct): number {
  return product.sale_price ?? product.price
}

function discountPrice(product: BumpProduct, discountPct: number): number {
  return applyDiscount(effectivePrice(product), discountPct)
}

/** Precio de bump a partir de un precio base y el % de descuento. */
export function bumpUnitPrice(basePrice: number, discountPct: number): number {
  return applyDiscount(basePrice, discountPct)
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
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  diagnostics?: BumpDiagnostics
): Promise<BumpRuleRow[]> {
  const { data, error } = await supabase
    .from("bump_rules")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true })

  if (error) {
    logger.warn("[BUMPS] loadActiveRules error, fail-open", { error: error.message })
    if (diagnostics) {
      diagnostics.reason = "load_active_rules_error"
      diagnostics.detail = { error: error.message }
    }
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

/** Columnas de producto necesarias para construir bumps (sin tags). */
const BUMP_PRODUCT_COLUMNS =
  "id, name, slug, description, image_url, price, sale_price, stock_status, category_id, is_visible"

/**
 * Carga los productos de todas las reglas candidatas en UNA query. Evita el
 * N+1 de hacer un .maybeSingle() por regla. Fail-open: devuelve un Map vacío
 * si la BD falla (los candidatos se omiten, igual que antes).
 */
async function loadBumpProducts(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  productIds: number[]
): Promise<Map<number, BumpProduct>> {
  if (productIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from("products")
    .select(BUMP_PRODUCT_COLUMNS)
    .in("id", productIds)
  if (error) return new Map()
  return new Map((data ?? []).map((product) => [product.id, product as BumpProduct]))
}

/**
 * Ejecuta una query de Supabase con 1 reintento. Los fallos de BD transitorios
 * (picos de conexión del pool al hacer requests concurrentes: sesión, wallet,
 * categorías, bumps) eran la causa de los "0 bumps logueado": un error en
 * `restaurant_collections` o `categories` se silenciaba como "vacío" y
 * `resolveBumps` devolvía [] sin rastro en logs. Ahora se reintenta y se
 * registra el fallo real en `diagnostics.reason`.
 */
async function queryWithRetry<T>(
  run: () => Promise<{ data: T[] | null; error: { message: string } | null }>,
  diagnostics: BumpDiagnostics | undefined,
  label: string,
  reason: string
): Promise<T[]> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, error } = await run()
    if (!error) return (data ?? []) as T[]
    logger.warn(`[BUMPS] ${label} fetch error (attempt ${attempt}), retrying`, {
      error: error.message,
    })
    if (attempt === 1) await new Promise((r) => setTimeout(r, 250))
  }
  if (diagnostics) {
    diagnostics.reason = reason
    diagnostics.detail = { label, note: "fallo transitorio tras 2 intentos" }
  }
  return []
}

/**
 * Resuelve los bumps condicionales para un carrito.
 * La entrada es una lista de { product_id, quantity } (sin precios del
 * cliente). Los precios se derivan de `products`.
 *
 * Excluye productos que ya están en el carrito, agotados o no visibles.
 * Retorna [] si no aplica ninguna regla o si la BD falla (fail-open).
 *
 * `diagnostics` (opcional) se rellena cuando un resultado vacío proviene de
 * un error de BD real (con retry) para distinguirlo de "no hay match".
 */
export async function resolveBumps(
  input: BumpCartInput,
  diagnostics?: BumpDiagnostics
): Promise<OrderBump[]> {
  if (input.items.length === 0) return []

  const supabase = await createServiceClient()
  const cartProductIds = new Set(input.items.map((i) => i.product_id))

  const [rules, productRows, collections] = await Promise.all([
    loadActiveRules(supabase, diagnostics),
    supabase
      .from("products")
      .select(
        "id, name, slug, description, image_url, price, sale_price, stock_status, category_id, tags, is_visible"
      )
      .in("id", Array.from(cartProductIds)),
    // NOTA: esta query no debe silenciarse. Con solo reglas recipe_collection
    // activas, un fallo aquí dejaba collectionSlugsInCart vacío y resolveBumps
    // devolvía [] (el "resolveBumps_vacio" del reporte). Retry + log.
    queryWithRetry<CollectionRow>(
      () =>
        supabase
          .from("restaurant_collections")
          .select("id, slug, name, tags, is_active")
          .eq("is_active", true) as unknown as Promise<{
          data: CollectionRow[] | null
          error: { message: string } | null
        }>,
      diagnostics,
      "restaurant_collections",
      "restaurant_collections_error"
    ),
  ])

  if (productRows.error) {
    logger.warn("[BUMPS] products fetch error, fail-open", { error: productRows.error.message })
    if (diagnostics) {
      diagnostics.reason = "products_fetch_error"
      diagnostics.detail = { error: productRows.error.message }
    }
    return []
  }

  const cartProducts = (productRows.data ?? []) as BumpProduct[]

  // Categorías presentes en el carrito (derivadas de los productos ya cargados).
  // También con retry: un fallo aquí dejaba cartCategorySlugs vacío y podía
  // vaciar matchedTriggers de las reglas por categoría/umbral.
  const cartCategorySlugs = new Set<string>()
  const categoryIds = new Set(cartProducts.map((p) => p.category_id))
  if (categoryIds.size > 0) {
    const cats = await queryWithRetry<{ id: number; slug: string }>(
      () =>
        supabase
          .from("categories")
          .select("id, slug")
          .in("id", Array.from(categoryIds)) as unknown as Promise<{
          data: { id: number; slug: string }[] | null
          error: { message: string } | null
        }>,
      diagnostics,
      "categories",
      "categories_fetch_error"
    )
    for (const c of cats) {
      if (c.slug) cartCategorySlugs.add(c.slug)
    }
  }

  const subtotal = cartProducts.reduce((sum, p) => {
    const item = input.items.find((i) => i.product_id === p.id)
    return sum + (p.sale_price ?? p.price) * (item?.quantity ?? 0)
  }, 0)

  const collectionSlugsInCart = detectCollectionsInCart(cartProducts, collections)

  const matchedTriggers = evaluateTriggerTypes(
    cartCategorySlugs,
    subtotal,
    rules,
    collectionSlugsInCart
  )
  // Estado interno del motor: captura SIEMPRE (no solo al fallar) para que el
  // log "[BUMPS] served" y el _debug de /diagnostico-bumps revelen en qué
  // etapa el resultado quedó vacío (reglas, colecciones, tags, triggers).
  if (diagnostics) {
    const productTagsByCart: Record<number, string[] | null> = {}
    for (const p of cartProducts) {
      productTagsByCart[p.id] = p.tags ?? null
    }
    diagnostics.state = {
      rulesLoaded: rules.length,
      ruleTriggers: rules.map((r) => `${r.id}:${r.trigger_type}`),
      productsLoaded: cartProducts.length,
      productTagsByCart,
      collectionsLoaded: collections.length,
      collectionSlugs: collections.map((c) => c.slug),
      collectionSlugsInCart: Array.from(collectionSlugsInCart),
      cartCategorySlugs: Array.from(cartCategorySlugs),
      subtotal,
      matchedTriggers: Array.from(matchedTriggers),
    }
  }
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

  // Carga los productos de todas las reglas de receta en UNA query (evita el
  // N+1 de un .maybeSingle() por regla).
  const recipeProductMap = await loadBumpProducts(
    supabase,
    recipeRules
      .filter((r) => !cartProductIds.has(r.product_id))
      .map((r) => r.product_id)
  )

  const recipeCandidates: OrderBump[] = []
  for (const rule of recipeRules) {
    if (cartProductIds.has(rule.product_id)) continue
    if (recipeCandidates.length >= MAX_BUMPS) break
    const product = recipeProductMap.get(rule.product_id)
    if (!isUsableBumpProduct(product)) continue
    recipeCandidates.push(buildBump(rule, product))
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
  const categoryTriggerRules = matchedTriggers
    .filter((trigger) => trigger !== "recipe_collection")
    .map((trigger) => ruleByTrigger.get(trigger))
    .filter(
      (rule): rule is BumpRuleRow =>
        rule !== undefined &&
        !cartProductIds.has(rule.product_id) &&
        !usedProductIds.has(rule.product_id)
    )

  // Igual que arriba: una sola query para los productos de todas las reglas.
  const categoryProductMap = await loadBumpProducts(
    supabase,
    categoryTriggerRules.map((rule) => rule.product_id)
  )

  for (const trigger of matchedTriggers) {
    if (trigger === "recipe_collection") continue
    const rule = ruleByTrigger.get(trigger)
    if (!rule) continue
    if (cartProductIds.has(rule.product_id) || usedProductIds.has(rule.product_id)) continue
    const product = categoryProductMap.get(rule.product_id)
    if (!isUsableBumpProduct(product)) continue
    categoryCandidates.push(buildBump(rule, product))
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
