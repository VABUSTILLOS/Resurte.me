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
 */
export function mergeWithCatalog(
  mock: { name: string; unit: string; price: number }[],
  catalog: CatalogProduct[],
): { name: string; unit: string; price: number }[] {
  if (catalog.length === 0) return mock
  const seen = new Set<string>()
  const merged: { name: string; unit: string; price: number }[] = []
  // Catalog products first (authoritative prices)
  catalog.forEach((p) => {
    const key = normalizeName(p.name)
    if (seen.has(key)) return
    seen.add(key)
    merged.push({ name: p.name, unit: p.unit || "kg", price: p.price })
  })
  // Mock products fill the gaps
  mock.forEach((m) => {
    const key = normalizeName(m.name)
    if (seen.has(key)) return
    seen.add(key)
    merged.push(m)
  })
  return merged
}
