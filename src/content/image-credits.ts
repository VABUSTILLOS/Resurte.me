/**
 * Créditos de las fotos de producto que vienen de Wikimedia Commons.
 *
 * POR QUÉ ESTE ARCHIVO ES OBLIGATORIO Y NO UN DETALLE
 * ---------------------------------------------------
 * **17 de las 22 fotos de AB Foods exigen atribución** (CC BY o CC BY-SA). Una
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
  {
    slug: "aguacate-chunky-caja-7264kg",
    archivo: "/images/products/ab-foods/aguacate-chunky-caja-7264kg-foto.webp",
    tituloCommons: "File:Guacamole in a bowl by Jon Sullivan (4 April 2004).jpg",
    autor: "Jon Sullivan",
    licencia: "Public domain",
    licenciaUrl: "",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Guacamole_in_a_bowl_by_Jon_Sullivan_(4_April_2004).jpg",
  },
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
    slug: "dedos-queso-bolsa-181kg",
    archivo: "/images/products/ab-foods/dedos-queso-bolsa-181kg-foto.webp",
    tituloCommons: "File:Mozzarella sticks.jpg",
    autor: "travel oriented",
    licencia: "CC BY-SA 2.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Mozzarella_sticks.jpg",
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
    slug: "papa-conquest-delivery-teja-65-caja-1361kg",
    archivo: "/images/products/ab-foods/papa-conquest-delivery-teja-65-caja-1361kg-foto.webp",
    tituloCommons: "File:Waffle Fries (7075281933).jpg",
    autor: "kizzzbeth",
    licencia: "CC BY-SA 2.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Waffle_Fries_(7075281933).jpg",
  },
  {
    slug: "papa-curly-savory-caja-1361kg",
    archivo: "/images/products/ab-foods/papa-curly-savory-caja-1361kg-foto.webp",
    tituloCommons: "File:Curly fries (6932415251).jpg",
    autor: "Hungry Dudes",
    licencia: "CC BY 2.0",
    licenciaUrl: "https://creativecommons.org/licenses/by/2.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Curly_fries_(6932415251).jpg",
  },
  {
    slug: "papa-dulce-recta-38-caja-680kg",
    archivo: "/images/products/ab-foods/papa-dulce-recta-38-caja-680kg-foto.webp",
    tituloCommons: "File:A tray of sweet potato fries.jpg",
    autor: "JamesTheLaptop",
    licencia: "CC0",
    licenciaUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    origenUrl: "https://commons.wikimedia.org/wiki/File:A_tray_of_sweet_potato_fries.jpg",
  },
  {
    slug: "papa-gajo-10-cut-65-caja-1361kg",
    archivo: "/images/products/ab-foods/papa-gajo-10-cut-65-caja-1361kg-foto.webp",
    tituloCommons: "File:Crispy golden potato wedges on a baking tray ready for serving at home.jpg",
    autor: "Shixart1985",
    licencia: "CC BY 2.0",
    licenciaUrl: "https://creativecommons.org/licenses/by/2.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Crispy_golden_potato_wedges_on_a_baking_tray_ready_for_serving_at_home.jpg",
  },
  {
    slug: "papa-hash-brown-patty-caja-952kg",
    archivo: "/images/products/ab-foods/papa-hash-brown-patty-caja-952kg-foto.webp",
    tituloCommons: "File:Hash Browns.jpg",
    autor: "Sumit Surai",
    licencia: "CC BY-SA 4.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Hash_Browns.jpg",
  },
  {
    slug: "papa-ondulada-38-payette-caja-1361kg",
    archivo: "/images/products/ab-foods/papa-ondulada-38-payette-caja-1361kg-foto.webp",
    tituloCommons: "File:French fries crinkle cut.jpg",
    autor: "Kurtkaiser",
    licencia: "CC0",
    licenciaUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    origenUrl: "https://commons.wikimedia.org/wiki/File:French_fries_crinkle_cut.jpg",
  },
  {
    slug: "papa-rallada-hash-brown-caja-816kg",
    archivo: "/images/products/ab-foods/papa-rallada-hash-brown-caja-816kg-foto.webp",
    tituloCommons: "File:Shredded Potatoes - Kolkata 2011-04-07 2247.JPG",
    autor: "Biswarup Ganguly",
    licencia: "CC BY 3.0",
    licenciaUrl: "https://creativecommons.org/licenses/by/3.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Shredded_Potatoes_-_Kolkata_2011-04-07_2247.JPG",
  },
  {
    slug: "papa-rejilla-savory-caja-1224kg",
    archivo: "/images/products/ab-foods/papa-rejilla-savory-caja-1224kg-foto.webp",
    tituloCommons: "File:Flickr stuart spivack 335428860--Pommes gaufrettes and smoked salmon.jpg",
    autor: "Stuart Spivack from Cleveland, Ohio, USA",
    licencia: "CC BY-SA 2.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Flickr_stuart_spivack_335428860--Pommes_gaufrettes_and_smoked_salmon.jpg",
  },
  {
    slug: "queso-crema-krol-barra-136kg",
    archivo: "/images/products/ab-foods/queso-crema-krol-barra-136kg-foto.webp",
    tituloCommons: "File:Fromage-blanc1 cropped.jpg",
    autor: "Pancrat",
    licencia: "CC BY-SA 3.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Fromage-blanc1_cropped.jpg",
  },
  {
    slug: "queso-crema-reny-picot-136kg",
    archivo: "/images/products/ab-foods/queso-crema-reny-picot-136kg-foto.webp",
    tituloCommons: "File:Fromagecru hk jp.jpg",
    autor: "SUBARUsti2020hk",
    licencia: "CC BY-SA 4.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Fromagecru_hk_jp.jpg",
  },
  {
    slug: "queso-crema-reny-picot-caja-8kg",
    archivo: "/images/products/ab-foods/queso-crema-reny-picot-caja-8kg-foto.webp",
    tituloCommons: "File:Fromage blanc.jpg",
    autor: "Kaouther Bedoui",
    licencia: "CC BY-SA 4.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    origenUrl: "https://commons.wikimedia.org/wiki/File:Fromage_blanc.jpg",
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
