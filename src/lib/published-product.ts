/**
 * "Publicado en tienda": el predicado único de lo que se puede ofrecer.
 *
 * Tres rutas construyen ofertas a partir de `bump_rules` (el motor de bumps del
 * carrito, la resolución del upsell post-compra y el cargo de ese upsell) y cada
 * una había recordado el filtro por su cuenta. La del upsell se lo saltó, así que
 * llegó a OFRECER —y a cobrar— productos que no están en la tienda: las 5 reglas
 * de categoría apuntan desde el 2026-10-03 a productos ocultos. La definición
 * vive aquí una sola vez para que no se vuelva a olvidar.
 *
 * `is_visible = true` **es** "publicado en tienda": es el predicado que usa la
 * tienda (`src/lib/data.ts`: `getProducts`, `getProductsPage`, `getProductBySlug`).
 * No hace falta mirar nada más:
 *  - `deleted_at` (papelera) no: la papelera despublica (55 productos en papelera
 *    y ninguno con `is_visible = true`).
 *  - `publish_at` / `unpublish_at` no: la programación editorial está sin usar
 *    (0 filas) y el cron, cuando la aplica, mueve `is_visible`.
 *
 * Estricto a propósito (`=== true`, no `!== false`): si un llamador olvida pedir
 * la columna, el producto se descarta en vez de colarse.
 */

/** Forma mínima que necesita el predicado. */
export interface PublishableProduct {
  is_visible?: boolean | null
  stock_status?: string | null
}

/** `true` solo si el producto está publicado en la tienda. */
export function isPublishedInStore(product: PublishableProduct | null | undefined): boolean {
  return product?.is_visible === true
}

/** `true` si el producto se puede ofrecer: publicado en tienda y con existencia. */
export function isOfferableProduct(product: PublishableProduct | null | undefined): boolean {
  return isPublishedInStore(product) && product?.stock_status !== "out_of_stock"
}
