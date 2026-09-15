/**
 * Inventario de activos GEO — qué superficie citable existe hoy en el sitio.
 *
 * El panel `/admin/seo-ia` lo muestra para responder una pregunta concreta:
 * "¿qué tiene la IA para citar de Resurte.me y qué le falta?". Es un inventario
 * real, calculado desde los mismos módulos que generan las páginas, no una
 * lista escrita a mano que se queda obsoleta.
 *
 * `revalidate: false` a propósito: el inventario solo cambia al desplegar, así
 * que se congela por el resto del despliegue y el panel no recorre los 226 MDX
 * en cada visita.
 */
import { unstable_cache } from "next/cache"
import { AI_CRAWLERS, CITABLE_AI_CRAWLERS } from "./ai-crawlers"
import { getAllPosts } from "./blog"
import { BLOG_CATEGORIES } from "./blog-categories"
import { MEXICO_CITIES } from "./cities"
import { GEO_ENGINES, GEO_PANEL_SIZE, GEO_QUERIES } from "./geo-queries"
import { PREGUNTAS } from "./preguntas"

/** Categorías cuyas piezas llevan tabla de fuentes y metodología. */
const CIFRAS_CATEGORIES = ["costos", "proveeduria"] as const

interface GeoAssetGroup {
  id: string
  title: string
  /** Qué aporta esta superficie cuando un motor la cita. */
  why: string
  /** Ruta o rutas públicas donde vive. */
  where: string
  count: number
  /** Etiqueta del conteo, para que "54" se lea como "54 preguntas". */
  unit: string
}

export interface GeoInventory {
  groups: GeoAssetGroup[]
  totalAssets: number
  /** Posts con bloque "Respuesta rápida" extraíble. */
  postsWithQuickAnswer: number
  postsTotal: number
  /** Preguntas objetivo del panel mensual que apuntan a una ruta viva. */
  panelQueries: number
  panelEngines: number
  panelChecks: number
  /** Tokens de User-Agent de IA permitidos en robots.txt. */
  crawlersAllowed: number
  crawlersCitable: number
}

/** Cálculo puro: testeable sin tocar `unstable_cache`. */
export function computeGeoInventory(): GeoInventory {
  const posts = getAllPosts()
  const conRespuesta = posts.filter((p) => Boolean(p.respuestaRapida?.trim()))
  const conCifras = posts.filter((p) =>
    (CIFRAS_CATEGORIES as readonly string[]).includes(p.category)
  )

  const groups: GeoAssetGroup[] = [
    {
      id: "respuesta-rapida",
      title: "Respuesta rápida en cada artículo",
      why: "Un párrafo autocontenido que un motor puede citar literalmente sin reformular.",
      where: "/blog/<slug>",
      count: conRespuesta.length,
      unit: "artículos",
    },
    {
      id: "preguntas",
      title: "Preguntas con respuesta curada",
      why: "Pregunta y respuesta en el mismo bloque: la forma exacta en que responde un asistente.",
      where: "/preguntas",
      count: PREGUNTAS.length,
      unit: "preguntas",
    },
    {
      id: "datos-clave",
      title: "Datos clave en páginas de categoría y colección",
      why: "Condiciones comerciales en tabla: pedido mínimo, envío gratis, facturación.",
      where: "/<ciudad>/categoria/<categoria>",
      count: BLOG_CATEGORIES.length * MEXICO_CITIES.length,
      unit: "combinaciones",
    },
    {
      id: "fuentes-metodologia",
      title: "Fuentes y metodología",
      why: "Declara de dónde salen las cifras. Es lo que hace citable un dato numérico.",
      where: "/blog/<slug>",
      count: conCifras.length,
      unit: "artículos con cifras",
    },
    {
      id: "precios",
      title: "Índice de precios de insumos",
      why: "Dato con fecha y muestra, el tipo de cifra que un motor cita con gusto.",
      where: "/precios",
      count: 1,
      unit: "índice público",
    },
    {
      id: "categorias-blog",
      title: "Hubs de categoría del blog",
      why: "Páginas de resumen que agrupan y ordenan el contenido de un tema.",
      where: "/blog/categoria/<categoria>",
      count: BLOG_CATEGORIES.length,
      unit: "hubs",
    },
    {
      id: "ciudades",
      title: "Páginas por ciudad",
      why: "Cobertura geográfica: responde consultas locales, donde la IA tiene poco material.",
      where: "/<ciudad>",
      count: MEXICO_CITIES.length,
      unit: "ciudades",
    },
    {
      id: "feeds",
      title: "Feeds para agentes",
      why: "Catálogo y precios en JSON para que un agente los consuma sin scrapear HTML.",
      where: "/api/feed/catalogo.json · /api/feed/precios.json",
      count: 2,
      unit: "feeds JSON",
    },
    {
      id: "llms-txt",
      title: "llms.txt y llms-full.txt",
      why: "Mapa del sitio para modelos: qué es Resurte.me y cuál es la URL de cada dato.",
      where: "/llms.txt · /llms-full.txt",
      count: 2,
      unit: "archivos",
    },
  ]

  return {
    groups,
    totalAssets: groups.reduce((sum, g) => sum + g.count, 0),
    postsWithQuickAnswer: conRespuesta.length,
    postsTotal: posts.length,
    panelQueries: GEO_QUERIES.length,
    panelEngines: GEO_ENGINES.length,
    panelChecks: GEO_PANEL_SIZE,
    crawlersAllowed: AI_CRAWLERS.length,
    crawlersCitable: CITABLE_AI_CRAWLERS.length,
  }
}

/** Inventario congelado por el despliegue. */
export const getGeoInventory = unstable_cache(
  async (): Promise<GeoInventory> => computeGeoInventory(),
  ["geo-inventory-v1"],
  { revalidate: false, tags: ["geo-inventory"] }
)

