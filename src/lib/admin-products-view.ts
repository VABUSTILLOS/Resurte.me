/**
 * Vista por defecto del listado de /admin/productos.
 *
 * La tabla tiene 11 columnas (~1192px): a 375px solo se ven la casilla de
 * selección y el nombre, y con los bloques de diagnóstico por delante el
 * primer producto arranca por debajo del pliegue. Por eso en móvil el listado
 * se abre en tarjetas y en escritorio se mantiene la tabla.
 */

export type ProductsView = "table" | "grid"

/** Debe coincidir con el prefijo `sm:` de Tailwind (breakpoint de 640px). */
export const MOBILE_VIEW_MEDIA_QUERY = "(max-width: 639px)"

/**
 * Vista efectiva del listado. Se resuelve en render (no en un efecto) para
 * respetar `react-hooks/set-state-in-effect` y para que el HTML prerenderizado
 * y el primer render del cliente coincidan (`isMobile` llega `false` en SSR).
 *
 * Prioridad: elección explícita del usuario > `?view=` de la URL > default.
 */
export function resolveProductsView(
  explicitView: string | null,
  isMobile: boolean,
  override: ProductsView | null,
): ProductsView {
  if (override) return override
  if (explicitView === "table" || explicitView === "grid") return explicitView
  return isMobile ? "grid" : "table"
}
