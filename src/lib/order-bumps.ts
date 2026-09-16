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
 *   7. ingredient_affinity → afinidad por INGREDIENTE, no por tag: se resuelve
 *                            el nombre de cada ingrediente del recetario
 *                            contra el catálogo y, si el carrito ya lleva
 *                            alguno, los demás ingredientes de esa receta se
 *                            ofrecen primero (carne → especias/salsa, cebolla
 *                            → chile + jitomate para una salsa). Los pares
 *                            curados por el admin en `bump_affinity` refuerzan
 *                            o corrigen lo que el recetario no cubre.
 *
 * Estrategia híbrida:
 *   - Las reglas administradas en `bump_rules` son la fuente de verdad.
 *   - Si el carrito detecta una colección SIN regla admin, se genera un
 *     bump dinámico: el motor elige el producto complementario de esa
 *     colección (RPC get_products_by_collection) que NO esté en el carrito,
 *     con stock y visible, y lo registra como regla `recipe_collection`
 *     (idempotente, 1 por colección) para que POST /api/orders pueda
 *     validarlo igual que cualquier otro bump.
 *   - La afinidad por ingrediente (`bump_affinity` + recetario) es el tier de
 *     MAYOR prioridad y tampoco requiere reglas preexistentes: se registra una
 *     regla `ingredient_affinity` por producto servido (idempotente gracias al
 *     índice único parcial de la migración 00112), de modo que POST /api/orders
 *     la valide sin cambios en esa ruta.
 *
 * El cliente NUNCA envía precios ni reglas: solo items del carrito. Todo se
 * deriva server-side de `bump_rules` y `products` (precios reales), igual
 * que la filosofía de `createPaymentIntentForOrder`.
 *
 * Por defecto devuelve MAX_BUMPS (3) bumps. El llamador puede pedir un pool
 * mayor (`limit`) para encadenar ofertas en el checkout: al elegir un bump el
 * cliente ya tiene la siguiente oferta sin volver a consultar la API. Sin
 * `limit` devuelve TODAS las reglas activas que apliquen al carrito (el pool
 * real lo determina `bump_rules`, no una constante); un `limit` explícito se
 * acota a [1, MAX_BUMPS_REQUEST_LIMIT]. Ranking de relevancia: recetas y
 * colecciones primero, luego categorías/umbral por display_order. Fail-open:
 * cualquier error de BD devuelve [] para no bloquear el checkout.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { applyDiscount } from "@/lib/money"
import { MAX_BUMPS, MAX_BUMPS_REQUEST_LIMIT } from "@/lib/checkout-config"
import { logger } from "@/lib/logger"
import { getAllRecipes } from "@/lib/recipes"
import {
  computeAffinity,
  type AffinityPairRow,
  type AffinityProduct,
} from "@/lib/ingredient-affinity"
import {
  isMissingColumnError,
  resolveEffectivePrice,
  resolveSalePrice,
} from "@/lib/sale-window"

export type BumpTriggerType =
  | "perishables"
  | "snacks_drinks"
  | "subtotal_threshold"
  | "meat_bbq"
  | "drinks_sides"
  | "recipe_collection"
  | "ingredient_affinity"

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
  /** Ventana de la oferta (00107); ausente si la migración no está aplicada. */
  sale_starts_at?: string | null
  sale_ends_at?: string | null
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
    /** Pares de afinidad leídos de `bump_affinity` para este carrito. */
    affinityPairs: number
    /** Candidatos de afinidad antes de filtrar por stock/visibilidad. */
    affinityCandidates: number
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

/**
 * Descuento por defecto de un bump de afinidad recién registrado. Una vez
 * creada la regla, el admin puede editarla en el panel y ese valor manda.
 */
const AFFINITY_DISCOUNT = 0.1

/** display_order de las reglas registradas por el motor (por debajo de las del admin). */
const ENGINE_RULE_DISPLAY_ORDER = 100

