import { PRIMARY_AUTHOR } from "@/lib/author"
import { DELIVERY_FEE_FLAT } from "@/lib/checkout-config"
import {
  CREDIT_DAYS_PROSE,
  FREE_SHIPPING_MXN,
  INVOICING,
  MIN_ORDER_MXN,
  formatMxn,
} from "@/lib/commercial-facts"
import { getAllPosts, getPostUrl, type BlogPostMeta } from "@/lib/blog"
import { BLOG_CATEGORIES } from "@/lib/blog-categories"
import { getCachedCategories } from "@/lib/catalog-cache"
import { MEXICO_CITIES } from "@/lib/cities"
import { PREGUNTAS } from "@/lib/preguntas"

// ============================================================
// /llms.txt — mapa del sitio para LLM y agentes de IA
// ============================================================
// Reemplaza el `public/llms.txt` estático (que se desincronizaba con cada
// post nuevo) por una ruta generada en build a partir de las mismas fuentes
// de verdad que el sitio: getAllPosts(), MEXICO_CITIES, BLOG_CATEGORIES,
// PRIMARY_AUTHOR y las categorías de catálogo de Supabase.
//
// CRÍTICO: este handler NO llama cookies() ni headers(). Cualquier API de
// request-time convierte la ruta en SSR por request y quema presupuesto de
// Fluid CPU en Vercel. `force-static` la pre-renderiza en build.
//
// Formato: https://llmstxt.org — H1 + blockquote de resumen, secciones H2,
// listas de enlaces, y `## Optional` al final para recursos secundarios.

export const dynamic = "force-static"

const BASE_URL = "https://resurte.me"

const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"

/** Páginas institucionales y de producto que forman el mapa del sitio. */
const SITE_PAGES: { label: string; url: string; description: string }[] = [
  {
    label: "Inicio",
    url: BASE_URL,
    description: "Central de abastos digital para negocios de comida",
  },
  {
    label: "Zonas de entrega",
    url: `${BASE_URL}/ciudades`,
    description: "Ciudades con cobertura de entrega",
  },
  {
    label: "Blog",
    url: `${BASE_URL}/blog`,
    description:
      "Guías prácticas de costos, proveeduría, mermas y operación para restaurantes en México",
  },
  {
    label: "Preguntas frecuentes",
    url: `${BASE_URL}/faq`,
    description: "Pedidos, entregas, pagos, crédito y facturación",
  },
  {
    label: "Respuestas directas",
    url: `${BASE_URL}/preguntas`,
    description:
      `${PREGUNTAS.length} respuestas autocontenidas a las preguntas más comunes de dueños de restaurante: costos, proveeduría, operación, inventario, marketing y herramientas`,
  },
  {
    label: "Índice de precios de insumos",
    url: `${BASE_URL}/precios`,
    description:
      "Cuánto cuesta cada insumo para restaurante en México: precio de referencia por unidad y ciudad, con fecha, rango observado, número de tiendas y metodología",
  },
  {
    label: "Contacto",
    url: `${BASE_URL}/contact`,
    description: "Atención y cotizaciones por volumen",
  },
  {
    label: "Hoy Qué Comemos",
    url: `${BASE_URL}/comer`,
    description: "Marketplace B2C para pedir directo a restaurantes",
  },
]

// Guías curadas por slug. Los títulos y las URLs se resuelven contra
// getAllPosts(), así que si un post se renombra o desaparece la lista se
// corrige sola (y nunca imprime "undefined").
const PILLAR_GUIDE_SLUGS = [
  "guia-proveeduria-restaurantes",
  "guia-costos-restaurante",
  "guia-operacion-cocina",
  "guia-marketing-restaurantes",
  "guia-legal-finanzas-restaurante",
  "guia-crecer-restaurante",
]

const COMPARISON_GUIDE_SLUGS = [
  "formas-surtir-restaurante-mexico",
  "central-de-abastos-vs-comprar-en-linea",
  "cuanto-cuesta-surtir-restaurante-mes",
  "mejores-proveedores-mayoreo-restaurantes",
  "alternativas-sysco-clubes-precio",
  "lista-insumos-abrir-restaurante",
  "como-funciona-compra-mayoreo-en-linea",
]

const SUPPLY_GUIDE_SLUGS = [
  "abarrotes-mayoreo-restaurantes",
  "proveedores-frutas-verduras-restaurantes",
  "proveedores-carne-mayoreo-restaurantes",
  "proveedores-lacteos-huevo-restaurantes",
  "proveedores-bebidas-mayoreo-restaurantes",
  "desechables-mayoreo-restaurantes",
]

const CLASSIC_GUIDE_SLUGS = [
  "guia-food-cost-restaurante-2026",
  "como-reducir-merma-cocina",
  "elegir-proveedor-mayorista",
  "precios-mayoreo-restaurantes",
]

