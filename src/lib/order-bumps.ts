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
import { round2 } from "@/lib/money"
import { isOfferableProduct } from "@/lib/published-product"
import { MAX_BUMPS, MAX_BUMPS_REQUEST_LIMIT, BUMP_MIN_PRICE_MXN } from "@/lib/checkout-config"
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

/** Bump listo para el drawer. Se vende al precio de catálogo, sin descuento. */
export interface OrderBump {
  ruleId: number
  trigger_type: BumpTriggerType
  title: string
  description: string
  product: BumpProduct
  /** Precio efectivo: sale_price ?? price. El bump no lleva descuento propio. */
  price: number
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
    /**
     * Reglas que dispararon pero NO produjeron oferta, con el motivo
     * (`"2:product_not_visible"`). Sin esto, un producto oculto dejaba la regla
     * muda: el carrito se quedaba sin bumps y el log solo decía `bumpCount: 0`.
     */
    droppedRules: string[]
    /** Reglas re-apuntadas a un sustituto usable en esta misma respuesta. */
    healedRules: string[]
    /**
     * Reglas curadas que se sirvieron SOLO para completar la ventana visible
     * (no disparó su trigger). Si esto crece, la configuración de reglas se está
     * quedando sin ofertas propias del carrito.
     */
    fillerRules: string[]
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

/**
 * Precio unitario de un order bump: el de catálogo, sin descuento.
 *
 * Los order bumps **no llevan descuento propio**: el cliente paga por el
 * artículo especial exactamente lo que pagaría comprándolo suelto
 * (`sale_price ?? price`). El `discount_pct` de `bump_rules` ya no participa
 * aquí; solo lo usa la oferta 1-click post-compra (`upsell-offers.ts`).
 */
export function bumpUnitPrice(basePrice: number): number {
  return round2(basePrice)
}

export interface BumpPricingInput {
  /** Items del pedido con item_type "bump". */
  bumpItems: { product_id: number; quantity: number }[]
  /** Precio base por producto (sale_price ?? price) desde la BD. */
  basePriceByProduct: Map<number, number>
  /** Productos con una regla de bump activa: es el único requisito del bump. */
  activeRuleProductIds: Set<number>
}

export type BumpPricingResult =
  | { ok: true; pricesByProduct: Map<number, number> }
  | { ok: false; missingProductId: number }

/**
 * Valida que cada bump item tenga una regla activa y devuelve su precio de
 * catálogo. Si algún producto no tiene regla activa, el bump se rechaza: un
 * cliente no puede convertir un producto cualquiera en "artículo especial".
 * Misma fórmula que POST /api/orders.
 */
export function resolveBumpPricing(input: BumpPricingInput): BumpPricingResult {
  const pricesByProduct = new Map<number, number>()
  for (const item of input.bumpItems) {
    const base = input.basePriceByProduct.get(item.product_id)
    if (base === undefined || !input.activeRuleProductIds.has(item.product_id)) {
      return { ok: false, missingProductId: item.product_id }
    }
    pricesByProduct.set(item.product_id, bumpUnitPrice(base))
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
 *
 * **Solo productos publicados en tienda** (`is_visible = true`). Antes traía el
 * catálogo completo (646 filas, 378 ocultas) y como `buildProductIndex` es un
 * `Map` first-match-wins, un producto oculto **tapaba a su gemelo publicado** con
 * el mismo nombre: el candidato salía con el id oculto y luego
 * `isUsableBumpProduct` lo descartaba, así que la oferta se perdía aunque el
 * producto publicado existiera.
 *
 * Los productos del CARRITO entran al índice aunque ya no estén publicados, y
 * **después** de los publicados: el recetario se detecta por lo que el cliente ya
 * lleva (eso no es una oferta) y así un oculto del carrito tampoco puede tapar a
 * su gemelo publicado. Un oculto nunca llega a ofrecerse: el filtro de servicio
 * (`isUsableBumpProduct`) y el `cartById` de `computeAffinity` lo impiden.
 */
async function loadCatalogIndex(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  diagnostics?: BumpDiagnostics,
  cartProducts: AffinityProduct[] = []
): Promise<AffinityProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug")
    .eq("is_visible", true)
  if (error) {
    logger.warn("[BUMPS] catalog fetch error, afinidad por receta omitida", {
      error: error.message,
    })
    if (diagnostics) diagnostics.reason = "catalog_fetch_error"
    return []
  }
  const published = (data ?? []) as AffinityProduct[]
  if (cartProducts.length === 0) return published
  const seen = new Set(published.map((p) => p.id))
  const cartOnly = cartProducts
    .filter((p) => !seen.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, slug: p.slug }))
  return [...published, ...cartOnly]
}