function effectivePrice(product: BumpProduct): number {
  // Oferta vencida/programada (00107) no aplica: mismo precio que la tienda.
  return resolveEffectivePrice(product) ?? product.price
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
  collectionSlugsInCart: Set<string> = new Set(),
  limit: number = MAX_BUMPS
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
      // La afinidad por ingrediente NO se resuelve aquí: no depende de
      // categorías, subtotal ni tags, sino del cruce ingrediente→producto que
      // hace computeAffinity(). Se mantiene en `false` para que estas reglas
      // (registradas por el motor, no por el admin) nunca entren al tier de
      // categorías y dupliquen una oferta ya servida por afinidad.
      case "ingredient_affinity":
        applies = false
        break
    }
    if (applies) matched.push(rule.trigger_type)
  }

  // Máximo `limit` en display_order (el ranking final por relevancia ocurre
  // en resolveBumps, donde las colecciones/recetas tienen prioridad).
  return matched.slice(0, limit)
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

/**
 * Lee los pares de afinidad de `bump_affinity` que apuntan desde el carrito.
 * Se filtra por `source_product_id` en el carrito para traer solo las filas
 * relevantes (el catálogo completo de pares es pequeño, pero la query acotada
 * evita depender del tamaño). Fail-open: si la migración 00112 no está
 * aplicada, la tabla no existe y devuelve [] (la afinidad curada se omite y
 * queda solo la del recetario).
 */
async function loadAffinityPairs(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  cartProductIds: number[],
  diagnostics?: BumpDiagnostics
): Promise<AffinityPairRow[]> {
  if (cartProductIds.length === 0) return []
  const { data, error } = await supabase
    .from("bump_affinity")
    .select("source_product_id, target_product_id, kind, weight")
    .eq("is_active", true)
    .in("source_product_id", cartProductIds)

  if (error) {
    // 42P01 = tabla inexistente (00112 pendiente): no es un fallo de negocio.
    logger.warn("[BUMPS] bump_affinity fetch error, afinidad curada omitida", {
      error: error.message,
    })
    if (diagnostics) diagnostics.reason = "bump_affinity_fetch_error"
    return []
  }
  return (data ?? []) as AffinityPairRow[]
}

/**
 * Carga el catálogo mínimo (id, name, slug) para resolver los ingredientes del
 * recetario contra productos reales. Es la única query "ancha" del motor; se
 * pide una sola vez y solo con las columnas que necesita el índice de nombres.
 */
async function loadCatalogIndex(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  diagnostics?: BumpDiagnostics
): Promise<AffinityProduct[]> {
  const { data, error } = await supabase.from("products").select("id, name, slug")
  if (error) {
    logger.warn("[BUMPS] catalog fetch error, afinidad por receta omitida", {
      error: error.message,
    })
    if (diagnostics) diagnostics.reason = "catalog_fetch_error"
    return []
  }
  return (data ?? []) as AffinityProduct[]
}

/**
 * Registra (idempotente) la regla `bump_rules` de un bump de afinidad para que
 * POST /api/orders lo valide igual que cualquier otro bump. El índice único
 * parcial `idx_bump_rules_ingredient_affinity` (product_id) de la migración
 * 00112 garantiza una sola regla por producto incluso con requests
 * concurrentes. Fail-open: devuelve null si no se puede registrar.
 */
async function registerAffinityRule(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  product: BumpProduct,
  reason: string
): Promise<BumpRuleRow | null> {
  const { data: inserted, error } = await supabase
    .from("bump_rules")
    .insert({
      trigger_type: "ingredient_affinity",
      category_slugs: [] as string[],
      product_id: product.id,
      title: product.name,
      description: reason,
      discount_pct: AFFINITY_DISCOUNT,
      is_active: true,
      display_order: ENGINE_RULE_DISPLAY_ORDER,
      collection_slug: null,
    })
    .select("*")
    .maybeSingle()

  if (!error && inserted) return inserted as BumpRuleRow

  // Carrera con otro request (o 00112 pendiente): reutiliza la regla existente.
  const { data: existing, error: selError } = await supabase
    .from("bump_rules")
    .select("*")
    .eq("trigger_type", "ingredient_affinity")
    .eq("product_id", product.id)
    .maybeSingle()
  if (selError || !existing) return null
  return existing as BumpRuleRow
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
  const isAffinity = rule.trigger_type === "ingredient_affinity"
  return {
    ruleId: rule.id,
    trigger_type: rule.trigger_type,
    title: rule.title,
    description: rule.description,
    discount_pct: rule.discount_pct,
    product,
    price: discountPrice(product, rule.discount_pct),
    original_price: effectivePrice(product),
    isRecipeMatch: isRecipe || isAffinity,
    badgeLabel: isAffinity
      ? "Ideal con tu pedido"
      : isRecipe
        ? "Sugerido para tu receta / pedido"
        : undefined,
    collection_slug: rule.collection_slug ?? undefined,
  }
}