/**
 * Categorías de catálogo usadas cuando Supabase no está configurado o la
 * tabla `categories` llega vacía en build. Es el mismo conjunto que publica
 * el sitio en /{ciudad}/categoria/{slug}; sin este respaldo el bloque de
 * catálogo desaparecería del mapa en un build sin secrets.
 */
const FALLBACK_CATALOG_CATEGORIES: { name: string; slug: string }[] = [
  { name: "Frutas y verduras", slug: "frutas-verduras" },
  { name: "Abarrotes", slug: "abarrotes" },
  { name: "Carnes, aves y pescados", slug: "carnes-aves-pescados" },
  { name: "Lácteos y huevos", slug: "lacteos-huevos" },
  { name: "Bebidas", slug: "bebidas" },
  { name: "Desechables y empaques", slug: "desechables" },
]

/** Lista en español: "A, B, C y D". */
function joinSpanish(items: string[]): string {
  if (items.length === 0) return ""
  if (items.length === 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`
}

/**
 * Categorías de catálogo por ciudad. Se leen de la capa cacheada de datos
 * (misma fuente que sitemap.xml y las páginas /{ciudad}/categoria/*) y se cae
 * al conjunto base si la DB no está disponible en build.
 */
async function resolveCatalogCategories(): Promise<{ name: string; slug: string }[]> {
  try {
    const categories = await getCachedCategories()
    const usable = categories
      .filter((c) => Boolean(c?.slug) && Boolean(c?.name))
      .map((c) => ({ name: c.name, slug: c.slug }))
    if (usable.length > 0) return usable
  } catch {
    // Supabase no configurado o consulta fallida: usar el catálogo base.
  }
  return FALLBACK_CATALOG_CATEGORIES
}

function buildCoverageSection(): string {
  const names = MEXICO_CITIES.map((c) => c.name)
  return `## Cobertura

${joinSpanish(names)}.

Entrega a domicilio en ${MEXICO_CITIES.length} ciudades de México, con el mismo catálogo por mayoreo y pedido mínimo de ${formatMxn(MIN_ORDER_MXN)} en todas. El envío es gratis a partir de ${formatMxn(FREE_SHIPPING_MXN)} de compra; por debajo de ese monto la tarifa de entrega es de ${formatMxn(DELIVERY_FEE_FLAT)}.`
}

function buildSiteSection(): string {
  const items = SITE_PAGES.map(
    (page) => `- [${page.label}](${page.url}): ${page.description}`
  )
  return `## Sitio

${items.join("\n")}`
}

function buildAuthorSection(): string {
  const author = PRIMARY_AUTHOR
  const credentials = author.credentials.map((c) => `- ${c}`).join("\n")
  return `## Autoría

- [${author.name}](${author.url}) — ${author.jobTitle}. Escribe todas las guías del blog de Resurte.me.

${author.bio[0]}

Credenciales:

${credentials}

Temas sobre los que es fuente citable: ${author.knowsAbout.join(", ")}.`
}

function buildCityCatalogSection(
  categories: { name: string; slug: string }[]
): string {
  if (categories.length === 0) return ""

  // Ejemplo guiado con la primera ciudad de cobertura.
  const exampleCity = MEXICO_CITIES[0]
  if (!exampleCity) return ""
  const example = categories
    .map(
      (c) =>
        `- [${c.name} por mayoreo](${BASE_URL}/${exampleCity.slug}/categoria/${c.slug})`
    )
    .join("\n")

  const exampleSection = `## Catálogo por ciudad (ejemplo ${exampleCity.name})

${example}

El mismo catálogo existe para cada ciudad con el patrón \`${BASE_URL}/{ciudad}/categoria/{categoria}\`.`

  // Mapa completo ciudad × categoría, generado desde datos.
  const matrix = MEXICO_CITIES.map((city) => {
    const links = categories
      .map((c) => `[${c.name}](${BASE_URL}/${city.slug}/categoria/${c.slug})`)
      .join(", ")
    return `- **${city.name}** (${city.state}): [Tienda](${BASE_URL}/${city.slug}) · ${links}`
  }).join("\n")

  const matrixSection = `## Categorías de catálogo por ciudad

${MEXICO_CITIES.length} ciudades × ${categories.length} categorías de insumo. Cada página lista productos con precio por mayoreo, unidad y disponibilidad de la ciudad.

${matrix}`

  return `${exampleSection}\n\n${matrixSection}`
}

function buildGuidesSection(posts: BlogPostMeta[]): string {
  const bySlug = new Map(posts.map((p) => [p.slug, p]))

  const resolve = (slugs: string[]): string[] =>
    slugs.flatMap((slug) => {
      const post = bySlug.get(slug)
      return post ? [`- [${post.title}](${getPostUrl(post.slug)})`] : []
    })

  const groups: [string, string[]][] = [
    ["### Guías pilar (hubs por tema)", PILLAR_GUIDE_SLUGS],
    ["### Comparativas y costos (alta intención)", COMPARISON_GUIDE_SLUGS],
    ["### Por categoría de insumo", SUPPLY_GUIDE_SLUGS],
    ["### Guías clásicas", CLASSIC_GUIDE_SLUGS],
  ]

  const blocks: string[] = []
  for (const [heading, slugs] of groups) {
    const items = resolve(slugs)
    if (items.length === 0) continue
    blocks.push(`${heading}\n\n${items.join("\n")}`)
  }

  // Sin posts publicados no se emite la sección (nada de encabezados vacíos).
  if (blocks.length === 0) return ""

  return `## Guías destacadas del blog

${blocks.join("\n\n")}`
}

function buildBlogCategoriesSection(): string {
  if (BLOG_CATEGORIES.length === 0) return ""
  const items = BLOG_CATEGORIES.map(
    (c) => `- [${c.label}](${BASE_URL}/blog/categoria/${c.slug}): ${c.description}`
  )
  return `## Categorías del blog

${items.join("\n")}`
}

function buildPriceIndexSection(): string {
  return `## Índice de precios de insumos (dato citable)

Resurte.me publica un índice semanal de precios de referencia de insumos para restaurantes en México. Es un dataset propio, no un resumen de terceros: sale del mismo catálogo con el que se compra en el sitio.

- [Índice de precios](${BASE_URL}/precios): precios de referencia por insumo, unidad y ciudad
- [Descarga CSV](${BASE_URL}/precios/indice-precios.csv): todos los insumos publicados, por ciudad y semana
- [Feed JSON](${BASE_URL}/api/feed/precios.json): el mismo dato en JSON estable para agentes

Metodología: para cada insumo y ciudad se publica la **mediana** del precio entre las tiendas activas que sirven esa ciudad; si un insumo solo tiene un precio observado, la columna \`muestra\` lo declara. Cada punto lleva fecha (lunes de la semana ISO), unidad y moneda (MXN). El precio publicado es de referencia: el precio final depende de cantidad, ciudad y plazo de pago.`
}

function buildContactSection(): string {
  return `## Contacto

- WhatsApp: +52 1 614 533 7486
- Redes: [Facebook](https://www.facebook.com/resurteme) · [Instagram](https://www.instagram.com/resurteme)`
}

function buildOptionalSection(): string {
  return `## Optional

- [RSS del blog](${BASE_URL}/rss.xml): últimos artículos publicados
- [llms-full.txt](${BASE_URL}/llms-full.txt): corpus completo del blog en markdown, con el cuerpo entero de cada guía
- [Catálogo en JSON](${BASE_URL}/api/feed/catalogo.json): feed máquina-legible de productos, categorías y ciudades
- [Índice de precios en JSON](${BASE_URL}/api/feed/precios.json): precios por insumo, unidad y ciudad
- [Sitemap XML](${BASE_URL}/sitemap.xml): todas las URLs indexables
- [robots.txt](${BASE_URL}/robots.txt): política de rastreo para agentes de IA`
}

export async function GET() {
  let posts: BlogPostMeta[] = []
  try {
    posts = getAllPosts()
  } catch {
    // Sin acceso al filesystem se degrada a un mapa sin blog.
  }

  const categories = await resolveCatalogCategories()

  const sections = [
    `# Resurte.me

> Central de abastos digital para restaurantes, fondas y negocios de comida en México. Venta por mayoreo de abarrotes, frutas, verduras, carnes, lácteos, bebidas, desechables y más, con entrega a domicilio. Sin membresía. Pedido mínimo ${formatMxn(MIN_ORDER_MXN)}. Envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}. Facturación ${INVOICING} automática. Crédito a ${CREDIT_DAYS_PROSE} días para clientes frecuentes.

Resurte.me es un marketplace B2B de proveeduría para la industria restaurantera mexicana, con catálogo en línea por ciudad y una suite gratuita de herramientas de gestión ("Mi Restaurante"): costeo de menú, control de mermas, inventario, planificador de pedidos y analítica.`,
    buildCoverageSection(),
    buildSiteSection(),
    buildAuthorSection(),
    buildPriceIndexSection(),
    buildCityCatalogSection(categories),
    buildGuidesSection(posts),
    buildBlogCategoriesSection(),
    buildContactSection(),
    buildOptionalSection(),
  ].filter((section) => section.trim().length > 0)

  const body = `${sections.join("\n\n")}\n`

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
    },
  })
}