/** Payload de la fila `bump_rules` de un bump de afinidad. */
function affinityRuleRow(product: BumpProduct, reason: string) {
  return {
    trigger_type: "ingredient_affinity",
    category_slugs: [] as string[],
    product_id: product.id,
    title: product.name,
    description: reason,
    discount_pct: AFFINITY_DISCOUNT,
    is_active: true,
    display_order: ENGINE_RULE_DISPLAY_ORDER,
    collection_slug: null,
  }
}

/**
 * Carga en UNA query las reglas de afinidad ya registradas de estos productos.
 * Evita el N+1 de un INSERT→SELECT por oferta: con 00112 sembrada el INSERT
 * siempre choca contra el índice único y el SELECT siempre corre, o sea 2
 * roundtrips (~87 ms) por bump — la causa de los ~6.6 s del checkout, que pide
 * todas las ofertas. Fail-open: Map vacío si la BD falla (el llamador cae al
 * registro individual).
 */
async function loadAffinityRulesForProducts(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  productIds: number[]
): Promise<Map<number, BumpRuleRow>> {
  if (productIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from("bump_rules")
    .select("*")
    .eq("trigger_type", "ingredient_affinity")
    .in("product_id", productIds)
  if (error) return new Map()
  return new Map(((data ?? []) as BumpRuleRow[]).map((row) => [row.product_id, row]))
}

/**
 * Registra en UN insert las reglas de afinidad que faltan (entorno frío: 00112
 * siembra `bump_affinity`, no `bump_rules`). Fail-open: Map vacío si el lote
 * falla —carrera con otro request contra el índice único, o 00112 pendiente—
 * para que el llamador caiga al registro individual.
 */
async function registerAffinityRulesBatch(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  rows: ReturnType<typeof affinityRuleRow>[]
): Promise<Map<number, BumpRuleRow>> {
  if (rows.length === 0) return new Map()
  const { data, error } = await supabase.from("bump_rules").insert(rows).select("*")
  if (error) return new Map()
  return new Map(((data ?? []) as BumpRuleRow[]).map((row) => [row.product_id, row]))
}

/**
 * Registra (idempotente) la regla `bump_rules` de UN bump de afinidad para que
 * POST /api/orders lo valide igual que cualquier otro bump. Es el camino de
 * recuperación cuando el lote no pudo resolver la regla. El índice único
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
    .insert(affinityRuleRow(product, reason))
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

/**
 * Producto usable como oferta: existe, **publicado en tienda** (`is_visible`) y
 * con existencia. La definición del predicado vive en `published-product.ts`.
 */
function isUsableBumpProduct(product: BumpProduct | null | undefined): product is BumpProduct {
  return product !== null && product !== undefined && isOfferableProduct(product)
}

/**
 * ¿Vale la pena ofrecerlo como artículo especial? Además de usable, tiene que
 * pasar el **piso de precio** (`BUMP_MIN_PRICE_MXN`): un bump de $4 no es una
 * oferta, es ruido. Es el predicado que usan TODOS los tiers, así que una regla
 * del admin apuntando a un producto barato tampoco se sirve — y el panel lo dice.
 */
function isOfferableBumpProduct(product: BumpProduct | null | undefined): product is BumpProduct {
  if (!isUsableBumpProduct(product)) return false
  return effectivePrice(product) >= BUMP_MIN_PRICE_MXN
}

/** Motivo por el que una regla que disparó no pudo ofrecer su producto. */
function unusableReason(product: BumpProduct | null | undefined): string {
  if (!product) return "product_not_found"
  if (product.is_visible === false) return "product_not_visible"
  if (product.stock_status === "out_of_stock") return "product_out_of_stock"
  if (effectivePrice(product) <= 0) return "product_sin_precio"
  if (effectivePrice(product) < BUMP_MIN_PRICE_MXN) return "product_below_min_price"
  return "unusable"
}

/**
 * Cuántos candidatos se miran al buscar sustituto para una regla rota. Acota la
 * query: basta con los más baratos **que pasan el piso** para encontrar uno
 * servible.
 */
const SUBSTITUTE_SCAN_LIMIT = 20

/**
 * Busca en UN pasillo el producto usable más barato que pasa el piso.
 * `excluded` son los productos que no pueden salir (ya en el carrito o ya
 * ofrecidos en esta respuesta).
 */
async function findAisleProduct(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  categoryId: number,
  excluded: Set<number>
): Promise<BumpProduct | null> {
  const { data, error } = await supabase
    .from("products")
    .select(BUMP_PRODUCT_COLUMNS)
    .eq("category_id", categoryId)
    .eq("is_visible", true)
    .neq("stock_status", "out_of_stock")
    // El piso se filtra en la BD (el precio de lista) y se revalida en el loop
    // con el precio efectivo: una ventana de oferta puede dejarlo por debajo.
    .gte("price", BUMP_MIN_PRICE_MXN)
    .order("price", { ascending: true })
    .limit(SUBSTITUTE_SCAN_LIMIT)
  if (error) {
    logger.warn("[BUMPS] búsqueda de sustituto error, fail-open", {
      error: error.message,
      categoryId,
    })
    return null
  }
  for (const row of (data ?? []) as BumpProduct[]) {
    if (excluded.has(row.id)) continue
    if (!isOfferableBumpProduct(row)) continue
    return row
  }
  return null
}

/**
 * Sustituto usable para una regla cuyo producto dejó de ser ofrecible: el más
 * barato de la MISMA categoría (un bump es compra de impulso, así que lo barato
 * es lo correcto **dentro del piso**), visible, con existencia y con precio
 * (`>= BUMP_MIN_PRICE_MXN`).
 *
 * La categoría es la del producto roto a propósito: es el pasillo que el admin
 * eligió como complemento. Si ese pasillo no tiene nada usable —caso real:
 * `bebidas` y `botanas-dulces` sin un solo producto visible, así que las reglas
 * `snacks_drinks` y `drinks_sides` se quedaban mudas para siempre— se prueban
 * los `fallbackCategoryIds` (los pasillos del propio carrito): lo que el cliente
 * ya está comprando es el contexto más fiable que tenemos.
 */
async function findSubstituteProduct(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  categoryId: number | null | undefined,
  excluded: Set<number>,
  fallbackCategoryIds: readonly number[] = []
): Promise<BumpProduct | null> {
  const aisles = [categoryId, ...fallbackCategoryIds].filter(
    (id, index, all): id is number => typeof id === "number" && all.indexOf(id) === index
  )
  for (const aisle of aisles) {
    const candidate = await findAisleProduct(supabase, aisle, excluded)
    if (candidate) return candidate
  }
  return null
}

/**
 * Copy de la regla cuando el motor la re-apunta: el nombre y la descripción del
 * producto nuevo. La descripción del catálogo puede venir vacía o nula (la
 * columna es nullable aunque el tipo diga `string`), así que hay respaldo.
 */
function bumpCopyFromProduct(product: BumpProduct): string {
  const description = (product.description ?? "").trim()
  return description || "Agrégalo a este envío."
}

/**
 * Re-apunta una regla de categoría/umbral cuyo producto dejó de ser ofrecible a
 * un sustituto usable de su misma categoría, y devuelve el bump listo para
 * servir. Devuelve null si no hay sustituto.
 *
 * El re-apunte se PERSISTE en `bump_rules` y no es un adorno: `POST /api/orders`
 * valida cada artículo especial contra los `product_id` de las reglas activas,
 * así que servir un producto que la regla no apunta haría fallar el pedido en el
 * último paso. Mismo patrón que `buildDynamicRecipeBump` y `registerAffinityRule`.
 *
 * El `UPDATE` exige que la regla siga apuntando al producto roto
 * (`.eq("product_id", rule.product_id)`): si otro request la curó antes, esta
 * corrida no pisa la decisión y simplemente no sirve el bump.
 */
async function healCategoryRule(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  rule: BumpRuleRow,
  broken: BumpProduct | null | undefined,
  excluded: Set<number>,
  diagnostics?: BumpDiagnostics,
  fallbackCategoryIds: readonly number[] = []
): Promise<OrderBump | null> {
  const substitute = await findSubstituteProduct(
    supabase,
    broken?.category_id ?? null,
    excluded,
    fallbackCategoryIds
  )
  if (!substitute) return null

  // El copy de la regla viaja con el producto: las tarjetas encabezan con
  // `product.name` y subtitulan con `rule.description`, así que dejar la copy
  // vieja ("Sazonador umami…" sobre una hoja de laurel) mentiría.
  const patch = {
    product_id: substitute.id,
    title: substitute.name,
    description: bumpCopyFromProduct(substitute),
  }

  const { data, error } = await supabase
    .from("bump_rules")
    .update(patch)
    .eq("id", rule.id)
    .eq("product_id", rule.product_id)
    .select("id")
  if (error || !data || data.length === 0) {
    logger.warn("[BUMPS] no se pudo re-apuntar la regla, fail-open", {
      ruleId: rule.id,
      from: rule.product_id,
      to: substitute.id,
      error: error?.message ?? "sin filas actualizadas",
    })
    return null
  }

  logger.warn("[BUMPS] regla re-apuntada a un producto usable", {
    ruleId: rule.id,
    trigger_type: rule.trigger_type,
    from: rule.product_id,
    to: substitute.id,
    reason: unusableReason(broken),
  })
  diagnostics?.state?.healedRules.push(`${rule.id}:${rule.product_id}→${substitute.id}`)
  return buildBump({ ...rule, ...patch }, substitute)
}

function buildBump(rule: BumpRuleRow, product: BumpProduct): OrderBump {
  const isRecipe = rule.trigger_type === "recipe_collection"
  const isAffinity = rule.trigger_type === "ingredient_affinity"
  return {
    ruleId: rule.id,
    trigger_type: rule.trigger_type,
    title: rule.title,
    description: rule.description,
    product,
    price: effectivePrice(product),
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
    loadCatalogIndex(supabase, diagnostics, cartProducts),
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

  // 1ª pasada: candidatos usables, en el orden de afinidad ya resuelto.
  const selected: { product: BumpProduct; reason: string }[] = []
  for (const candidate of candidates) {
    if (selected.length >= maxBumps) break
    const product = productMap.get(candidate.productId)
    // Agotado, invisible, inexistente o por debajo del piso de precio
    // (`BUMP_MIN_PRICE_MXN`): se descarta el candidato, no el tier. La afinidad
    // sugiere el ingrediente que falta; si ese ingrediente es barato, el carrito
    // igual merece una oferta, pero no una de $4.
    if (!isOfferableBumpProduct(product)) continue
    selected.push({ product, reason: candidate.reason })
  }
  if (selected.length === 0) {
    return { pairsLoaded: pairs.length, candidateCount: candidates.length, bumps: [] }
  }

  // 2ª pasada: resolver las reglas en lote (1 query, +1 insert sólo si faltan)
  // en vez del INSERT→SELECT por bump. El dedup por producto es defensivo:
  // `computeAffinity` ya deduplica, pero un lote con product_id repetido lo
  // rechazaría el índice único entero.
  const ruleMap = await loadAffinityRulesForProducts(
    supabase,
    selected.map((s) => s.product.id)
  )
  const pending = new Map<number, ReturnType<typeof affinityRuleRow>>()
  for (const { product, reason } of selected) {
    if (!ruleMap.has(product.id)) pending.set(product.id, affinityRuleRow(product, reason))
  }
  if (pending.size > 0) {
    const created = await registerAffinityRulesBatch(supabase, [...pending.values()])
    for (const [id, row] of created) ruleMap.set(id, row)
  }

  // 3ª pasada: construir. Sólo cae al registro individual si el lote falló.
  const bumps: OrderBump[] = []
  for (const { product, reason } of selected) {
    const rule = ruleMap.get(product.id) ?? (await registerAffinityRule(supabase, product, reason))
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
      droppedRules: [],
      healedRules: [],
      fillerRules: [],
    }
  }
  /** Rellena con las reglas curadas que no dispararon (ver `fillWithCuratedOffers`). */
  const runFill = (used: Set<number>, skip: Set<number>, limit: number) =>
    fillWithCuratedOffers(supabase, rules, {
      cartProductIds,
      usedProductIds: used,
      skipRuleIds: skip,
      cartCategoryIds: Array.from(categoryIds),
      limit,
      diagnostics,
    })

  /**
   * Cuántas ofertas se intentan servir. El checkout pide el pool completo
   * (`maxBumps` = el tope de petición) para encadenar ofertas al elegir: ahí se
   * apunta al **doble** de la ventana visible, para que elegir una oferta no
   * vacíe la sección a la tercera. Las superficies de carrito piden su ventana
   * (`MAX_BUMPS`) y no se rellenan más allá.
   */
  const offerTarget = Math.min(maxBumps, MAX_BUMPS * 2)

  if (
    matchedTriggers.length === 0 &&
    collectionSlugsInCart.size === 0 &&
    affinity.bumps.length === 0
  ) {
    // Nada del carrito dispara una regla. Antes esto devolvía `[]` y el carrito
    // se quedaba sin ninguna oferta —y sin el paso de oferta del pago por
    // transferencia—; ahora es justo el caso que cubre el relleno.
    const filler = await runFill(new Set(), new Set(), offerTarget)
    return filler.slice(0, maxBumps)
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
    // Un producto por debajo del piso no se sirve: la regla queda muda pero
    // registrada (el panel la marca con su precio), en vez de desaparecer en
    // silencio como pasaba antes de K20.
    if (!isOfferableBumpProduct(product)) {
      diagnostics?.state?.droppedRules.push(`${rule.id}:${unusableReason(product)}`)
      continue
    }
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

  // Reglas que ya se evaluaron (hayan servido o no): el relleno de complementos
  // no las reintenta (el re-apunte fallido daría el mismo resultado) ni duplica
  // su motivo en `droppedRules`.
  const evaluatedRuleIds = new Set<number>()

  for (const rule of categoryTriggerRules) {
    if (categoryCandidates.length >= maxBumps) break
    if (usedProductIds.has(rule.product_id)) continue
    evaluatedRuleIds.add(rule.id)
    const product = categoryProductMap.get(rule.product_id)
    // Un bump de $0 o por debajo del piso no es una oferta: se trata como
    // producto inservible y la regla se re-apunta.
    if (isOfferableBumpProduct(product)) {
      usedProductIds.add(rule.product_id)
      categoryCandidates.push(buildBump(rule, product))
      continue
    }
    // La regla disparó pero su producto dejó de ser ofrecible (oculto, agotado,
    // sin precio, barato o inexistente). Antes se descartaba en silencio —el
    // carrito se quedaba sin ofertas y no había rastro ni en logs ni en el
    // panel—; ahora se re-apunta a un sustituto usable del mismo pasillo y, si
    // ese pasillo no tiene nada usable, al del propio carrito.
    // El sustituto NO puede ser un producto que ya está en el carrito (el
    // cliente lo agregaría dos veces) ni uno ya ofrecido en esta respuesta.
    const healExcluded = new Set<number>([...cartProductIds, ...usedProductIds])
    const healed = await healCategoryRule(
      supabase,
      rule,
      product,
      healExcluded,
      diagnostics,
      Array.from(categoryIds)
    )
    if (healed) {
      usedProductIds.add(healed.product.id)
      categoryCandidates.push(healed)
      continue
    }
    diagnostics?.state?.droppedRules.push(`${rule.id}:${unusableReason(product)}`)
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

  // ── 4) Relleno de complementos: la ventana visible siempre llena ──
  // Ver `fillWithCuratedOffers`: sin esto, un carrito al que solo le aplica una
  // regla se queda sin ofertas y el paso de oferta del pago por transferencia
  // (que necesita una oferta NUEVA) se salta.
  if (bumps.length < offerTarget) {
    const filler = await runFill(seen, evaluatedRuleIds, offerTarget - bumps.length)
    for (const offer of filler) {
      if (bumps.length >= maxBumps) break
      bumps.push(offer)
    }
  }

  return bumps
}

/**
 * Completa la respuesta con las reglas **curadas** (categoría/umbral) que no
 * dispararon, para que el carrito nunca se quede sin ofertas.
 *
 * Por qué existe: el pool lo determinan las reglas, y para muchos carritos solo
 * dispara una —o ninguna—. El 2026-10-03 se ocultaron los productos de las
 * reglas de categoría/umbral y hay pasillos enteros sin un solo producto visible
 * (`bebidas`, `botanas-dulces`), así que `snacks_drinks` y `drinks_sides` están
 * mudas por diseño del catálogo. Un carrito sin ofertas no solo pierde el
 * cross-sell: el paso de oferta del pago por transferencia **se salta** cuando no
 * hay nada nuevo que ofrecer, así que quien pulsa "Obtén Envío Prioritario" nunca
 * ve la oferta.
 *
 * Nunca inventa reglas: sirve el producto de una regla existente (re-apuntándola
 * si hace falta, con el pasillo del carrito como respaldo), así que
 * `POST /api/orders` valida el artículo especial como cualquier otro bump. Las
 * reglas dinámicas (receta/afinidad) quedan fuera a propósito: existen por su
 * contexto y servir una fuera de él mentiría en la tarjeta.
 */
async function fillWithCuratedOffers(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  rules: BumpRuleRow[],
  opts: {
    cartProductIds: Set<number>
    /** Productos ya ofrecidos en esta respuesta (se muta al agregar). */
    usedProductIds: Set<number>
    /** Reglas que ya se evaluaron (dispararon): no se reintentan ni se repiten. */
    skipRuleIds: Set<number>
    cartCategoryIds: readonly number[]
    /** Cuántas ofertas puede agregar este pase. */
    limit: number
    diagnostics?: BumpDiagnostics
  }
): Promise<OrderBump[]> {
  if (opts.limit <= 0) return []
  const candidates = rules.filter(
    (r) =>
      r.trigger_type !== "recipe_collection" &&
      r.trigger_type !== "ingredient_affinity" &&
      !opts.skipRuleIds.has(r.id) &&
      !opts.cartProductIds.has(r.product_id) &&
      !opts.usedProductIds.has(r.product_id)
  )
  if (candidates.length === 0) return []

  const productMap = await loadBumpProducts(
    supabase,
    candidates.map((r) => r.product_id)
  )

  const offers: OrderBump[] = []
  for (const rule of candidates) {
    if (offers.length >= opts.limit) break
    const product = productMap.get(rule.product_id)
    const excluded = new Set<number>([...opts.cartProductIds, ...opts.usedProductIds])
    const offer = isOfferableBumpProduct(product)
      ? buildBump(rule, product)
      : await healCategoryRule(
          supabase,
          rule,
          product,
          excluded,
          opts.diagnostics,
          opts.cartCategoryIds
        )
    if (!offer) continue
    opts.usedProductIds.add(offer.product.id)
    opts.diagnostics?.state?.fillerRules.push(`${rule.id}:${rule.trigger_type}`)
    offers.push(offer)
  }
  return offers
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
 * Traduce una fila cruda de `get_products_by_collection` al producto del motor.
 * Devuelve `null` si la fila no trae un `id` utilizable (el RPC devuelve
 * `jsonb` sin tipos, así que todo se valida aquí).
 */
function bumpProductFromCollectionRow(row: Record<string, unknown>): BumpProduct | null {
  if (typeof row?.id !== "number") return null
  const saleWindow = {
    sale_price: typeof row.sale_price === "number" ? row.sale_price : null,
    sale_starts_at: typeof row.sale_starts_at === "string" ? row.sale_starts_at : null,
    sale_ends_at: typeof row.sale_ends_at === "string" ? row.sale_ends_at : null,
  }
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : "",
    slug: typeof row.slug === "string" ? row.slug : "",
    description: typeof row.description === "string" ? row.description : "",
    image_url: typeof row.image_url === "string" ? row.image_url : "",
    price: typeof row.price === "number" ? row.price : 0,
    sale_price: resolveSalePrice(saleWindow),
    stock_status: (row.stock_status as BumpProduct["stock_status"]) ?? "in_stock",
    category_id: typeof row.category_id === "number" ? row.category_id : 0,
    // La RPC ya filtra `WHERE p.is_visible = true`: se declara explícito para que
    // el producto pase el predicado de "publicado en tienda" sin ambigüedad.
    is_visible: true,
    sale_starts_at: saleWindow.sale_starts_at,
    sale_ends_at: saleWindow.sale_ends_at,
  }
}

/**
 * Genera un bump dinámico para una colección de receta sin regla admin:
 * elige el primer producto complementario de la colección (vía RPC
 * get_products_by_collection) que no esté en el carrito, con stock, visible y
 * por encima del piso de precio, y lo registra como regla `recipe_collection`
 * (1 por colección) para que POST /api/orders pueda validarlo. Fail-open:
 * devuelve null si algo falla.
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
  // El candidato se elige entre los que pasan el piso de precio: la colección
  // devuelve sus productos y el primero puede ser una especia de $10. La regla
  // que se registra aquí **persiste**, así que elegir barato dejaría el bump
  // barato para siempre.
  const product = rows
    .map((row) => bumpProductFromCollectionRow(row))
    .find(
      (p): p is BumpProduct =>
        p !== null && !cartProductIds.has(p.id) && isOfferableBumpProduct(p)
    )
  if (!product) return null

  const collection = collections.find((c) => c.slug === collectionSlug)
  const title = product.name || "Complemento para tu pedido"

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
    if (pErr || !isOfferableBumpProduct(existingProduct as BumpProduct | null)) return null
    return buildBump(rule, existingProduct as BumpProduct)
  }

  return buildBump(inserted as BumpRuleRow, product)
}