/** Columnas de producto necesarias para construir bumps (sin tags). */
const BUMP_PRODUCT_COLUMNS =
  "id, name, slug, description, image_url, price, sale_price, stock_status, category_id, is_visible, sale_starts_at, sale_ends_at"

/** Set previo a la migración 00107 (ventana de oferta). */
const BUMP_PRODUCT_COLUMNS_BASE =
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
  if (!error) {
    return new Map((data ?? []).map((product) => [product.id, product as BumpProduct]))
  }
  if (isMissingColumnError(error)) {
    // Migración 00107 pendiente: sin ventana, la oferta siempre aplica.
    const fallback = await supabase
      .from("products")
      .select(BUMP_PRODUCT_COLUMNS_BASE)
      .in("id", productIds)
    if (!fallback.error) {
      return new Map(
        (fallback.data ?? []).map((product) => [
          product.id,
          product as unknown as BumpProduct,
        ])
      )
    }
  }
  return new Map()
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

/** Productos del carrito con tags (para detectar colecciones de receta). */
async function loadCartProducts(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  productIds: number[]
): Promise<{
  data: BumpProduct[] | null
  error: { message: string; code?: string } | null
}> {
  const cols = `${BUMP_PRODUCT_COLUMNS}, tags`
  const { data, error } = await supabase.from("products").select(cols).in("id", productIds)
  if (!error) {
    return { data: (data as BumpProduct[] | null) ?? null, error: null }
  }
  if (isMissingColumnError(error)) {
    // Migración 00107 pendiente: sin ventana, la oferta siempre aplica.
    const fallback = await supabase
      .from("products")
      .select(`${BUMP_PRODUCT_COLUMNS_BASE}, tags`)
      .in("id", productIds)
    return {
      data: (fallback.data as unknown as BumpProduct[] | null) ?? null,
      error: fallback.error,
    }
  }
  return { data: null, error }
}

/**
 * Tier 0: bumps por AFINIDAD DE INGREDIENTE.
 *
 * Cruza los ingredientes del recetario y los pares curados (`bump_affinity`)
 * contra el catálogo real para resolver qué producto del carrito "pide" qué
 * otro producto (carne → especias/salsa, cebolla → chile + jitomate). El
 * cálculo es puro (`computeAffinity`); aquí solo se resuelven los productos,
 * se descartan los no usables y se registra la regla para que POST /api/orders
 * valide el bump.
 *
 * El `limit` del cálculo es `maxBumps` (no un tope fijo) a propósito: da
 * margen para descartar candidatos agotados o invisibles sin quedarse corto.
 * Los IDs que van a la query de productos sí se acotan a
 * MAX_BUMPS_REQUEST_LIMIT: la afinidad es un ranking de relevancia y más allá
 * de eso solo serían ruido (además de un `.in()` desmedido).
 */
