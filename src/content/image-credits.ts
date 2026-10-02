/**
 * Créditos de las fotos de producto que vienen de Wikimedia Commons.
 *
 * ESTADO ACTUAL: VACÍO A PROPÓSITO
 * --------------------------------
 * Las 22 fotos de la migración 00194 fueron reemplazadas entre el 1 y el
 * 2-oct-2026 por imágenes generadas en casa (migraciones 00204, 00206, 00207
 * y 00210), así que ya no hay ninguna imagen que exija atribución. El
 * registro se mantiene —y su contrato en
 * `src/lib/image-credits.contract.test.ts`— por si vuelve a entrar material
 * con licencia: la entrada se agrega aquí y `/creditos` vuelve a listarla.
 *
 * Cuando había datos, NO se escribieron a mano: los emitía `bajar_fotos.py`
 * leyendo `extmetadata` de la API de Commons en el momento de descargar, así
 * que el autor y la licencia eran los que declaraba el archivo, no los que
 * recordaba quien lo bajó.
 */
export interface ImageCredit {
  /** Slug del producto en `products.slug`. */
  slug: string
  /** Ruta pública servida desde `public/`. */
  archivo: string
  /** Título del archivo en Commons (`File:…`). */
  tituloCommons: string
  /** Autoría tal como la declara Commons. */
  autor: string
  /** Nombre corto de la licencia, p. ej. `CC BY-SA 4.0`. */
  licencia: string
  /** URL de la licencia. Vacía solo si la licencia no la tiene. */
  licenciaUrl: string
  /** URL de la página del archivo en Commons. */
  origenUrl: string
}

export const IMAGE_CREDITS: readonly ImageCredit[] = [
  // Vacío a propósito: los 22 productos de 00194 fueron reapuntados a
  // imágenes generadas en casa (00204, 00206, 00207, 00210). Ver el bloque
  // de documentación al inicio del archivo.
]

/** Licencias que **no** exigen atribución. Cualquier otra sí. */
const SIN_ATRIBUCION = ["cc0", "public domain", "no restrictions", "pd-"]

/** ¿La licencia obliga a atribuir? */
export function exigeAtribucion(licencia: string): boolean {
  const l = licencia.toLowerCase()
  return !SIN_ATRIBUCION.some((k) => l.includes(k))
}
