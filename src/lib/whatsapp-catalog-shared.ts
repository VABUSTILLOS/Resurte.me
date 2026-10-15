// ============================================================
// Reglas puras del catálogo de WhatsApp, aptas para el CLIENTE.
//
// POR QUÉ ESTE ARCHIVO EXISTE (y no vive todo en `whatsapp-catalogs.ts`)
// ---------------------------------------------------------------------
// `whatsapp-catalogs.ts` importa `decryptToken` de `@/lib/foodos-whatsapp`,
// que importa `node:crypto`. Mientras esas reglas puras vivieron ahí, la
// página `/admin/whatsapp` —un componente cliente— no podía usarlas sin
// arrastrar el módulo entero: Next polyfilleaba `crypto` para el navegador
// (unos 400 KB de `crypto-browserify`) y enviaba al cliente la ruta de
// descifrado de tokens.
//
// La regla, entonces: **aquí sólo entran funciones puras**. Se permite importar
// otros módulos puros (como `category-name`), nunca nada que toque credenciales,
// red, almacenamiento o criptografía — eso va en `whatsapp-catalogs.ts`
// (servidor). Un import de servidor aquí vuelve a meter `crypto` en el bundle.
// ============================================================

/**
 * Orden efectivo de las categorías de un catálogo.
 *
 * Las **declaradas** van primero, en su orden; el resto conserva el orden en que
 * llegan (estable). Es el orden que se usa tanto para pintar la lista del panel
 * como para las secciones del mensaje, así que lo que el admin ve y lo que el
 * cliente recibe no pueden discrepar.
 */
import { normalizeCategoryName } from "@/lib/category-name"

export function orderCatalogCategories<T extends { id: number }>(
  declared: number[],
  present: T[]
): T[] {
  const rank = new Map(declared.map((id, index) => [id, index]))
  const positionOf = (id: number) =>
    rank.has(id) ? (rank.get(id) as number) : Number.MAX_SAFE_INTEGER
  // `sort` es estable desde ES2019: los empates conservan el orden de llegada.
  return [...present].sort((a, b) => positionOf(a.id) - positionOf(b.id))
}

/**
 * ¿Se puede sincronizar a Meta? Un producto sin precio (o en 0) no se puede
 * publicar en el catálogo, así que tampoco se puede vender.
 *
 * Vive aparte para que la UI marque los que no van a sincronizar con la MISMA
 * condición que los excluye del payload. Dos copias de `precio > 0` es como se
 * llega a ofrecer un producto que después desaparece en silencio.
 */
export function isCatalogSyncable(p: {
  price: number | null
  sale_price: number | null
}): boolean {
  return (p.sale_price ?? p.price ?? 0) > 0
}

/**
 * Separa una lista de productos en los que se pueden publicar y los que no.
 *
 * La UI declara el recorte con este número ("N sin precio quedan fuera") y el
 * sync excluye con la MISMA regla, así que el conteo que ve el admin no puede
 * discrepar de lo que de verdad se va a subir a Meta.
 */
export function splitSyncable<T extends { price: number | null; sale_price: number | null }>(
  products: T[]
): { syncable: T[]; unsyncable: T[] } {
  const syncable: T[] = []
  const unsyncable: T[] = []
  for (const p of products) {
    if (isCatalogSyncable(p)) syncable.push(p)
    else unsyncable.push(p)
  }
  return { syncable, unsyncable }
}

/**
 * Ids de un proveedor que se pueden agregar todavía a la curaduría.
 *
 * Es la definición ÚNICA de "agregable": `countAddableSupplierProducts` cuenta
 * sobre este mismo resultado, para que el número del chip y lo que de verdad se
 * agrega no puedan divergir.
 *
 * `knownIds` son los productos que la lista de "Agregar" puede ofrecer: incluir
 * uno que no está ahí sería prometer un producto que el botón no va a agregar.
 * Los ids repetidos cuentan una sola vez — `product_suppliers` admite varias
 * filas del mismo producto (distinto SKU) y el conteo no debe inflarse.
 */
export function addableSupplierProductIds(
  productIds: readonly number[],
  curatedIds: ReadonlySet<number>,
  knownIds: ReadonlySet<number>
): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const id of productIds) {
    if (seen.has(id)) continue
    seen.add(id)
    if (curatedIds.has(id)) continue
    if (!knownIds.has(id)) continue
    out.push(id)
  }
  return out
}

/** Cuántos productos de un proveedor se pueden agregar todavía (ver arriba). */
export function countAddableSupplierProducts(
  productIds: readonly number[],
  curatedIds: ReadonlySet<number>,
  knownIds: ReadonlySet<number>
): number {
  return addableSupplierProductIds(productIds, curatedIds, knownIds).length
}

/**
 * Agrupa categorías por NOMBRE (sumando sus conteos).
 *
 * POR QUÉ POR NOMBRE Y NO POR ID
 * ------------------------------
 * El mensaje de WhatsApp agrupa las secciones por `category_name`
 * (`buildAdminProductListSections`), así que dos categorías distintas con el
 * mismo nombre son **una sola sección** para el cliente. Si el panel las
 * mostrara por id, enseñaría dos filas donde el cliente ve una — el panel y el
 * mensaje dirían cosas distintas.
 *
 * Sumar por nombre es lo que hace que "se sumen aunque se llamen igual" **sin
 * tocar la tienda**: no reasigna `products.category_id` ni fusiona categorías,
 * sólo presenta junto lo que ya se envía junto.
 *
 * `lead` es el id que representa al grupo (el que se declara en el orden, el que
 * lleva la portada y el que recibe los arrastres); `ids` son todos los suyos.
 * La comparación de nombres es la de `normalizeCategoryName`, así que "Café" y
 * "Cafe" son el mismo grupo.
 */
export interface CategoryNameGroup {
  key: string
  name: string
  lead: number
  ids: number[]
  count: number
}

export function groupCategoriesByName(
  entries: readonly { id: number; name: string; count: number }[]
): CategoryNameGroup[] {
  const byName = new Map<string, CategoryNameGroup>()
  for (const entry of entries) {
    const key = normalizeCategoryName(entry.name)
    const group = byName.get(key) ?? {
      key,
      name: entry.name,
      lead: entry.id,
      ids: [],
      count: 0,
    }
    group.ids.push(entry.id)
    group.count += entry.count
    byName.set(key, group)
  }
  return [...byName.values()]
}
