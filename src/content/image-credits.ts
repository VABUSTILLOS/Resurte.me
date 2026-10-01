/**
 * Créditos de las fotos de producto que vienen de Wikimedia Commons.
 *
 * POR QUÉ ESTE ARCHIVO ES OBLIGATORIO Y NO UN DETALLE
 * ---------------------------------------------------
 * **La única foto de AB Foods que queda exige atribución** (CC BY-SA). Una
 * licencia CC BY sin atribuir no es una licencia: es una infracción. Este
 * registro es la mitad verificable de la atribución —`/creditos` es la mitad
 * visible— y `src/lib/image-credits.contract.test.ts` comprueba que cada foto
 * publicada tenga entrada, que el archivo exista y que ninguna licencia que
 * exija atribución quede sin autor y sin enlace a la licencia.
 *
 * Los datos NO se escribieron a mano: los emite `bajar_fotos.py` leyendo
 * `extmetadata` de la API de Commons en el momento de descargar, así que el
 * autor y la licencia son los que declara el archivo, no los que recordaba
 * quien lo bajó.
 *
 * Estas fotos son del **tipo** de alimento, no del SKU exacto: unas papas curly,
 * no «Papa Curly Savory caja 13.61 kg». Es lo que se puede obtener con licencia
 * clara sin usar el material del proveedor ni el de la competencia.
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
  // NOTA: 21 productos de 00194 ya no aparecen aquí porque las migraciones
  // 00204, 00206 y 00207 los reapuntaron a imágenes generadas por IA en
  // /images/products/ai/ (sin atribución), a petición del usuario. El archivo
  // del aguacate chunky contenía AJOS (descarga mal rotulada — el crédito a
  // Jon Sullivan era además incorrecto); los otros 20 (papas, quesos crema,
  // dedos de queso, hamburguesas, camarones y tender) se reemplazaron por
  // consistencia de catálogo.
  {
    slug: "cordon-bleu-mini",
    archivo: "/images/products/ab-foods/cordon-bleu-mini-foto.webp",
    tituloCommons: "File:Schnitzel Cordon bleu.JPG",
    autor: "Thomas Richter, User:THOMAS",
    licencia: "CC BY-SA 3.0",
    licenciaUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Schnitzel_Cordon_bleu.JPG",
  },
]

/** Licencias que **no** exigen atribución. Cualquier otra sí. */
const SIN_ATRIBUCION = ["cc0", "public domain", "no restrictions", "pd-"]

/** ¿La licencia obliga a atribuir? */
export function exigeAtribucion(licencia: string): boolean {
  const l = licencia.toLowerCase()
  return !SIN_ATRIBUCION.some((k) => l.includes(k))
}
