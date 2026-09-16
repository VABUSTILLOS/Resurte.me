/**
 * Afinidad por ingrediente para order bumps.
 *
 * El motor de bumps (`order-bumps.ts`) ordenaba por categoría/colección: cruzaba
 * `products.tags` (cocina: "taqueria", "tacos") con los tags de
 * `restaurant_collections`. Eso no distingue "carne → salsa" de "carne → postre".
 *
 * Este módulo responde a la pregunta que el cliente sí hace: *¿qué ingrediente
 * le falta a lo que ya lleva?* para dos fuentes:
 *
 *   1. **Recetario** (`src/lib/recipes.ts`): si el carrito tiene ingredientes de
 *      una receta, los demás ingredientes de esa receta son candidatos.
 *   2. **Pares curados** (tabla `bump_affinity`, editable por admin): el escape
 *      para lo que el recetario no cubre.
 *
 * El puente entre el texto libre del recetario ("Cebolla blanca") y el catálogo
 * ("Cebolla Blanca") es `matchProduct`: match exacto normalizado → sin unidades
 * ni calificadores → por prefijo. Medido contra el catálogo real cubre 201 de
 * 212 ingredientes (94.8%); el residuo lo cubren los pares curados.
 *
 * Todo es puro y sin I/O a propósito: vitest corre con `environment: "node"` y
 * solo incluye pruebas `.ts` bajo `src`, así que la lógica que importa debe
 * vivir aquí y no en un componente.
 */

import { normalizeName } from "@/lib/normalize"

export interface AffinityProduct {
  id: number
  name: string
  slug: string
}

export type AffinityKind = "recipe" | "curated"

/** Fila de `bump_affinity`: el carrito con `source` sugiere `target`. */
export interface AffinityPairRow {
  source_product_id: number
  target_product_id: number
  kind: AffinityKind
  weight: number
}

/** Receta mínima para el cálculo (compatible con `RecipeInput`). */
export interface AffinityRecipe {
  name: string
  ingredients: string[]
}

export interface AffinityCandidate {
  productId: number
  /** Nº de productos distintos del carrito que apuntan a este candidato. */
  score: number
  /** Suma de pesos curados (0 si el candidato solo viene del recetario). */
  weight: number
  kind: AffinityKind
  /** Subtítulo mostrado en la tarjeta ("Para tu receta de Tacos al Pastor"). */
  reason: string
}

/** Presentación al final del nombre: "100g", "500 ml", "1 kg", "2 pzas". */
const UNIT_RE = /\b\d+(?:[.,]\d+)?\s*(?:g|kg|mg|ml|l|lt|litros?|oz|lb|libras?|pzas?|piezas?)\b/g

/** Adjetivos de estado/preparación que no cambian de qué producto se trata. */
const QUALIFIER_RE =
  /\b(?:frescos?|frescas?|molidos?|molidas?|enteros?|enteras?|en polvo|rebanados?|rebanadas?|naturales?|org[aá]nicos?|org[aá]nicas?|secos?|secas?|precocidos?|precocidas?|congelados?|congeladas?|picados?|picadas?)\b/g

/**
 * Clave de comparación tolerante a presentación y estado:
 * "Pimienta Negra Molida 100g" y "Pimienta negra" colapsan al mismo valor.
 */
