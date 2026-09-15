import { MEXICO_CITIES } from "@/lib/cities"
import {
  CREDIT_DAYS_PROSE,
  FREE_SHIPPING_MXN,
  INVOICING,
  MIN_ORDER_MXN,
  formatMxn,
} from "./commercial-facts"
import { PRIMARY_AUTHOR, getAuthorReference, ORGANIZATION_ID, SITE_NAME, SITE_URL } from "@/lib/author"

/**
 * Structured data helpers for JSON-LD schema.org markup.
 * Injects into pages via <script type="application/ld+json">.
 */

// WhatsApp number for structured data — resolves at build time via Next.js env inlining
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"

/**
 * Perfiles externos de la marca. Los motores de respuesta consolidan la
 * entidad "Resurte.me" cruzando estos enlaces con el Knowledge Graph: cuanto
 * más `sameAs` verificables, menos ambigüedad entre "Resurte" y "Resurte.me".
 *
 * PENDIENTE: agregar aquí las URLs reales de Google Business Profile,
 * Wikidata, LinkedIn y YouTube cuando existan. No se inventan: un `sameAs`
 * que no resuelve debilita la entidad en vez de reforzarla (ver Fase 8).
 */
const BRAND_PROFILES = [
  "https://www.facebook.com/resurteme",
  "https://www.instagram.com/resurteme",
  "https://wa.me/" + WHATSAPP_NUMBER,
]

/** Temas que la organización declara dominar. Deben coincidir con el contenido real. */
const ORGANIZATION_KNOWS_ABOUT = [
  "Proveeduría para restaurantes",
  "Compra de insumos por mayoreo",
  "Central de abastos",
  "Abarrotes por mayoreo",
  "Frutas y verduras por mayoreo",
  "Carnes al mayoreo",
  "Costeo de menú y food cost",
  "Control de mermas e inventario",
]

interface OrganizationSchema {
  "@context": "https://schema.org"
  "@type": "Organization"
  "@id": string
  name: string
  alternateName: string[]
  url: string
  logo: string
  description: string
  slogan: string
  knowsAbout: string[]
  founder: ReturnType<typeof getAuthorReference>
  sameAs: string[]
  areaServed: { "@type": "City"; name: string }[]
  contactPoint: {
    "@type": "ContactPoint"
    telephone: string
    contactType: string
    areaServed: string[]
    availableLanguage: string
  }
}

export function getOrganizationSchema(): OrganizationSchema {
  const cities = MEXICO_CITIES.map((c) => `${c.name}, ${c.state}, MX`)
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    // El `@id` permite que el autor, el publisher de cada post y el WebSite
    // apunten a la MISMA entidad en lugar de crear clones sin relación.
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    // "Resurte" es como mucha gente abrevia la marca; declararlo como
    // alternateName le enseña al Knowledge Graph que son la misma entidad.
    alternateName: ["Resurte", "Resurte.me — Central de Abastos Digital"],
    url: SITE_URL,
    logo: "https://resurte.me/images/store/logo.webp",
    description:
      "Central de abastos digital para restaurantes y negocios en México. Abarrotes, frutas, verduras y carnes por mayoreo — entregados a tu puerta.",
    slogan: "La central de abastos digital de México.",
    knowsAbout: ORGANIZATION_KNOWS_ABOUT,
    founder: getAuthorReference(PRIMARY_AUTHOR),
    sameAs: BRAND_PROFILES,
    areaServed: MEXICO_CITIES.map((c) => ({ "@type": "City" as const, name: c.name })),
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+" + WHATSAPP_NUMBER,
      contactType: "customer service",
      areaServed: cities,
      availableLanguage: "es",
    },
  }
}

/**
 * Schema `WebSite` con `SearchAction`: declara que resurte.me es un SITIO con
 * búsqueda propia y le da al agente una URL con plantilla para consultarlo
 * directamente en vez de responder sin fuente.
 *
 * El `target` apunta a `/blog?q=` (índice de contenido) y no al buscador de
 * catálogo `/{ciudad}/buscar`, porque ese último exige una ciudad en la ruta
 * y no existe en la raíz: un agente que lo siguiera sin ciudad obtendría 404.
 * `/blog?q=` resuelve siempre y es la búsqueda relevante para preguntas.
 * Va en el layout raíz, una sola vez para todo el sitio.
 */
