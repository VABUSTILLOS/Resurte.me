/**
 * Collection cover images — optimized local WebP versions.
 *
 * Reemplazan las imágenes remotas (Wikimedia, etc.) por versiones
 * locales comprimidas para carga rápida y consistencia visual.
 */

const COLLECTION_COVERS: Record<string, string> = {
  "hamburguesas-hot-dogs": "/images/collections/burger.webp",
  "taquerias-antojitos": "/images/collections/taqueria.webp",
  "sushi-comida-asiatica": "/images/collections/sushi.webp",
  "pizzas-comida-italiana": "/images/collections/pizza.webp",
  "pollo-alitas": "/images/collections/pollo.webp",
  "comida-mexicana-corrida": "/images/collections/fonda.webp",
  "mariscos-pescados": "/images/collections/mariscos.webp",
  "cortes-carne-asaderos": "/images/collections/cortes.webp",
  "cafeterias-crepas-desayunos": "/images/collections/cafe.webp",
  "saludable-ensaladas-pokes": "/images/collections/saludable.webp",
  "postres-panaderia-helados": "/images/collections/postres.webp",
  "comida-arabe-griega": "/images/collections/arabe.webp",
  "comida-venezolana-latina": "/images/collections/latina.webp",
  "bebidas-bares-botanas": "/images/collections/bebidas.webp",
}

/**
 * Devuelve la portada local optimizada para una colección, o `null`
 * si no existe una versión local (el caller decide el fallback).
 */
export function getCollectionCover(slug: string): string | null {
  return COLLECTION_COVERS[slug] ?? null
}