export function normalizeIngredient(name: string): string {
  return normalizeName(name)
    .replace(UNIT_RE, " ")
    .replace(QUALIFIER_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export interface ProductIndex {
  byNormalized: Map<string, AffinityProduct>
  byBase: Map<string, AffinityProduct>
  /** Claves base ordenadas: hace determinista el match por prefijo. */
  baseKeys: string[]
}

export function buildProductIndex(products: AffinityProduct[]): ProductIndex {
  const byNormalized = new Map<string, AffinityProduct>()
  const byBase = new Map<string, AffinityProduct>()
  for (const product of products) {
    const normalized = normalizeName(product.name)
    if (normalized && !byNormalized.has(normalized)) byNormalized.set(normalized, product)
    const base = normalizeIngredient(product.name)
    if (base && !byBase.has(base)) byBase.set(base, product)
  }
  return { byNormalized, byBase, baseKeys: Array.from(byBase.keys()).sort() }
}

/**
 * Resuelve el texto libre de un ingrediente a un producto del catálogo.
 * Devuelve null si no hay match (el ingrediente simplemente no participa).
 */
export function matchProduct(
  ingredient: string,
  index: ProductIndex
): AffinityProduct | null {
  if (!ingredient) return null

  const exact = index.byNormalized.get(normalizeName(ingredient))
  if (exact) return exact

  const base = normalizeIngredient(ingredient)
  if (!base) return null
  const byBase = index.byBase.get(base)
  if (byBase) return byBase

  // Prefijo en cualquier dirección: "jitomate" ↔ "jitomate bola".
  for (const key of index.baseKeys) {
    if (key.startsWith(`${base} `) || base.startsWith(`${key} `)) {
      return index.byBase.get(key) ?? null
    }
  }
  return null
}

interface Accumulator {
  sources: Set<number>
  weight: number
  kind: AffinityKind
  reason: string
}

/**
 * Candidatos de bump ordenados por afinidad con el contenido del carrito.
 *
 * `score` (nº de productos del carrito que apuntan al candidato) domina el
 * orden: un producto que completa tres ingredientes que ya llevas gana a uno
 * que solo completa uno. `weight` curado desempata, y `productId` cierra el
 * orden para que el resultado sea estable entre requests.
 */
export function computeAffinity(input: {
  cartProducts: AffinityProduct[]
  allProducts: AffinityProduct[]
  recipes: Record<string, AffinityRecipe[]>
  curatedPairs: AffinityPairRow[]
  limit: number
}): AffinityCandidate[] {
  const { cartProducts, allProducts, recipes, curatedPairs, limit } = input
  if (cartProducts.length === 0 || limit <= 0) return []

  const cartById = new Map(cartProducts.map((p) => [p.id, p]))
  const index = buildProductIndex(allProducts)
  const accum = new Map<number, Accumulator>()

  const add = (
    targetId: number,
    sourceId: number,
    weight: number,
    kind: AffinityKind,
    reason: string
  ) => {
    if (targetId === sourceId || cartById.has(targetId)) return
    const existing = accum.get(targetId)
    if (!existing) {
      accum.set(targetId, {
        sources: new Set([sourceId]),
        weight,
        kind,
        reason,
      })
      return
    }
    existing.sources.add(sourceId)
    existing.weight += weight
    // Un par curado es intención explícita del admin: gana sobre el recetario.
    if (kind === "curated" && existing.kind !== "curated") {
      existing.kind = "curated"
      existing.reason = reason
    }
  }

  for (const list of Object.values(recipes)) {
    for (const recipe of list) {
      const items: AffinityProduct[] = []
      const seenIds = new Set<number>()
      for (const ingredient of recipe.ingredients ?? []) {
        const match = matchProduct(ingredient, index)
        if (match && !seenIds.has(match.id)) {
          seenIds.add(match.id)
          items.push(match)
        }
      }

      const inCart = items.filter((p) => cartById.has(p.id))
      if (inCart.length === 0) continue

      for (const source of inCart) {
        for (const target of items) {
          if (target.id === source.id) continue
          add(target.id, source.id, 0, "recipe", `Para tu receta de ${recipe.name}`)
        }
      }
    }
  }

  const productById = new Map(allProducts.map((p) => [p.id, p]))
  for (const pair of curatedPairs) {
    const source = cartById.get(pair.source_product_id)
    if (!source) continue
    const target = productById.get(pair.target_product_id)
    if (!target) continue
    add(target.id, source.id, pair.weight, "curated", `Ideal con ${source.name}`)
  }

  const candidates: AffinityCandidate[] = []
  for (const [productId, acc] of accum) {
    candidates.push({
      productId,
      score: acc.sources.size,
      weight: acc.weight,
      kind: acc.kind,
      reason: acc.reason,
    })
  }

  candidates.sort(
    (a, b) => b.score - a.score || b.weight - a.weight || a.productId - b.productId
  )
  return candidates.slice(0, limit)
}