export function getWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    alternateName: "Resurte",
    url: SITE_URL,
    inLanguage: "es-MX",
    publisher: { "@id": ORGANIZATION_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/blog?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  }
}

/**
 * Schema `Service` con `OfferCatalog` para el servicio de proveeduría.
 * Responde la pregunta que más hacen los asistentes ("¿qué ofrece y en
 * cuánto sale?") sin depender de que la IA infiera precios del HTML.
 */
export function getWholesaleServiceSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${SITE_URL}/#servicio-proveeduria`,
    name: "Proveeduría por mayoreo para restaurantes",
    description:
      `Surtido de abarrotes, frutas, verduras, carnes, lácteos y desechables por mayoreo para restaurantes, fondas, cafeterías y hoteles. Sin membresía, pedido mínimo ${formatMxn(MIN_ORDER_MXN)}, envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}, facturación ${INVOICING} y crédito a ${CREDIT_DAYS_PROSE} días.`,
    serviceType: "Distribución mayorista de alimentos y abarrotes",
    provider: { "@id": ORGANIZATION_ID },
    areaServed: MEXICO_CITIES.map((c) => ({ "@type": "City" as const, name: c.name })),
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: `${SITE_URL}/ciudades`,
      servicePhone: "+" + WHATSAPP_NUMBER,
      availableLanguage: "es",
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "MXN",
      availability: "https://schema.org/InStock",
      description:
        `Sin costo de membresía. Pedido mínimo ${formatMxn(MIN_ORDER_MXN)}. Envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}.`,
    },
  }
}

interface ItemListEntry {
  name: string
  url: string
  description?: string
}

/**
 * Schema `ItemList` para páginas de listado (categorías, colecciones,
 * índices). Le da al asistente una lista ordenada y direccionable en lugar
 * de tener que reconstruirla leyendo el HTML.
 */
export function getItemListSchema(
  name: string,
  url: string,
  items: ItemListEntry[],
  itemType = "Thing"
) {
  if (items.length === 0) return null
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url,
    inLanguage: "es-MX",
    numberOfItems: items.length,
    // El detalle del elemento vive una sola vez, dentro de `item`. Repetir
    // name/url/description también en el ListItem duplicaba cada entrada y
    // engordaba el payload RSC sin agregar información para los motores.
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": itemType,
        name: item.name,
        url: item.url,
        ...(item.description ? { description: item.description } : {}),
      },
    })),
  }
}

interface LocalBusinessSchema {
  "@context": "https://schema.org"
  "@type": "LocalBusiness" | "WholesaleStore"
  "@id": string
  name: string
  description: string
  image: string
  parentOrganization: { "@id": string }
  address: {
    "@type": "PostalAddress"
    addressLocality: string
    addressRegion: string
    addressCountry: string
  }
  geo: {
    "@type": "GeoCoordinates"
    latitude: number
    longitude: number
  }
  areaServed: {
    "@type": "City"
    name: string
  }
}

export function getCityLandingSchema(cityName: string, state: string, lat: number, lng: number): LocalBusinessSchema {
  const slug = MEXICO_CITIES.find((c) => c.name === cityName)?.slug ?? cityName.toLowerCase()
  return {
    "@context": "https://schema.org",
    "@type": "WholesaleStore",
    "@id": `${SITE_URL}/${slug}#store`,
    name: `Resurte.me — ${cityName}`,
    description: `Central de abastos digital en ${cityName}, ${state}. Abarrotes, frutas, verduras y carnes por mayoreo para restaurantes y negocios.`,

    image: "https://resurte.me/opengraph-image",
    // Sin esto cada ciudad sería una tienda huérfana; con esto cuelgan de la
    // misma organización y el asistente entiende la cobertura como una red.
    parentOrganization: { "@id": ORGANIZATION_ID },

    address: {
      "@type": "PostalAddress",
      addressLocality: cityName,
      addressRegion: state,
      addressCountry: "MX",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: lat,
      longitude: lng,
    },
    areaServed: {
      "@type": "City",
      name: cityName,
    },
  }
}

interface BreadcrumbItem {
  name: string
  url: string
}