async function resolveAffinityBumps(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  cartProducts: BumpProduct[],
  cartProductIds: Set<number>,
  maxBumps: number,
  diagnostics?: BumpDiagnostics
): Promise<{ pairsLoaded: number; candidateCount: number; bumps: OrderBump[] }> {
  if (cartProducts.length === 0) {
    return { pairsLoaded: 0, candidateCount: 0, bumps: [] }
  }

  const [catalog, pairs] = await Promise.all([
    loadCatalogIndex(supabase, diagnostics),
    loadAffinityPairs(supabase, Array.from(cartProductIds), diagnostics),
  ])
  if (catalog.length === 0) {
    return { pairsLoaded: pairs.length, candidateCount: 0, bumps: [] }
  }

  const candidates = computeAffinity({
    cartProducts,
    allProducts: catalog,
    recipes: getAllRecipes(),
    curatedPairs: pairs,
    limit: maxBumps,
  })
  if (candidates.length === 0) {
    return { pairsLoaded: pairs.length, candidateCount: 0, bumps: [] }
  }

  // Una sola query para los productos candidatos; el orden de afinidad ya
  // viene resuelto en `candidates`, así que se recorre en ese orden.
  const productMap = await loadBumpProducts(
    supabase,
    candidates.slice(0, MAX_BUMPS_REQUEST_LIMIT).map((c) => c.productId)
  )

  const bumps: OrderBump[] = []
  for (const candidate of candidates) {
    if (bumps.length >= maxBumps) break
    const product = productMap.get(candidate.productId)
    // Agotado, invisible o inexistente: se descarta el candidato, no el tier.
    if (!isUsableBumpProduct(product)) continue
    const rule = await registerAffinityRule(supabase, product, candidate.reason)
    if (!rule) continue
    bumps.push(buildBump(rule, product))
  }
  return { pairsLoaded: pairs.length, candidateCount: candidates.length, bumps }
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
 *
 * `limit` (opcional) acota cuántas ofertas se devuelven. `undefined` = todas
 * las reglas activas que apliquen al carrito (el checkout no envía `limit`);
 * un valor explícito se sanea a [1, MAX_BUMPS_REQUEST_LIMIT] para que un
 * cliente no pueda ampliarlo indefinidamente.
 */
export async function resolveBumps(
  input: BumpCartInput,
  diagnostics?: BumpDiagnostics,
  limit?: number
): Promise<OrderBump[]> {
  if (input.items.length === 0) return []
  const maxBumps = limit === undefined ? MAX_BUMPS_REQUEST_LIMIT : sanitizeBumpLimit(limit)

  const supabase = await createServiceClient()
  const cartProductIds = new Set(input.items.map((i) => i.product_id))

  const [rules, productRows, collections] = await Promise.all([
    loadActiveRules(supabase, diagnostics),
    loadCartProducts(supabase, Array.from(cartProductIds)),
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
    return sum + (resolveEffectivePrice(p) ?? p.price) * (item?.quantity ?? 0)
  }, 0)

  const collectionSlugsInCart = detectCollectionsInCart(cartProducts, collections)

  // ── 0) Afinidad por ingrediente (mayor prioridad) ──
  // Se calcula ANTES del guard de salida temprana porque, a diferencia de los
  // otros tiers, no depende de categorías, subtotal, tags ni colecciones: un
  // carrito con carne y sin ninguna colección detectada igual merece especias.
  const affinity = await resolveAffinityBumps(
    supabase,
    cartProducts,
    cartProductIds,
    maxBumps,
    diagnostics
  )

  const matchedTriggers = evaluateTriggerTypes(
    cartCategorySlugs,
    subtotal,
    rules,
    collectionSlugsInCart,
    maxBumps
  )
  // Estado interno del motor: captura SIEMPRE (no solo al fallar) para que el
  // log "[BUMPS] served" y el _debug (?debug=1 en /api/cart/bumps) revelen
  // en qué etapa el resultado quedó vacío (reglas, colecciones, tags, triggers).
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
      affinityPairs: affinity.pairsLoaded,
      affinityCandidates: affinity.candidateCount,
    }
  }
  if (
    matchedTriggers.length === 0 &&
    collectionSlugsInCart.size === 0 &&
    affinity.bumps.length === 0
  ) {
    return []
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
    if (recipeCandidates.length >= maxBumps) break
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
    if (recipeCandidates.length >= maxBumps) break
    const bump = await buildDynamicRecipeBump(supabase, slug, cartProductIds, collections)
    if (bump) recipeCandidates.push(bump)
  }

  // ── 3) Candidatos por categoría / umbral ──
  // Todas las reglas cuyo trigger aplica al carrito, no solo la primera de
  // cada tipo: quedarse con una por trigger_type agotaba el pool sin motivo
  // cuando el admin configura varias reglas de categoría/umbral.
  const categoryCandidates: OrderBump[] = []
  const usedProductIds = new Set(recipeCandidates.map((b) => b.product.id))
  const matchedTriggerSet = new Set(matchedTriggers)
  const categoryTriggerRules = rules.filter(
    (rule) =>
      rule.trigger_type !== "recipe_collection" &&
      matchedTriggerSet.has(rule.trigger_type) &&
      !cartProductIds.has(rule.product_id) &&
      !usedProductIds.has(rule.product_id)
  )

  // Igual que arriba: una sola query para los productos de todas las reglas.
  const categoryProductMap = await loadBumpProducts(
    supabase,
    categoryTriggerRules.map((rule) => rule.product_id)
  )

  for (const rule of categoryTriggerRules) {
    if (categoryCandidates.length >= maxBumps) break
    if (usedProductIds.has(rule.product_id)) continue
    const product = categoryProductMap.get(rule.product_id)
    if (!isUsableBumpProduct(product)) continue
    usedProductIds.add(rule.product_id)
    categoryCandidates.push(buildBump(rule, product))
  }

  // ── Ranking final: afinidad por ingrediente → recetas/colecciones →
  //    categoría/umbral. Top maxBumps, sin duplicados ──
  const seen = new Set<number>()
  const bumps: OrderBump[] = []
  for (const bump of [...affinity.bumps, ...recipeCandidates, ...categoryCandidates]) {
    if (seen.has(bump.product.id)) continue
    seen.add(bump.product.id)
    bumps.push(bump)
    if (bumps.length >= maxBumps) break
  }
  return bumps
}

