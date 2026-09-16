/**
 * Ronda 7 — productos relacionados (migración 00109).
 *
 * `products.related_product_ids` guarda los relacionados explícitos que el
 * admin elige en el formulario. El detalle de producto los prioriza en el
 * orden declarado y completa con el comportamiento histórico (misma categoría
 * y luego el resto del catálogo) hasta `RELATED_LIMIT`.
 *
 * Los helpers son puros: reciben colecciones ya filtradas por visibilidad y
 * disponibilidad de ciudad, así que un relacionado no disponible en la ciudad
 * simplemente se descarta.
 */

export const RELATED_LIMIT = 4

export interface RelatedInputs<T extends { id: number }> {
  /** Producto actual: nunca aparece entre los relacionados. */
  productId: number
  /** Relacionados explícitos, en el orden que eligió el admin. */
  explicitIds?: number[] | null
  /** Catálogo visible y disponible en la ciudad, indexado por id. */
  availableById: Map<number, T>
  /** Misma categoría, en el orden histórico. */
  sameCategory: T[]
  /** Resto del catálogo, en el orden histórico. */
  others: T[]
  limit?: number
}

/**
 * Devuelve hasta `limit` relacionados: primero los explícitos (en orden,
 * descartando ids inexistentes, no disponibles, duplicados y el propio
 * producto), luego la misma categoría y finalmente el resto.
 */
export function buildRelatedProducts<T extends { id: number }>({
  productId,
  explicitIds,
  availableById,
  sameCategory,
  others,
  limit = RELATED_LIMIT,
}: RelatedInputs<T>): T[] {
  const out: T[] = []
  const seen = new Set<number>([productId])

  const push = (candidate: T | undefined) => {
    if (!candidate || out.length >= limit || seen.has(candidate.id)) return
    seen.add(candidate.id)
    out.push(candidate)
  }

  for (const id of explicitIds ?? []) {
    if (out.length >= limit) break
    push(availableById.get(id))
  }
  for (const p of sameCategory) {
    if (out.length >= limit) break
    push(p)
  }
  for (const p of others) {
    if (out.length >= limit) break
    push(p)
  }

  return out
}
