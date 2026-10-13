// ============================================================
// Catálogo principal de WhatsApp: el que gobierna la bandera
// `products.show_in_whatsapp`.
//
// Antes de esto la bandera era huérfana: tenía switch, acción en
// lote, campo en el modal y badge de "pendiente de sync" en
// /admin/productos, pero ningún camino de sync la leía (el único
// productor era la curaduría `whatsapp_catalog_items`). Aquí vive
// el vínculo, en reglas puras, para que la UI y las actions no lo
// recalculen cada una por su cuenta.
//
// Invariante: `show_in_whatsapp` ⇔ visible en el catálogo principal.
// La base lo refuerza con el trigger de `00221`; este módulo es la
// mitad que decide QUÉ escribir y cómo previsualizarlo.
// ============================================================

export interface WaCatalogLike {
  id: string
  slug: string
  name: string
  is_active: boolean
  is_default: boolean
}

export interface WaProductFlag {
  id: number
  show_in_whatsapp: boolean
}

export interface WaMembershipRow {
  product_id: number
  position: number
  is_visible: boolean
}

export interface WaMembershipReconcile {
  /** Marcados en la tienda y ausentes de la curaduría: se agregarán. */
  toAdd: number[]
  /** Curados como visibles y sin la marca en la tienda: se quitarán. */
  toRemove: number[]
  /** Ya coinciden: no se tocan. */
  unchanged: number[]
}

const asc = (a: number, b: number) => a - b

/**
 * El catálogo principal, o `null` si no hay ninguno.
 *
 * Deliberadamente estricto: NO cae al primer catálogo activo. Un fallback
 * silencioso haría que el panel dijera "principal: X" cuando nadie lo eligió,
 * y la marca de los productos apuntaría a un catálogo que el admin nunca
 * nombró. El seed de `00221` sí elige uno para que la instalación no arranque
 * sin principal, pero esa decisión queda escrita en la base y es visible.
 */
export function resolveDefaultCatalog<T extends WaCatalogLike>(catalogs: T[]): T | null {
  return catalogs.find((c) => c.is_default) ?? null
}

/**
 * Siguiente posición libre de la curaduría: al final, nunca en medio.
 *
 * No renumera: las posiciones existentes son el ORDEN elegido por el admin y
 * tocarlas reordenaría el catálogo que el cliente ve en WhatsApp.
 */
export function nextCatalogPosition(rows: { position: number }[]): number {
  let max = 0
  for (const row of rows) {
    if (row.position > max) max = row.position
  }
  return positionAfter(max)
}

/** Siguiente posición a partir de un máximo ya conocido (evita releer la curaduría). */
export function positionAfter(maxPosition: number | null | undefined): number {
  return (maxPosition ?? 0) + 1
}

/**
 * Diff puro entre la marca de la tienda y la curaduría del principal.
 *
 * `is_visible = false` cuenta como "no curado": una fila oculta no está en el
 * catálogo, así que un producto marcado con una fila oculta se reporta como
 * `toAdd` (se re-visibiliza) y no como `unchanged`.
 */
export function buildWaMembershipReconcile(
  flags: WaProductFlag[],
  curated: WaMembershipRow[]
): WaMembershipReconcile {
  const marked = new Set(flags.filter((f) => f.show_in_whatsapp).map((f) => f.id))
  const curatedVisible = new Set(
    curated.filter((c) => c.is_visible).map((c) => c.product_id)
  )

  const toAdd: number[] = []
  const unchanged: number[] = []
  for (const id of marked) {
    if (curatedVisible.has(id)) unchanged.push(id)
    else toAdd.push(id)
  }

  const toRemove: number[] = []
  for (const id of curatedVisible) {
    if (!marked.has(id)) toRemove.push(id)
  }

  // Ordenados para que la previsualización sea estable entre corridas.
  return {
    toAdd: toAdd.sort(asc),
    toRemove: toRemove.sort(asc),
    unchanged: unchanged.sort(asc),
  }
}

/** ¿El diff no tiene nada que aplicar? */
export function isReconcileEmpty(diff: WaMembershipReconcile): boolean {
  return diff.toAdd.length === 0 && diff.toRemove.length === 0
}

/** Resumen en una línea para la previsualización y el toast. */
export function summarizeReconcile(diff: WaMembershipReconcile): string {
  if (isReconcileEmpty(diff)) {
    return "Las marcas de la tienda y el catálogo ya coinciden."
  }
  const parts: string[] = []
  if (diff.toAdd.length > 0) {
    parts.push(`${diff.toAdd.length} se agregarán al catálogo`)
  }
  if (diff.toRemove.length > 0) {
    parts.push(`${diff.toRemove.length} se quitarán`)
  }
  return parts.join(" · ")
}