/**
 * Sanea el `limit` de ofertas de bumps: entero en [1, MAX_BUMPS_REQUEST_LIMIT].
 * Valores inválidos (NaN, 0, negativos, no numéricos) caen al default.
 *
 * `undefined`/inválido → MAX_BUMPS (contrato de las superficies de carrito,
 * que piden la ventana visible). Para "todas las ofertas aplicables" el
 * llamador debe omitir el `limit` en `resolveBumps`, no pasar este valor.
 */
export function sanitizeBumpLimit(limit: number | undefined | null): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return MAX_BUMPS
  const floored = Math.floor(limit)
  if (floored < 1) return MAX_BUMPS
  return Math.min(floored, MAX_BUMPS_REQUEST_LIMIT)
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

  const saleWindow = {
    sale_price: typeof candidate.sale_price === "number" ? candidate.sale_price : null,
    sale_starts_at:
      typeof candidate.sale_starts_at === "string" ? candidate.sale_starts_at : null,
    sale_ends_at: typeof candidate.sale_ends_at === "string" ? candidate.sale_ends_at : null,
  }

  const product: BumpProduct = {
    id: candidate.id as number,
    name: typeof candidate.name === "string" ? candidate.name : "",
    slug: typeof candidate.slug === "string" ? candidate.slug : "",
    description: typeof candidate.description === "string" ? candidate.description : "",
    image_url: typeof candidate.image_url === "string" ? candidate.image_url : "",
    price: typeof candidate.price === "number" ? candidate.price : 0,
    sale_price: resolveSalePrice(saleWindow),
    stock_status: (candidate.stock_status as BumpProduct["stock_status"]) ?? "in_stock",
    category_id: typeof candidate.category_id === "number" ? candidate.category_id : 0,
    sale_starts_at: saleWindow.sale_starts_at,
    sale_ends_at: saleWindow.sale_ends_at,
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
      .select(BUMP_PRODUCT_COLUMNS)
      .eq("id", rule.product_id)
      .maybeSingle()
    if (pErr || !isUsableBumpProduct(existingProduct as BumpProduct | null)) return null
    return buildBump(rule, existingProduct as BumpProduct)
  }

  return buildBump(inserted as BumpRuleRow, product)
}
