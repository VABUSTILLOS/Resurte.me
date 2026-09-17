import { createClient } from "@/lib/supabase/client"
import { normalizeName } from "@/lib/normalize"

/**
 * Catálogo de productos reales (tabla `products` de Supabase) para las
 * herramientas del panel. Degrada con gracia: si Supabase no está configurado
 * o la consulta falla, devuelve `[]` y los consumidores caen a sus mocks.
 */

export interface CatalogProduct {
  name: string
  unit: string
  price: number
}

/**
 * De dónde salió el precio de un ingrediente.
 * - `catalog`: producto real de Resurte.me, precio autoritativo.
 * - `example`: precio de ejemplo que rellena un hueco del catálogo. No es una
 *   medición del negocio y la UI debe decirlo.
 */
export type IngredientSource = "catalog" | "example"

export interface MergedIngredient {
  name: string
  unit: string
  price: number
  source: IngredientSource
}

let cachePromise: Promise<CatalogProduct[]> | null = null

async function fetchCatalogProducts(): Promise<CatalogProduct[]> {
  try {
    const supabase = createClient()
    if (!supabase) return []
    const { data, error } = await supabase
      .from("products")
      .select("name, price, unit")
      .eq("is_visible", true)
      .order("name")
    if (error) return []
    return (data as CatalogProduct[])?.filter((p) => p?.name) ?? []
  } catch {
    return []
  }
}

export function getCatalogProducts(): Promise<CatalogProduct[]> {
  if (!cachePromise) {
    cachePromise = fetchCatalogProducts()
  }
  return cachePromise
}

export function resetCatalogCache() {
  cachePromise = null
}

/**
 * Mezcla la lista de ingredientes mock con el catálogo real. Los productos del
 * catálogo ganan (nombre normalizado deduplicado) y los mocks rellenan los
 * huecos que el catálogo no cubre.
 *
 * Cada ingrediente declara su `source` para que el consumidor pueda avisar
 * cuando un food cost se está calculando con precios de ejemplo.
 */
export function mergeWithCatalog(
  mock: { name: string; unit: string; price: number }[],
  catalog: CatalogProduct[],
): MergedIngredient[] {
  if (catalog.length === 0) return mock.map((m) => ({ ...m, source: "example" as const }))
  const seen = new Set<string>()
  const merged: MergedIngredient[] = []
  // Catalog products first (authoritative prices)
  catalog.forEach((p) => {
    const key = normalizeName(p.name)
    if (seen.has(key)) return
    seen.add(key)
    merged.push({ name: p.name, unit: p.unit || "kg", price: p.price, source: "catalog" })
  })
  // Mock products fill the gaps
  mock.forEach((m) => {
    const key = normalizeName(m.name)
    if (seen.has(key)) return
    seen.add(key)
    merged.push({ ...m, source: "example" })
  })
  return merged
}

/** Cuántos ingredientes de la lista NO vienen del catálogo real. */
export function countExampleIngredients(list: { source: IngredientSource }[]): number {
  return list.reduce((n, item) => (item.source === "example" ? n + 1 : n), 0)
}
