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
// La regla, entonces: **aquí sólo entran funciones puras sin un solo import
// de runtime**. Si algo necesita credenciales, red o criptografía, va en
// `whatsapp-catalogs.ts` (servidor), no aquí.
// ============================================================

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