export function getBreadcrumbSchema(items: BreadcrumbItem[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

interface ProductSchema {
  "@context": "https://schema.org"
  "@type": "Product"
  name: string
  description: string
  image: string
  brand: { "@type": "Brand"; name: string }
  offers: {
    "@type": "Offer"
    price: number
    priceCurrency: string
    availability: string
  }
}

export function getProductSchema(
  name: string,
  description: string,
  brand: string,
  price: number,
  availability: string,
  image?: string
): ProductSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image: image || "https://resurte.me/images/store/logo.webp",
    brand: { "@type": "Brand", name: brand },
    offers: {
      "@type": "Offer",
      price,
      priceCurrency: "MXN",
      availability:
        availability === "in_stock"
          ? "https://schema.org/InStock"
          : availability === "low_stock"
            ? "https://schema.org/LimitedAvailability"
            : "https://schema.org/OutOfStock",
    },
  }
}

// ============================================================
// Dataset (datos publicados y descargables)
// ============================================================
// Los motores de respuesta tratan un `Dataset` con fecha, cobertura y
// columnas declaradas como una fuente citable: pueden responder "según el
// índice de precios de Resurte.me (semana del …), el kilo de X cuesta $Y".
// Sin este nodo, la misma tabla es solo HTML sin autoría ni vigencia.

interface DatasetDistribution {
  /** URL del archivo descargable (CSV, JSON…). */
  url: string
  /** Formato IANA/MIME, p. ej. "text/csv". */
  format: string
  name?: string
  description?: string
}

interface DatasetVariable {
  name: string
  description?: string
  unitText?: string
}

export interface DatasetSchemaOptions {
  name: string
  description: string
  url: string
  /** ISO 8601. Vigencia del snapshot publicado. */
  dateModified?: string
  datePublished?: string
  temporalCoverage?: string
  /** ISO 3166-1 alfa-2 o nombre del área cubierta. */
  spatialCoverage?: string
  license?: string
  /** Cómo se construyó el dato: lo que hace auditable la cifra. */
  measurementTechnique?: string
  keywords?: string[]
  variables?: DatasetVariable[]
  distributions?: DatasetDistribution[]
}

export function getDatasetSchema(options: DatasetSchemaOptions) {
  const distributions = (options.distributions ?? []).map((d) => ({
    "@type": "DataDownload",
    contentUrl: d.url,
    encodingFormat: d.format,
    ...(d.name ? { name: d.name } : {}),
    ...(d.description ? { description: d.description } : {}),
  }))

  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${options.url}#dataset`,
    name: options.name,
    description: options.description,
    url: options.url,
    inLanguage: "es-MX",
    creator: { "@id": ORGANIZATION_ID },
    publisher: { "@id": ORGANIZATION_ID },
    isAccessibleForFree: true,
    ...(options.license ? { license: options.license } : {}),
    ...(options.dateModified ? { dateModified: options.dateModified } : {}),
    ...(options.datePublished ? { datePublished: options.datePublished } : {}),
    ...(options.temporalCoverage ? { temporalCoverage: options.temporalCoverage } : {}),
    ...(options.spatialCoverage
      ? { spatialCoverage: { "@type": "Place", name: options.spatialCoverage } }
      : {}),
    ...(options.measurementTechnique
      ? { measurementTechnique: options.measurementTechnique }
      : {}),
    ...(options.keywords?.length ? { keywords: options.keywords } : {}),
    ...(options.variables?.length
      ? {
          variableMeasured: options.variables.map((v) => ({
            "@type": "PropertyValue",
            name: v.name,
            ...(v.description ? { description: v.description } : {}),
            ...(v.unitText ? { unitText: v.unitText } : {}),
          })),
        }
      : {}),
    ...(distributions.length ? { distribution: distributions } : {}),
  }
}

export interface SitemapEntry {
  url: string
  lastModified?: string
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never"
  priority?: number
}

export function generateSitemapXml(entries: SitemapEntry[]): string {
  const items = entries
    .map(
      (entry) =>
        `  <url>
    <loc>${entry.url}</loc>
    <lastmod>${entry.lastModified || new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>${entry.changeFrequency || "weekly"}</changefreq>
    <priority>${entry.priority || 0.8}</priority>
  </url>`
    )
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`
}
