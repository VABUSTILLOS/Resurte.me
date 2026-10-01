/**
 * Créditos de las fotos de producto que vienen de Wikimedia Commons.
 *
 * POR QUÉ ESTE ARCHIVO ES OBLIGATORIO Y NO UN DETALLE
 * ---------------------------------------------------
 * **7 de las 9 fotos de AB Foods exigen atribución** (CC BY o CC BY-SA). Una
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
  // NOTA: 13 productos de 00194 ya no aparecen aquí porque las migraciones
  // 00204 y 00206 los reapuntaron a imágenes generadas por IA en
  // /images/products/ai/ (sin atribución). El archivo del aguacate chunky
  // contenía AJOS (descarga mal rotulada — el crédito a Jon Sullivan era
  // además incorrecto); los otros 12 (papas, quesos crema y dedos de queso)
  // se reemplazaron por consistencia de catálogo a petición del usuario.
  {
    slug: "camaron-4150",
    archivo: "/images/products/ab-foods/camaron-4150-foto.webp",
    tituloCommons: "File:Raw shrimp.jpg",
    autor: "Fumikas Sagisavas",
    licencia: "CC0",
    licenciaUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Raw_shrimp.jpg",
  },
  {
    slug: "camaron-cocido-100200",
    archivo: "/images/products/ab-foods/camaron-cocido-100200-foto.webp",
    tituloCommons: "File:Shrimp (peeled) copy (51299192699).jpg",
    autor: "Texas Sea Grant from College Station",
    licencia: "CC BY 2.0",
    licenciaUrl: "https://creativecommons.org/licenses/by/2.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Shrimp_(peeled)_copy_(51299192699).jpg",
  },
  {
    slug: "camaron-cocido-4150",
    archivo: "/images/products/ab-foods/camaron-cocido-4150-foto.webp",
    tituloCommons: "File:Cooked shrimp.jpg",
    autor: "Fumikas Sagisavas",
    licencia: "CC0",
    licenciaUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Cooked_shrimp.jpg",
  },
  {
    slug: "cordon-bleu-mini",
    archivo: "/images/products/ab-foods/cordon-bleu-mini-foto.webp",
    tituloCommons: "File:Schnitzel Cordon bleu.JPG",
    autor: "Thomas Richter, User:THOMAS",
    licencia: "CC BY-SA 3.0",
    licenciaUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Schnitzel_Cordon_bleu.JPG",
  },
  {
    slug: "hamburguesa-bm-arrachera-caja-30pzs",
    archivo: "/images/products/ab-foods/hamburguesa-bm-arrachera-caja-30pzs-foto.webp",
    tituloCommons: "File:Beef patty (3154002720).jpg",
    autor: "stu_spivack",
    licencia: "CC BY-SA 2.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Beef_patty_(3154002720).jpg",
  },
  {
    slug: "hamburguesa-bm-mezquite-caja-30pzs",
    archivo: "/images/products/ab-foods/hamburguesa-bm-mezquite-caja-30pzs-foto.webp",
    tituloCommons: "File:Burgers cooking on a barbecue close-up.jpg",
    autor: "domdomegg",
    licencia: "CC BY 4.0",
    licenciaUrl: "https://creativecommons.org/licenses/by/4.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Burgers_cooking_on_a_barbecue_close-up.jpg",
  },
  {
    slug: "hamburguesa-bm-sirloin-caja-30pzs",
    archivo: "/images/products/ab-foods/hamburguesa-bm-sirloin-caja-30pzs-foto.webp",
    tituloCommons: "File:Raw beef steak, 2011.jpg",
    autor: "Jellaluna",
    licencia: "CC BY 2.0",
    licenciaUrl: "https://creativecommons.org/licenses/by/2.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Raw_beef_steak,_2011.jpg",
  },
  {
    slug: "hamburguesa-empanizada-pilgrims",
    archivo: "/images/products/ab-foods/hamburguesa-empanizada-pilgrims-foto.webp",
    tituloCommons: "File:Fried chicken Burger in Milan, Italy.jpg",
    autor: "Pava",
    licencia: "CC BY-SA 3.0 it",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/3.0/it/deed.en",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Fried_chicken_Burger_in_Milan,_Italy.jpg",
  },
  {
    slug: "tender-empanizado-pilgrims",
    archivo: "/images/products/ab-foods/tender-empanizado-pilgrims-foto.webp",
    tituloCommons: "File:Chicken tenders (8884884960).jpg",
    autor: "jeffreyw",
    licencia: "CC BY 2.0",
    licenciaUrl: "https://creativecommons.org/licenses/by/2.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Chicken_tenders_(8884884960).jpg",
  },
]

/** Licencias que **no** exigen atribución. Cualquier otra sí. */
const SIN_ATRIBUCION = ["cc0", "public domain", "no restrictions", "pd-"]

/** ¿La licencia obliga a atribuir? */
export function exigeAtribucion(licencia: string): boolean {
  const l = licencia.toLowerCase()
  return !SIN_ATRIBUCION.some((k) => l.includes(k))
}
